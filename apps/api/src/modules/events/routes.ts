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
import { buildActivity, scopeEvents } from "./event-scope.js";
import { isTaxableCategory } from "../tax/taxable-category.js";
import { filterVisibleEvents, hasCompanyWideEventAccess } from "./visibility.js";
import type { ApiRequest } from "../../types.js";
import { query, withTransaction } from "../../db/client.js";
import { toDateOnly } from "../../db/date-column.js";
import { listCompanyDocuments } from "../documents/routes.js";
import { listCompanyTaxItems } from "../tax/routes.js";
import {
  listCompanyVouchers
} from "../vouchers/voucher-queries.js";
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

  // 应税行为类别（V17 阶段二）：值域校验放在这里而不是 body schema，
  // 因为类别清单随政策走，写死在两处迟早漂移。
  //
  // **认不出就拒**，不静默存一个坏值——存进去之后税率判定会当它是「未确定」，
  // 用户以为标好了，实际底稿上是「税目待确认」，要到申报被拒才发现。
  if (body.taxableCategory != null && !isTaxableCategory(body.taxableCategory)) {
    return json(res, 400, {
      error: `认不出的应税行为类别「${body.taxableCategory}」。请从系统提供的类别里选。`,
      code: "TAXABLE_CATEGORY_INVALID"
    });
  }

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
    // 税目口径的类别。null = 没标，税率判定回退到公司主营类别。
    taxableCategory: body.taxableCategory ?? null,
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
          taxable_category,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::numeric, $10, $11, $12, $13, $14, $15, $16, $17::timestamptz, $18::timestamptz)
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
        next.taxableCategory,
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
  // 改类别时也要挡住认不出的值——理由同 createEvent：存进去之后
  // 税率判定会当它「未确定」，用户以为标好了，实际底稿上是「税目待确认」。
  const patch = req.body as { taxableCategory?: unknown };
  if (patch.taxableCategory != null && !isTaxableCategory(patch.taxableCategory)) {
    return json(res, 400, {
      error: `认不出的应税行为类别「${String(patch.taxableCategory)}」。请从系统提供的类别里选。`,
      code: "TAXABLE_CATEGORY_INVALID"
    });
  }

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
    // 没传等于**没改**，不等于清空：前端改标题时不会把类别一起发上来，
    // 当成清空的话改一次标题就把税目标注抹掉了。
    taxableCategory: body.taxableCategory ?? existing.taxableCategory,
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
          taxable_category = $7,
          updated_at = $8::timestamptz
        where id = $9 and company_id = $10
      `,
      [
        updated.title,
        updated.description,
        updated.department,
        updated.status,
        updated.amount,
        updated.occurredOn,
        updated.taxableCategory,
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
 * 分析路由拆到了 `analyze.routes.ts`，这里保留出口。
 *
 * 不是为了省事：`events/routes.js` 是这个模块对外的聚合出口，
 * 多处动态 `import("./routes.js")` 按名字取 `analyzeEvent`——
 * 搬走而不保留出口，它们会在运行时取到 undefined，而 tsc 查不出来。
 * V17 阶段一拆纳税人档案时就踩过这个。
 */
export { analyzeEvent } from "./analyze.routes.js";
// scopeEvents 有模块外的引用，出口保留在聚合点上。
export { scopeEvents } from "./event-scope.js";
