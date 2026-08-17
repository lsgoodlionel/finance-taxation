/**
 * 报销单的读写（V13-B4/B5/B7）。
 *
 * ## 合计由明细算，不存字段
 *
 * 与借款余额同理。存一份冗余合计迟早出现「单头 1000、明细合计 980」，
 * 而那时没人知道该信哪个、也说不清是哪一行被改过。
 *
 * ## 与借款的冲销关系
 *
 * 报销时如果关联了借款，落账的贷方不是「银行存款」而是「1221 其他应收款」——
 * 花掉的钱从预支的那笔里扣。多退少补由余额自然体现：
 *
 * - 借 5000 报 4200 → 1221 还剩 800，员工要退
 * - 借 5000 报 5600 → 1221 变成 -600，公司要补
 *
 * **不在代码里判断「该退还是该补」**：那是余额的符号，算一次就有了，
 * 而写成分支迟早有一边写反。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { allocateByAmount, allocateByRatio, type AllocationResult } from "./allocation.js";

export type ReimbursementStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

export interface ReimbursementLine {
  id: string;
  expenseType: string;
  accountCode: string;
  amountCents: number;
  quantity: number;
  invoiceId: string | null;
  summary: string;
  allocations: AllocationResult[];
}

export interface ReimbursementRow {
  id: string;
  companyId: string;
  reimbursementNo: string;
  requestId: string | null;
  advanceId: string | null;
  applicantUserId: string;
  counterpartyId: string;
  expenseDate: string;
  status: ReimbursementStatus;
  voucherId: string | null;
  note: string | null;
  lines: ReimbursementLine[];
  /** 明细合计，**算出来的**，不是存的。 */
  totalCents: number;
}

export type ReimbursementFailureCode =
  | "REIMBURSEMENT_NOT_FOUND"
  | "REIMBURSEMENT_NOT_EDITABLE"
  | "REIMBURSEMENT_NO_LINES"
  | "REIMBURSEMENT_LINE_INVALID"
  | "REIMBURSEMENT_ALLOCATION_INVALID"
  | "REIMBURSEMENT_INVALID_TRANSITION"
  | "REIMBURSEMENT_DUPLICATE_INVOICE";

export type ReimbursementResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: ReimbursementFailureCode; message: string } };

interface HeaderDbRow {
  id: string;
  company_id: string;
  reimbursement_no: string;
  request_id: string | null;
  advance_id: string | null;
  applicant_user_id: string;
  counterparty_id: string;
  expense_date: string | Date;
  status: ReimbursementStatus;
  voucher_id: string | null;
  note: string | null;
}

interface LineDbRow {
  id: string;
  reimbursement_id: string;
  expense_type: string;
  account_code: string;
  amount_cents: string;
  quantity: number;
  invoice_id: string | null;
  summary: string;
}

interface AllocationDbRow {
  line_id: string;
  cost_center_id: string;
  ratio_bp: number;
  amount_cents: string;
}

function asDateString(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

const HEADER_COLUMNS = `
  id, company_id, reimbursement_no, request_id, advance_id, applicant_user_id,
  counterparty_id, expense_date, status, voucher_id, note
`;

/** 把单头、明细、分摊三张表拼成一个完整对象，并算出合计。 */
async function assemble(header: HeaderDbRow): Promise<ReimbursementRow> {
  const lineRows = await query<LineDbRow>(
    `select id, reimbursement_id, expense_type, account_code, amount_cents,
            quantity, invoice_id, summary
       from reimbursement_lines where reimbursement_id = $1 order by sort_order, id`,
    [header.id]
  );
  const allocationRows = lineRows.length
    ? await query<AllocationDbRow>(
        `select line_id, cost_center_id, ratio_bp, amount_cents
           from reimbursement_allocations where line_id = any($1::text[])
          order by cost_center_id`,
        [lineRows.map((row) => row.id)]
      )
    : [];

  const lines: ReimbursementLine[] = lineRows.map((row) => ({
    id: row.id,
    expenseType: row.expense_type,
    accountCode: row.account_code,
    amountCents: Number(row.amount_cents),
    quantity: row.quantity,
    invoiceId: row.invoice_id,
    summary: row.summary,
    allocations: allocationRows
      .filter((item) => item.line_id === row.id)
      .map((item) => ({
        costCenterId: item.cost_center_id,
        ratioBp: item.ratio_bp,
        amountCents: Number(item.amount_cents)
      }))
  }));

  return {
    id: header.id,
    companyId: header.company_id,
    reimbursementNo: header.reimbursement_no,
    requestId: header.request_id,
    advanceId: header.advance_id,
    applicantUserId: header.applicant_user_id,
    counterpartyId: header.counterparty_id,
    expenseDate: asDateString(header.expense_date),
    status: header.status,
    voucherId: header.voucher_id,
    note: header.note,
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0)
  };
}

export async function getReimbursement(
  companyId: string,
  id: string
): Promise<ReimbursementRow | null> {
  const header = await queryOne<HeaderDbRow>(
    `select ${HEADER_COLUMNS} from reimbursements where company_id = $1 and id = $2`,
    [companyId, id]
  );
  return header ? assemble(header) : null;
}

export async function listReimbursements(
  companyId: string,
  filter: { applicantUserId?: string; status?: ReimbursementStatus } = {}
): Promise<ReimbursementRow[]> {
  const conditions = ["company_id = $1"];
  const params: unknown[] = [companyId];
  if (filter.applicantUserId) {
    params.push(filter.applicantUserId);
    conditions.push(`applicant_user_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  const headers = await query<HeaderDbRow>(
    `select ${HEADER_COLUMNS} from reimbursements
      where ${conditions.join(" and ")} order by created_at desc`,
    params
  );
  return Promise.all(headers.map(assemble));
}

/** 明细行的输入。分摊二选一：给比例或给金额，都不给则不分摊。 */
export interface ReimbursementLineInput {
  expenseType: string;
  accountCode: string;
  amountCents: number;
  quantity?: number;
  invoiceId?: string | null;
  summary?: string;
  allocationsByRatio?: readonly { costCenterId: string; ratioBp: number }[];
  allocationsByAmount?: readonly { costCenterId: string; amountCents: number }[];
}

export interface CreateReimbursementInput {
  companyId: string;
  requestId: string | null;
  advanceId: string | null;
  applicantUserId: string;
  counterpartyId: string;
  expenseDate: string;
  lines: readonly ReimbursementLineInput[];
  note: string | null;
}

/** 算出一行的分摊结果；两种输入都没给时返回空数组（整行归「未指定」）。 */
function resolveAllocations(line: ReimbursementLineInput): AllocationResult[] {
  if (line.allocationsByAmount?.length) {
    return allocateByAmount(line.amountCents, line.allocationsByAmount);
  }
  if (line.allocationsByRatio?.length) {
    return allocateByRatio(line.amountCents, line.allocationsByRatio);
  }
  // 不分摊是合法的：整笔归「未指定」，与 V12-D1 部门费用报表的处理一致。
  return [];
}

export async function createReimbursement(
  input: CreateReimbursementInput
): Promise<ReimbursementResult<ReimbursementRow>> {
  if (input.lines.length === 0) {
    return {
      ok: false,
      failure: { code: "REIMBURSEMENT_NO_LINES", message: "报销单至少要有一行明细" }
    };
  }

  // 先把分摊全部算出来再落库：分摊校验会抛错（比例合计不对、部门重复等），
  // 在事务外算完能让错误消息直接回给用户，而不是变成一次回滚。
  let resolved: AllocationResult[][];
  try {
    resolved = input.lines.map(resolveAllocations);
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: "REIMBURSEMENT_ALLOCATION_INVALID",
        message: error instanceof Error ? error.message : "分摊数据不合法"
      }
    };
  }

  for (const line of input.lines) {
    if (!Number.isInteger(line.amountCents) || line.amountCents < 0) {
      return {
        ok: false,
        failure: { code: "REIMBURSEMENT_LINE_INVALID", message: "明细金额必须是非负整数分" }
      };
    }
  }

  const id = `rmb-${randomUUID()}`;
  const header = await withTransaction(async (tx) => {
    const yearMonth = input.expenseDate.slice(0, 7).replace("-", "");
    const counted = await tx.query<{ count: string }>(
      `select count(*) as count from reimbursements
        where company_id = $1 and reimbursement_no like $2`,
      [input.companyId, `RMB-${yearMonth}-%`]
    );
    const no = `RMB-${yearMonth}-${String(Number(counted.rows[0]?.count ?? 0) + 1).padStart(4, "0")}`;

    const inserted = await tx.query<HeaderDbRow>(
      `insert into reimbursements
         (id, company_id, reimbursement_no, request_id, advance_id,
          applicant_user_id, counterparty_id, expense_date, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning ${HEADER_COLUMNS}`,
      [
        id,
        input.companyId,
        no,
        input.requestId,
        input.advanceId,
        input.applicantUserId,
        input.counterpartyId,
        input.expenseDate,
        input.note
      ]
    );

    for (const [index, line] of input.lines.entries()) {
      const lineId = `rml-${randomUUID()}`;
      await tx.query(
        `insert into reimbursement_lines
           (id, company_id, reimbursement_id, expense_type, account_code,
            amount_cents, quantity, invoice_id, summary, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          lineId,
          input.companyId,
          id,
          line.expenseType,
          line.accountCode,
          line.amountCents,
          line.quantity ?? 1,
          line.invoiceId ?? null,
          line.summary ?? "",
          index
        ]
      );
      for (const allocation of resolved[index]!) {
        await tx.query(
          `insert into reimbursement_allocations
             (id, company_id, line_id, cost_center_id, ratio_bp, amount_cents)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            `rma-${randomUUID()}`,
            input.companyId,
            lineId,
            allocation.costCenterId,
            allocation.ratioBp,
            allocation.amountCents
          ]
        );
      }
    }

    return inserted.rows[0]!;
  });

  return { ok: true, value: await assemble(header) };
}

const TRANSITIONS: Record<ReimbursementStatus, Partial<Record<string, ReimbursementStatus>>> = {
  draft: { submit: "pending", cancel: "cancelled" },
  pending: { approve: "approved", reject: "rejected", cancel: "cancelled" },
  approved: { pay: "paid", cancel: "cancelled" },
  // 与申请单一致：驳回不是终点，改了可以再提。
  rejected: { submit: "pending", cancel: "cancelled" },
  paid: {},
  cancelled: {}
};

export async function transitionReimbursement(
  companyId: string,
  id: string,
  action: string
): Promise<ReimbursementResult<ReimbursementRow>> {
  return withTransaction(async (tx) => {
    const found = await tx.query<HeaderDbRow>(
      `select ${HEADER_COLUMNS} from reimbursements
        where company_id = $1 and id = $2 for update`,
      [companyId, id]
    );
    const header = found.rows[0];
    if (!header) {
      return {
        ok: false as const,
        failure: { code: "REIMBURSEMENT_NOT_FOUND" as const, message: "报销单不存在" }
      };
    }

    const target = TRANSITIONS[header.status][action];
    if (!target) {
      return {
        ok: false as const,
        failure: {
          code: "REIMBURSEMENT_INVALID_TRANSITION" as const,
          message: `报销单当前是「${header.status}」，不允许执行「${action}」`
        }
      };
    }

    const updated = await tx.query<HeaderDbRow>(
      `update reimbursements set status = $3, updated_at = now()
        where company_id = $1 and id = $2 returning ${HEADER_COLUMNS}`,
      [companyId, id, target]
    );
    return { ok: true as const, value: await assemble(updated.rows[0]!) };
  });
}

/**
 * 某张发票是否已经被报销过（跨单据）。
 *
 * 同单内重复由唯一约束挡住，跨单据的检测放在这里。**批次 D 的重复报销
 * 拦截会用它**，这里先提供查询能力——B5 的「转报销单」入口在挂上发票时
 * 就该提示「这张票报过了」，而不是等提交才拒。
 */
export async function findInvoiceUsage(
  companyId: string,
  invoiceId: string
): Promise<{ reimbursementId: string; reimbursementNo: string; status: string }[]> {
  return query<{ reimbursementId: string; reimbursementNo: string; status: string }>(
    `select r.id as "reimbursementId", r.reimbursement_no as "reimbursementNo", r.status
       from reimbursement_lines l
       join reimbursements r on r.id = l.reimbursement_id
      where l.company_id = $1 and l.invoice_id = $2
        -- 已作废的单据不算占用：那张票可以重新报。
        and r.status <> 'cancelled'`,
    [companyId, invoiceId]
  );
}
