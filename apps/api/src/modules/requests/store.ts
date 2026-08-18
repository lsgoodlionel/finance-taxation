/**
 * 申请单的读写与状态流转（V13-B1/B2）。
 *
 * 状态机在 `lifecycle.ts`（纯函数），这里负责取数、落库，以及**状态变更时
 * 的连带动作**——那才是这个模块真正复杂的地方：
 *
 * - `approve` → 占用预算 + 派生业务事项
 * - `complete` → 占用转实际
 * - `cancel` / `reject` → 释放占用
 *
 * 三者都要幂等。审批接口被重复调用（网络重试、用户连点）在生产里是常态，
 * 而「占两遍预算」和「派生两条事项」都不会自己报错。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { findApplicableBudgets } from "../budget/queries.js";
import { reserveBudget, transitionEncumbrance } from "../budget/budget-store.js";
import {
  canEdit,
  nextStatus,
  type RequestAction,
  type RequestStatus,
  type RequestType
} from "./lifecycle.js";

export interface RequestRow {
  id: string;
  companyId: string;
  requestNo: string;
  requestType: RequestType;
  title: string;
  purpose: string;
  amountCents: number;
  currency: string;
  costCenterId: string | null;
  accountCode: string | null;
  expectedDate: string;
  status: RequestStatus;
  requesterUserId: string;
  businessEventId: string | null;
  note: string | null;
}

export type RequestFailureCode =
  | "REQUEST_NOT_FOUND"
  | "REQUEST_AMOUNT_INVALID"
  | "REQUEST_DATE_INVALID"
  | "REQUEST_NOT_EDITABLE"
  | "REQUEST_INVALID_TRANSITION"
  | "REQUEST_BUDGET_BLOCKED"
  | "REQUEST_NOT_OWNER";

export type RequestResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: RequestFailureCode; message: string } };

interface RequestDbRow {
  id: string;
  company_id: string;
  request_no: string;
  request_type: RequestType;
  title: string;
  purpose: string;
  amount_cents: string;
  currency: string;
  cost_center_id: string | null;
  account_code: string | null;
  expected_date: string | Date;
  status: RequestStatus;
  requester_user_id: string;
  business_event_id: string | null;
  note: string | null;
}

/** date 列经驱动可能是 Date 也可能是字符串，统一成 YYYY-MM-DD。 */
function asDateString(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapRow(row: RequestDbRow): RequestRow {
  return {
    id: row.id,
    companyId: row.company_id,
    requestNo: row.request_no,
    requestType: row.request_type,
    title: row.title,
    purpose: row.purpose,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    costCenterId: row.cost_center_id,
    accountCode: row.account_code,
    expectedDate: asDateString(row.expected_date),
    status: row.status,
    requesterUserId: row.requester_user_id,
    businessEventId: row.business_event_id,
    note: row.note
  };
}

const COLUMNS = `
  id, company_id, request_no, request_type, title, purpose, amount_cents, currency,
  cost_center_id, account_code, expected_date, status, requester_user_id,
  business_event_id, note
`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function getRequest(companyId: string, id: string): Promise<RequestRow | null> {
  const row = await queryOne<RequestDbRow>(
    `select ${COLUMNS} from requests where company_id = $1 and id = $2`,
    [companyId, id]
  );
  return row ? mapRow(row) : null;
}

export interface ListRequestsFilter {
  /** 只看某人发起的。「我的单据」页用它。 */
  requesterUserId?: string;
  status?: RequestStatus;
}

export async function listRequests(
  companyId: string,
  filter: ListRequestsFilter = {}
): Promise<RequestRow[]> {
  const conditions = ["company_id = $1"];
  const params: unknown[] = [companyId];

  if (filter.requesterUserId) {
    params.push(filter.requesterUserId);
    conditions.push(`requester_user_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }

  const rows = await query<RequestDbRow>(
    `select ${COLUMNS} from requests
      where ${conditions.join(" and ")}
      order by created_at desc`,
    params
  );
  return rows.map(mapRow);
}

/**
 * 生成单据号：`REQ-YYYYMM-NNNN`。
 *
 * 按月计数而不是全局递增：全局递增的号到第三年会变成六位数，人念不出来。
 * 计数在事务里用 count 算——并发下可能撞号，由 `uq_request_no` 唯一约束兜住，
 * 撞了就重试。**不用序列**：序列跨公司共享，会让 A 公司看到自己的单号跳号，
 * 而跳号在财务眼里等于「有单据被删了」。
 */
async function nextRequestNo(
  tx: { query: <T extends object>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  companyId: string,
  yearMonth: string
): Promise<string> {
  const prefix = `REQ-${yearMonth}-`;
  const rows = await tx.query<{ count: string }>(
    `select count(*) as count from requests
      where company_id = $1 and request_no like $2`,
    [companyId, `${prefix}%`]
  );
  const seq = Number(rows.rows[0]?.count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export interface CreateRequestInput {
  companyId: string;
  requestType: RequestType;
  title: string;
  purpose: string;
  amountCents: number;
  costCenterId: string | null;
  accountCode: string | null;
  expectedDate: string;
  requesterUserId: string;
  note: string | null;
}

export async function createRequest(
  input: CreateRequestInput
): Promise<RequestResult<RequestRow>> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return {
      ok: false,
      failure: { code: "REQUEST_AMOUNT_INVALID", message: "金额必须是非负整数分" }
    };
  }
  if (!DATE_PATTERN.test(input.expectedDate)) {
    return {
      ok: false,
      failure: { code: "REQUEST_DATE_INVALID", message: "预计发生日应形如 2026-06-15" }
    };
  }

  const id = `req-${randomUUID()}`;
  const row = await withTransaction(async (tx) => {
    const requestNo = await nextRequestNo(tx, input.companyId, input.expectedDate.slice(0, 7).replace("-", ""));
    const inserted = await tx.query<RequestDbRow>(
      `insert into requests
         (id, company_id, request_no, request_type, title, purpose, amount_cents,
          cost_center_id, account_code, expected_date, requester_user_id, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning ${COLUMNS}`,
      [
        id,
        input.companyId,
        requestNo,
        input.requestType,
        input.title,
        input.purpose,
        input.amountCents,
        input.costCenterId,
        input.accountCode,
        input.expectedDate,
        input.requesterUserId,
        input.note
      ]
    );
    return inserted.rows[0]!;
  });

  return { ok: true, value: mapRow(row) };
}

export interface UpdateRequestInput {
  title?: string;
  purpose?: string;
  amountCents?: number;
  costCenterId?: string | null;
  accountCode?: string | null;
  expectedDate?: string;
  note?: string | null;
}

/**
 * 修改申请单内容。
 *
 * 只有草稿与被驳回的能改——审批中还能改金额，等于审批人批的和最终生效的
 * 不是一个东西。
 */
export async function updateRequest(
  companyId: string,
  id: string,
  patch: UpdateRequestInput
): Promise<RequestResult<RequestRow>> {
  const current = await getRequest(companyId, id);
  if (!current) {
    return { ok: false, failure: { code: "REQUEST_NOT_FOUND", message: "申请单不存在" } };
  }
  if (!canEdit(current.status)) {
    return {
      ok: false,
      failure: {
        code: "REQUEST_NOT_EDITABLE",
        message: `「${current.status}」状态的申请单不能修改。如需变更请先撤回。`
      }
    };
  }
  if (patch.amountCents !== undefined && (!Number.isInteger(patch.amountCents) || patch.amountCents < 0)) {
    return {
      ok: false,
      failure: { code: "REQUEST_AMOUNT_INVALID", message: "金额必须是非负整数分" }
    };
  }
  if (patch.expectedDate !== undefined && !DATE_PATTERN.test(patch.expectedDate)) {
    return {
      ok: false,
      failure: { code: "REQUEST_DATE_INVALID", message: "预计发生日应形如 2026-06-15" }
    };
  }

  const row = await queryOne<RequestDbRow>(
    `update requests
        set title = coalesce($3, title),
            purpose = coalesce($4, purpose),
            amount_cents = coalesce($5, amount_cents),
            cost_center_id = $6,
            account_code = $7,
            expected_date = coalesce($8, expected_date),
            note = $9,
            updated_at = now()
      where company_id = $1 and id = $2
      returning ${COLUMNS}`,
    [
      companyId,
      id,
      patch.title ?? null,
      patch.purpose ?? null,
      patch.amountCents ?? null,
      // 这两个允许显式置空，所以不用 coalesce——undefined 时沿用原值。
      patch.costCenterId === undefined ? current.costCenterId : patch.costCenterId,
      patch.accountCode === undefined ? current.accountCode : patch.accountCode,
      patch.expectedDate ?? null,
      patch.note === undefined ? current.note : patch.note
    ]
  );
  return { ok: true, value: mapRow(row!) };
}

/** 一次状态流转连带的预算动作。 */
type EncumbranceEffect = "reserve" | "realize" | "release" | "none";

const EFFECT_BY_ACTION: Record<RequestAction, EncumbranceEffect> = {
  submit: "none",
  // 批准时占用：钱还没花，但已经不能给别人用了。
  approve: "reserve",
  // 报销完成时转实际：账上已有实际发生额，占用必须让位，否则算两遍。
  complete: "realize",
  reject: "release",
  cancel: "release"
};

/**
 * 派生业务事项。
 *
 * **幂等**：已经派生过就返回原来那条。审批接口重试时不能产生第二条事项——
 * 那会让同一件事在总线上出现两次，而其中一条永远没有票据。
 */
async function derivEventId(
  tx: { query: <T extends object>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  request: RequestRow
): Promise<string> {
  if (request.businessEventId) return request.businessEventId;

  const eventId = `evt-${randomUUID()}`;
  // `business_events` 没有 cost_center_id 列——成本中心是**凭证行**上的维度
  // （V12-D1 加在 voucher_lines / ledger_entries 上），录凭证时单独选。
  //
  // 于是申请单上的成本中心传不到凭证：做账的人要再选一次，而他未必知道
  // 申请人当初填的是哪个部门。反查路径是有的（requests.business_event_id
  // 指向本事项），但目前没有代码走这条路。**记入残留清单**，不在这里顺手
  // 给 business_events 加列——那会牵动事项的读写与前端，超出 B1 的范围。
  await tx.query(
    `insert into business_events
       (id, company_id, type, title, description, department, owner_id,
        occurred_on, amount, currency, status, source)
     values ($1, $2, $3, $4, $5, '', $6, $7, $8, $9, 'awaiting_documents', 'manual')`,
    [
      eventId,
      request.companyId,
      // 申请类型 → 事项类型。采购归 procurement，其余归 expense：事项类型是
      // 会计口径的分类，而「用款」在会计上就是一笔费用支出。
      request.requestType === "procurement" ? "procurement" : "expense",
      request.title,
      // 事由带进事项：审批人看的是事由，做账的人也该看得到。
      `${request.purpose}（来自申请单 ${request.requestNo}）`,
      request.requesterUserId,
      request.expectedDate,
      (request.amountCents / 100).toFixed(2),
      request.currency
    ]
  );
  return eventId;
}

export interface TransitionInput {
  companyId: string;
  id: string;
  action: RequestAction;
  /** 操作人。submit/cancel 只有发起人能做。 */
  actorUserId: string;
}

/**
 * 执行一次状态流转，连带处理预算占用与事项派生。
 *
 * 整个过程在一个事务里且对申请单加行锁——不加锁的话两个并发的 approve
 * 会双双读到 pending，各自占用一次预算。占用本身有唯一约束兜底（同一单据
 * 只有一条占用记录），但派生事项没有，会产生两条。
 */
export async function transitionRequest(
  input: TransitionInput
): Promise<RequestResult<RequestRow>> {
  return withTransaction(async (tx) => {
    const found = await tx.query<RequestDbRow>(
      `select ${COLUMNS} from requests where company_id = $1 and id = $2 for update`,
      [input.companyId, input.id]
    );
    const row = found.rows[0];
    if (!row) {
      return {
        ok: false as const,
        failure: { code: "REQUEST_NOT_FOUND" as const, message: "申请单不存在" }
      };
    }
    const current = mapRow(row);

    // 提交与撤回只有发起人能做。批准/驳回的判权在审批流那一侧，
    // 这里不重复判——两处各判一次迟早不一致。
    if ((input.action === "submit" || input.action === "cancel") &&
        current.requesterUserId !== input.actorUserId) {
      return {
        ok: false as const,
        failure: {
          code: "REQUEST_NOT_OWNER" as const,
          message: input.action === "submit" ? "只有发起人能提交" : "只有发起人能撤回"
        }
      };
    }

    let target: RequestStatus;
    try {
      target = nextStatus(current.status, input.action);
    } catch (error) {
      return {
        ok: false as const,
        failure: {
          code: "REQUEST_INVALID_TRANSITION" as const,
          message: error instanceof Error ? error.message : "状态不允许该操作"
        }
      };
    }

    // ── 预算联动 ────────────────────────────────────────────────
    //
    // 没有科目就没法找预算——申请阶段科目选填（见迁移 084 的注释），
    // 此时跳过预算联动而不是报错：拦住会让「还没想好挂哪个科目」的申请
    // 完全提不上来，而那是申请单最常见的初始状态。
    const effect = EFFECT_BY_ACTION[input.action];
    if (effect !== "none" && current.accountCode) {
      const budgets = await findApplicableBudgets(current.companyId, {
        date: current.expectedDate,
        accountCode: current.accountCode,
        costCenterId: current.costCenterId
      });

      for (const budget of budgets) {
        if (effect === "reserve") {
          await reserveBudget({
            companyId: current.companyId,
            budgetId: budget.id,
            sourceType: "request",
            sourceId: current.id,
            amountCents: current.amountCents,
            note: `${current.requestNo} ${current.title}`
          });
        } else {
          await transitionEncumbrance(
            budget.id,
            "request",
            current.id,
            effect === "realize" ? "realized" : "released"
          );
        }
      }
    }

    // ── 派生业务事项 ────────────────────────────────────────────
    const businessEventId =
      target === "approved" ? await derivEventId(tx, current) : current.businessEventId;

    const updated = await tx.query<RequestDbRow>(
      `update requests
          set status = $3, business_event_id = $4, updated_at = now()
        where company_id = $1 and id = $2
        returning ${COLUMNS}`,
      [input.companyId, input.id, target, businessEventId]
    );

    return { ok: true as const, value: mapRow(updated.rows[0]!) };
  });
}
