import type { ServerResponse } from "node:http";
import type { PoolClient } from "pg";
import type {
  BusinessEvent,
  BusinessEventActivity,
  BusinessEventMappingBundle,
  BusinessEventRelation,
  ContractObjectLink,
  CreateBusinessEventInput,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  GeneratedDocument,
  Task,
  TaskTreeNode,
  TaxItem,
  Voucher,
  VoucherDraftLine
} from "@finance-taxation/domain-model";
import {
  BusinessEventActivityRow,
  BusinessEventRelationRow,
  EventDocumentMappingRow,
  EventTaxMappingRow,
  EventVoucherDraftRow,
  TaskRow,
  VoucherDraftLineRow,
  buildVoucherDrafts,
  mapActivityRow,
  mapDocumentMappingRow,
  mapRelationRow,
  mapTaskRow,
  mapTaxMappingRow,
  toIsoString
} from "./event-rows.js";
import {
  buildEventMappings,
  toGeneratedDocuments,
  toTaxItems,
  toVouchers
} from "./event-mappings.js";
import {
  insertActivities,
  insertContractObjectLinks,
  insertDocumentMappings,
  insertGeneratedDocuments,
  insertTasks,
  insertTaxItems,
  insertTaxMappings,
  insertVoucherDrafts,
  insertVouchers,
  listCompanyEvents
} from "./event-persistence.js";
import { loadCollaboratingEventIds } from "./collaborators.js";
import { filterVisibleEvents, hasCompanyWideEventAccess } from "./visibility.js";
import type { ApiRequest } from "../../types.js";
import { query, withTransaction } from "../../db/client.js";
import { toDateOnly } from "../../db/date-column.js";
import { listCompanyDocuments } from "../documents/routes.js";
import { listCompanyTaxItems } from "../tax/routes.js";
import { listCompanyVouchers } from "../vouchers/routes.js";
import { json } from "../../utils/http.js";
import { uniqueId } from "../../utils/id.js";
import { writeAudit } from "../../services/audit.js";
import { evaluateAnalyzeGuard, type AnalyzeGuardInput } from "./analyze-guard.js";
import { buildGeneratedTasksForEvent } from "./task-chain.js";
import { buildContractRevenueBundle } from "./contract-revenue-rules.js";
import { buildPurchaseExpenseBundle } from "./purchase-expense-rules.js";
import { buildTravelExpenseBundle } from "./travel-expense-rules.js";
import { buildContractObjectLinks } from "../contracts/links.js";
import { buildWorkflowRun } from "../workflows/commands.js";
import {
  ensureWorkflowRun,
  insertWorkflowTransition,
  updateWorkflowRunState
} from "../workflows/persistence.js";
import {
  buildWorkflowTransitionRecord,
  mapBusinessEventStatusToWorkflowState,
  validateWorkflowTransition
} from "../workflows/runtime.js";

export function hasCompanyWideAccess(roleCodes: string[]) {
  return hasCompanyWideEventAccess(roleCodes);
}

export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const nodeMap = new Map<string, TaskTreeNode>();
  for (const task of tasks) {
    nodeMap.set(task.id, { ...task, children: [] });
  }
  const roots: TaskTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentTaskId) {
      const parent = nodeMap.get(node.parentTaskId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }
  return roots;
}

/**
 * 事项可见性（V15/P1 收敛后）。
 *
 * 口径从「owner 或**同部门**」改成「owner 或**显式协作人**」——
 * 部门口径让财务部任何人看得到财务部每一条事项（含薪酬、补偿），
 * 而且是拿部门名字符串比的，改个部门名可见性就变了。
 *
 * 存量的部门可见关系由迁移 097 一次性固化成协作人，所以升级当天没人会
 * 突然看不到东西；变的是机制：此后新建的事项不再自动扩散给整个部门。
 *
 * 协作人集合必须由调用方查好传进来（`loadCollaboratingEventIds`）——
 * 让这个函数保持同步纯函数，才能被单测直接钉住。
 */
export function scopeEvents(
  rows: BusinessEvent[],
  req: ApiRequest,
  collaboratingEventIds: ReadonlySet<string>
) {
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  return filterVisibleEvents(
    companyRows,
    { userId: req.auth!.userId, roleCodes: req.auth!.roleCodes },
    collaboratingEventIds
  );
}

function buildActivity(
  req: ApiRequest,
  businessEventId: string,
  activityType: BusinessEventActivity["activityType"],
  summary: string
): BusinessEventActivity {
  return {
    id: `act-${businessEventId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    companyId: req.auth!.companyId,
    businessEventId,
    activityType,
    actorUserId: req.auth!.userId,
    actorName: req.auth!.username,
    summary,
    createdAt: new Date().toISOString()
  };
}

export function handleEventsMeta(_req: ApiRequest, res: ServerResponse) {
  return json(res, 200, {
    module: "events",
    plannedEndpoints: [
      "GET /api/events",
      "POST /api/events",
      "GET /api/events/:id",
      "PUT /api/events/:id",
      "POST /api/events/:id/analyze",
      "POST /api/events/:id/relations"
    ]
  });
}

export async function listEvents(req: ApiRequest, res: ServerResponse) {
  const [rows, collaborating] = await Promise.all([
    listCompanyEvents(req.auth!.companyId),
    loadCollaboratingEventIds(req.auth!.companyId, req.auth!.userId)
  ]);
  const scoped = scopeEvents(rows, req, collaborating);
  return json(res, 200, { items: scoped, total: scoped.length });
}

export async function createEvent(req: ApiRequest, res: ServerResponse) {
  const body = req.body as CreateBusinessEventInput;
  const now = new Date().toISOString();
  const next: BusinessEvent = {
    id: uniqueId("evt"),
    companyId: req.auth!.companyId,
    type: body.type,
    title: body.title,
    // description/department/source 在表上是 NOT NULL 但有默认值；直传 undefined
    // 会被驱动写成 NULL 而撞约束（表现为 500）。这三项对用户是选填，故在此兜底
    // 补上与建表默认值一致的空串/占位，让「不填」真的等于「用默认」。
    description: body.description ?? "",
    department: body.department ?? "",
    ownerId: req.auth!.userId,
    occurredOn: body.occurredOn,
    amount: body.amount,
    currency: body.currency || "CNY",
    status: "draft",
    source: body.source ?? "manual",
    contractId: body.contractId ?? null,
    // 往来单位（V12-C2 补齐）。此前这里硬编码成 null —— 凭证的 attachCounterparty
    // 从事项继承这个维度，事项没有它就等于整条往来链路（账龄、核销）都是空的。
    counterpartyId: body.counterpartyId ?? null,
    projectId: null,
    createdAt: now,
    updatedAt: now
  };
  const activity = buildActivity(req, next.id, "created", `创建经营事项：${next.title}`);

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into business_events (
          id,
          company_id,
          type,
          title,
          description,
          department,
          owner_id,
          occurred_on,
          amount,
          currency,
          status,
          source,
          contract_id,
          counterparty_id,
          project_id,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::numeric, $10, $11, $12, $13, $14, $15, $16::timestamptz, $17::timestamptz)
      `,
      [
        next.id,
        next.companyId,
        next.type,
        next.title,
        next.description,
        next.department,
        next.ownerId,
        next.occurredOn,
        next.amount,
        next.currency,
        next.status,
        next.source,
        next.contractId,
        next.counterpartyId,
        next.projectId,
        next.createdAt,
        next.updatedAt
      ]
    );
    await insertActivities(client, [activity]);
    await ensureWorkflowRun(
      client,
      buildWorkflowRun({
        companyId: next.companyId,
        workflowKey: "business_event.lifecycle",
        resourceType: "business_event",
        resourceId: next.id,
        resourceLabel: next.title,
        currentState: "draft",
        initiatorUserId: req.auth!.userId,
        initiatorName: req.auth!.username
      })
    );
  });

  writeAudit({
    companyId: next.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "create",
    resourceType: "business_event",
    resourceId: next.id,
    resourceLabel: next.title,
    changes: { data: { type: next.type, status: next.status, amount: next.amount } }
  });

  return json(res, 201, next);
}

export async function getEventDetail(req: ApiRequest, res: ServerResponse, eventId: string) {
  const [companyEvents, collaborating] = await Promise.all([
    listCompanyEvents(req.auth!.companyId),
    loadCollaboratingEventIds(req.auth!.companyId, req.auth!.userId)
  ]);
  const event = scopeEvents(companyEvents, req, collaborating).find((row) => row.id === eventId);
  if (!event) {
    return json(res, 404, { error: "Event not found" });
  }

  const [relationRows, taskRows, activityRows, documentMappingRows, taxMappingRows, voucherDraftRows, voucherLineRows, documents, taxItems, vouchers] =
    await Promise.all([
      query<BusinessEventRelationRow>(
        `
          select id, company_id, business_event_id, relation_type, target_id, label, created_at
          from business_event_relations
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<TaskRow>(
        `
          select
            id, company_id, business_event_id, parent_task_id, title, description,
            status, priority, owner_id, due_at, assignee_department, source, created_at, updated_at
          from tasks
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<BusinessEventActivityRow>(
        `
          select
            id, company_id, business_event_id, activity_type, actor_user_id, actor_name, summary, created_at
          from business_event_activities
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<EventDocumentMappingRow>(
        `
          select
            id, company_id, business_event_id, document_type, title, status, owner_department, notes, created_at
          from event_document_mappings
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<EventTaxMappingRow>(
        `
          select
            id, company_id, business_event_id, tax_type, treatment, status, basis, filing_period, created_at
          from event_tax_mappings
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<EventVoucherDraftRow>(
        `
          select
            id, company_id, business_event_id, voucher_type, status, summary, created_at
          from event_voucher_drafts
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<VoucherDraftLineRow>(
        `
          select
            l.id, l.draft_id, l.summary, l.account_code, l.account_name, l.debit, l.credit, l.sort_order
          from voucher_draft_lines l
          join event_voucher_drafts d on d.id = l.draft_id
          where d.company_id = $1 and d.business_event_id = $2
          order by l.sort_order asc
        `,
        [req.auth!.companyId, event.id]
      ),
      listCompanyDocuments(req.auth!.companyId, { businessEventId: event.id }),
      listCompanyTaxItems(req.auth!.companyId, { businessEventId: event.id }),
      listCompanyVouchers(req.auth!.companyId, { businessEventId: event.id })
    ]);

  const tasks = taskRows.map(mapTaskRow);
  const documentMappings = documentMappingRows.map(mapDocumentMappingRow);
  const taxMappings = taxMappingRows.map(mapTaxMappingRow);
  const voucherDrafts = buildVoucherDrafts(voucherDraftRows, voucherLineRows);
  const mappingTimes = [
    ...documentMappingRows.map((row) => toIsoString(row.created_at)),
    ...taxMappingRows.map((row) => toIsoString(row.created_at)),
    ...voucherDraftRows.map((row) => toIsoString(row.created_at))
  ].filter(Boolean) as string[];
  const mappingGeneratedAt = mappingTimes.sort().at(-1) || "";

  return json(res, 200, {
    ...event,
    relations: relationRows.map(mapRelationRow),
    tasks,
    taskTree: buildTaskTree(tasks),
    documentMappings,
    taxMappings,
    voucherDrafts,
    generatedDocuments: documents,
    taxItems,
    vouchers,
    mappingGeneratedAt,
    activities: activityRows.map(mapActivityRow)
  });
}

export async function updateEvent(req: ApiRequest, res: ServerResponse, eventId: string) {
  const [companyEvents, collaborating] = await Promise.all([
    listCompanyEvents(req.auth!.companyId),
    loadCollaboratingEventIds(req.auth!.companyId, req.auth!.userId)
  ]);
  const existing = scopeEvents(companyEvents, req, collaborating).find((row) => row.id === eventId);
  if (!existing) {
    return json(res, 404, { error: "Event not found" });
  }

  const body = (req.body || {}) as Partial<BusinessEvent>;
  const updated: BusinessEvent = {
    ...existing,
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    department: body.department ?? existing.department,
    status: body.status ?? existing.status,
    amount: body.amount ?? existing.amount,
    occurredOn: body.occurredOn ?? existing.occurredOn,
    updatedAt: new Date().toISOString()
  };

  const activities = [
    buildActivity(req, updated.id, "updated", `更新经营事项：${updated.title}`)
  ];
  let workflowTransition: { previousState: ReturnType<typeof mapBusinessEventStatusToWorkflowState>; nextState: ReturnType<typeof mapBusinessEventStatusToWorkflowState> } | null = null;
  if (existing.status !== updated.status) {
    const previousState = mapBusinessEventStatusToWorkflowState(existing.status);
    const nextState = mapBusinessEventStatusToWorkflowState(updated.status);
    const validation = validateWorkflowTransition(previousState, nextState);
    if (!validation.ok) {
      return json(res, 400, { error: validation.message, code: validation.errorCode });
    }
    workflowTransition = { previousState, nextState };
  }
  if (existing.status !== updated.status) {
    activities.unshift(
      buildActivity(
        req,
        updated.id,
        "status_changed",
        `状态变更：${existing.status} -> ${updated.status}`
      )
    );
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        update business_events
        set
          title = $1,
          description = $2,
          department = $3,
          status = $4,
          amount = $5::numeric,
          occurred_on = $6::date,
          updated_at = $7::timestamptz
        where id = $8 and company_id = $9
      `,
      [
        updated.title,
        updated.description,
        updated.department,
        updated.status,
        updated.amount,
        updated.occurredOn,
        updated.updatedAt,
        updated.id,
        updated.companyId
      ]
    );
    await insertActivities(client, activities);
    if (workflowTransition) {
      const run = await ensureWorkflowRun(
        client,
        buildWorkflowRun({
          companyId: updated.companyId,
          workflowKey: "business_event.lifecycle",
          resourceType: "business_event",
          resourceId: updated.id,
          resourceLabel: updated.title,
          currentState: workflowTransition.previousState,
          initiatorUserId: req.auth!.userId,
          initiatorName: req.auth!.username
        })
      );
      const transition = buildWorkflowTransitionRecord({
        companyId: updated.companyId,
        workflowRunId: run.id,
        resourceType: "business_event",
        resourceId: updated.id,
        previousState: workflowTransition.previousState,
        nextState: workflowTransition.nextState,
        actorUserId: req.auth!.userId,
        actorName: req.auth!.username,
        basis: `business_event.status:${existing.status}->${updated.status}`,
        ruleVersion: "v4-1a"
      });
      await insertWorkflowTransition(client, transition);
      await updateWorkflowRunState(
        client,
        run.id,
        workflowTransition.nextState,
        workflowTransition.nextState === "blocked" ? `event:${updated.id}` : null,
        transition.occurredAt
      );
    }
  });

  writeAudit({
    companyId: updated.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: existing.status !== updated.status ? "update_status" : "update",
    resourceType: "business_event",
    resourceId: updated.id,
    resourceLabel: updated.title,
    changes: {
      before: { status: existing.status, title: existing.title },
      after: { status: updated.status, title: updated.title }
    }
  });

  return json(res, 200, updated);
}

/**
 * analyze 的每一条出口都要留痕：此前该路由删除已入账分录时完全无审计记录，
 * 事后无法回答"谁在什么时候抹掉了哪些账"。
 */
function auditAnalyze(
  req: ApiRequest,
  eventId: string,
  action: string,
  changes: Record<string, unknown>
): void {
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action,
    resourceType: "business_event",
    resourceId: eventId,
    changes
  });
}

/**
 * 读取 analyze 闸门所需的两项事实：该事项下已过账的凭证，以及该事项分录落在
 * 哪些已锁账期间。
 *
 * 必须在**将要执行删除的同一个事务里**调用：
 * - 凭证行整批 `for update`（不只锁 posted 的那些）。只锁 posted 会留下竞态——
 *   并发的 `postVoucher` 改的是当时还是 draft 的行，不在锁集合内，就能在"检查"
 *   与"删除"之间把它变成 posted。锁全量后并发过账会阻塞到本事务结束。
 * - 期间同样用本事务的连接查，不走 `isPeriodLocked` 的全局连接池。
 *
 * 期间按 `ledger_entries.entry_date` 在库内 `to_char` 成期——不能沿用过账路径
 * `isPeriodLocked(companyId, 当前月)` 的"当前月"口径，否则跨月重新分析会绕过
 * 锁账；在 SQL 内成期也避开了 `date` 列经 JS `Date` 往返的时区偏移。
 */
async function loadAnalyzeGuardInput(
  client: PoolClient,
  companyId: string,
  eventId: string
): Promise<AnalyzeGuardInput> {
  // `reversed_by` 反查这张凭证有没有被红冲过。已被红冲的凭证账务影响已归零，
  // 不该再拦着重新分析——否则红冲做完了事项依然是死路，等于没有出口。
  const voucherResult = await client.query<{ id: string; status: string; reversed_by: string | null }>(
    `
      select
        v.id,
        v.status,
        (
          select r.id from vouchers r
          where r.company_id = v.company_id
            and r.reverses_voucher_id = v.id
            and r.status = 'posted'
          limit 1
        ) as reversed_by
      from vouchers v
      where v.company_id = $1 and v.business_event_id = $2
      order by v.id
      for update
    `,
    [companyId, eventId]
  );

  const periodResult = await client.query<{ period: string }>(
    `
      select distinct to_char(entry_date, 'YYYY-MM') as period
      from ledger_entries
      where company_id = $1 and business_event_id = $2
      order by 1
    `,
    [companyId, eventId]
  );
  const periods = periodResult.rows.map((row) => row.period);

  const lockedResult = periods.length
    ? await client.query<{ period: string }>(
        `
          select period
          from accounting_periods
          where company_id = $1 and period = any($2::text[]) and is_locked
          order by period
        `,
        [companyId, periods]
      )
    : { rows: [] as { period: string }[] };

  return {
    // 只有**未被红冲**的已过账凭证才构成阻断：红冲凭证自身也要过账，
    // 冲销完成后原凭证的账务影响已归零，再拦就没有出口了。
    postedVoucherIds: voucherResult.rows
      .filter((row) => row.status === "posted" && !row.reversed_by)
      .map((row) => row.id),
    lockedPeriods: lockedResult.rows.map((row) => row.period)
  };
}

export async function analyzeEvent(req: ApiRequest, res: ServerResponse, eventId: string) {
  const [companyEvents, collaborating] = await Promise.all([
    listCompanyEvents(req.auth!.companyId),
    loadCollaboratingEventIds(req.auth!.companyId, req.auth!.userId)
  ]);
  const target = scopeEvents(companyEvents, req, collaborating).find((row) => row.id === eventId);
  if (!target) {
    // 越权/探测同样留痕：调用方持有 events.create，但该事项不在其可见范围内。
    auditAnalyze(req, eventId, "event.analyze.denied", { reason: "not_found_or_out_of_scope" });
    return json(res, 404, { error: "Event not found" });
  }

  const now = new Date().toISOString();
  const generatedTasks: Task[] = buildGeneratedTasksForEvent({
    event: target,
    now,
    actorUserId: req.auth!.userId
  });

  const analyzedEvent: BusinessEvent = {
    ...target,
    status: "analyzed",
    updatedAt: now
  };
  const bundle = buildEventMappings(analyzedEvent);

  const nextDocuments = [
    ...toGeneratedDocuments(bundle, now)
  ];
  const nextTaxItems = [
    ...toTaxItems(bundle, now)
  ];
  const nextVouchers = [
    ...toVouchers(bundle, now, analyzedEvent.occurredOn)
  ];
  const contractObjectLinks = analyzedEvent.contractId
    ? buildContractObjectLinks({
        companyId: analyzedEvent.companyId,
        contractId: analyzedEvent.contractId,
        businessEventId: analyzedEvent.id,
        tasks: generatedTasks,
        documents: nextDocuments,
        taxItems: nextTaxItems,
        vouchers: nextVouchers
      })
    : [];

  const analysisActivities = [
    buildActivity(
      req,
      eventId,
      "task_generated",
      `自动生成 ${generatedTasks.length} 个任务，并同步 ${nextDocuments.length} 份单据、${nextTaxItems.length} 条税务事项、${nextVouchers.length} 张凭证草稿。`
    ),
    buildActivity(req, eventId, "analyzed", "完成事项分析并输出执行建议。")
  ];
  const previousState = mapBusinessEventStatusToWorkflowState(target.status);
  const nextState = mapBusinessEventStatusToWorkflowState(analyzedEvent.status);
  const analysisTransitionValidation = validateWorkflowTransition(previousState, nextState);
  if (!analysisTransitionValidation.ok) {
    auditAnalyze(req, eventId, "event.analyze.blocked", {
      code: analysisTransitionValidation.errorCode,
      previousState,
      nextState
    });
    return json(res, 400, { error: analysisTransitionValidation.message, code: analysisTransitionValidation.errorCode });
  }

  // 已入账的账务不可被"重新分析"顺手删掉：只能红冲，且锁账期间一律拒绝。
  // 闸门放在事务内、且在任何删除之前——先锁住凭证行再判定，检查结果才不会在
  // 检查与删除之间过期。裁决为拒绝时直接返回，事务不做任何写入。
  const guard = await withTransaction(async (client) => {
    const verdict = evaluateAnalyzeGuard(
      await loadAnalyzeGuardInput(client, target.companyId, target.id)
    );
    if (!verdict.allowed) {
      return verdict;
    }

    await client.query(
      `
        update business_events
        set status = 'analyzed', updated_at = $1::timestamptz
        where id = $2 and company_id = $3
      `,
      [now, target.id, target.companyId]
    );

    await client.query(
      `
        delete from tasks
        where company_id = $1 and business_event_id = $2 and source = 'ai'
      `,
      [target.companyId, target.id]
    );
    await insertTasks(client, generatedTasks);

    await client.query(
      `
        delete from document_attachment_records
        where document_id in (
          select id from generated_documents
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from generated_documents
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from tax_filing_batch_items
        where tax_item_id in (
          select id from tax_items
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from tax_items
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from ledger_posting_batch_entries
        where batch_id in (
          select id from ledger_posting_batches
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from ledger_posting_batches
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from ledger_entries
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from voucher_posting_records
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from voucher_lines
        where voucher_id in (
          select id from vouchers
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from vouchers
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from contract_object_links
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    // Mapping tables are deleted last: generated_documents.mapping_id,
    // tax_items.mapping_id and vouchers.mapping_id all reference them, so a
    // re-analyze must remove those children first or the FK constraints abort
    // the transaction (surfaced as analyze 500 on already-analyzed events).
    await client.query(
      `
        delete from voucher_draft_lines
        where draft_id in (
          select id from event_voucher_drafts
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from event_voucher_drafts
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from event_document_mappings
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from event_tax_mappings
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );

    await insertDocumentMappings(client, bundle.documentMappings);
    await insertTaxMappings(client, bundle.taxMappings);
    await insertVoucherDrafts(client, bundle.voucherDrafts);
    await insertGeneratedDocuments(client, nextDocuments);
    await insertTaxItems(client, nextTaxItems);
    await insertVouchers(client, nextVouchers);
    await insertContractObjectLinks(client, contractObjectLinks);
    await insertActivities(client, analysisActivities);
    const run = await ensureWorkflowRun(
      client,
      buildWorkflowRun({
        companyId: analyzedEvent.companyId,
        workflowKey: "business_event.lifecycle",
        resourceType: "business_event",
        resourceId: analyzedEvent.id,
        resourceLabel: analyzedEvent.title,
        currentState: previousState,
        initiatorUserId: req.auth!.userId,
        initiatorName: req.auth!.username
      })
    );
    const transition = buildWorkflowTransitionRecord({
      companyId: analyzedEvent.companyId,
      workflowRunId: run.id,
      resourceType: "business_event",
      resourceId: analyzedEvent.id,
      previousState,
      nextState,
      actorUserId: req.auth!.userId,
      actorName: req.auth!.username,
      basis: "event.analyze",
      ruleVersion: "v4-1a"
    });
    await insertWorkflowTransition(client, transition);
    await updateWorkflowRunState(client, run.id, nextState, null, transition.occurredAt);
    return { allowed: true } as const;
  });

  if (!guard.allowed) {
    auditAnalyze(req, eventId, "event.analyze.blocked", {
      code: guard.code,
      postedVoucherIds: guard.postedVoucherIds,
      lockedPeriods: guard.lockedPeriods
    });
    return json(res, 409, { error: guard.message, code: guard.code });
  }

  auditAnalyze(req, eventId, "event.analyze", {
    previousStatus: target.status,
    generatedTasks: generatedTasks.length,
    generatedDocuments: nextDocuments.length,
    taxItems: nextTaxItems.length,
    vouchers: nextVouchers.length
  });

  // 单据与税务事项的诞生点。上面那条 event.analyze 只记了个数，回答不了
  // 「这份单据是哪次分析生出来的」——而 /audit 的单据/税务事项深链恰恰是按
  // resourceType=document|tax_item + 对象编号来查的（见 apps/web/src/pages/
  // drilldown.ts 的 resolveAuditContextFromState），不逐条留痕那两个深链永远是空。
  //
  // 对象 id 是确定性的（doc-<eventId>-<type> / tax-item-<eventId>-<taxType>），
  // 重新分析会删旧建新、id 不变，所以这里如实记成又一次 created：
  // 同一个 id 上的多条 created 就是「这个对象被重建过几次」，本身即事实。
  for (const document of nextDocuments) {
    writeAudit({
      companyId: analyzedEvent.companyId,
      userId: req.auth!.userId,
      userName: req.auth!.username,
      action: "document.created",
      resourceType: "document",
      resourceId: document.id,
      resourceLabel: document.title,
      changes: {
        data: {
          businessEventId: document.businessEventId,
          documentType: document.documentType,
          ownerDepartment: document.ownerDepartment,
          status: document.status
        }
      }
    });
  }
  for (const taxItem of nextTaxItems) {
    writeAudit({
      companyId: analyzedEvent.companyId,
      userId: req.auth!.userId,
      userName: req.auth!.username,
      action: "tax_item.created",
      resourceType: "tax_item",
      resourceId: taxItem.id,
      resourceLabel: `${taxItem.taxType} ${taxItem.filingPeriod}`,
      changes: {
        data: {
          businessEventId: taxItem.businessEventId,
          taxType: taxItem.taxType,
          treatment: taxItem.treatment,
          filingPeriod: taxItem.filingPeriod,
          status: taxItem.status
        }
      }
    });
  }

  return json(res, 200, {
    eventId,
    generatedTasks: generatedTasks.length,
    status: "analyzed"
  });
}
