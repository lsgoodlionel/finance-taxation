/**
 * 报销单的 HTTP 接线（V13-B4/B5/B7）。
 *
 * - `GET  /api/reimbursements?mine=true`      列表（含算出来的合计）
 * - `POST /api/reimbursements`                新建（含明细与分摊）
 * - `GET  /api/reimbursements/:id`            详情
 * - `POST /api/reimbursements/:id/transition` 提交 / 批准 / 驳回 / 付款
 * - `GET  /api/invoices/:id/reimbursement-usage` 这张票报过没有（B5 用）
 * - `POST /api/reimbursements/:id/audit`      业财合规审核（V13-D）
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { ensureEmployeeCounterparty } from "../advances/store.js";
import { runReimbursementAudit } from "./audit-service.js";
import { createReimbursementVoucher } from "./voucher.js";
import {
  createReimbursement,
  findInvoiceUsage,
  getReimbursement,
  listReimbursements,
  transitionReimbursement,
  type ReimbursementFailureCode,
  type ReimbursementLineInput,
  type ReimbursementStatus
} from "./store.js";

const STATUS_BY_FAILURE: Record<ReimbursementFailureCode, number> = {
  REIMBURSEMENT_NOT_FOUND: 404,
  REIMBURSEMENT_NOT_EDITABLE: 409,
  REIMBURSEMENT_NO_LINES: 400,
  REIMBURSEMENT_LINE_INVALID: 400,
  REIMBURSEMENT_ALLOCATION_INVALID: 400,
  REIMBURSEMENT_INVALID_TRANSITION: 409,
  REIMBURSEMENT_DUPLICATE_INVOICE: 409
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function listReimbursementsRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listReimbursements(req.auth!.companyId, {
    applicantUserId: url.searchParams.get("mine") === "true" ? req.auth!.userId : undefined,
    status: (url.searchParams.get("status") as ReimbursementStatus) || undefined
  });
  json(res, 200, { items, total: items.length });
}

export async function getReimbursementRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const found = await getReimbursement(req.auth!.companyId, id);
  if (!found) {
    json(res, 404, { error: "报销单不存在", code: "REIMBURSEMENT_NOT_FOUND" });
    return;
  }
  json(res, 200, { reimbursement: found });
}

/** 把请求体里的一行解析成 ReimbursementLineInput，脏数据在这里挡掉。 */
function parseLine(raw: unknown): ReimbursementLineInput | null {
  const line = (raw ?? {}) as Record<string, unknown>;
  const accountCode = typeof line.accountCode === "string" ? line.accountCode.trim() : "";
  const expenseType = typeof line.expenseType === "string" ? line.expenseType.trim() : "";
  if (accountCode === "" || expenseType === "") return null;

  // 两种分摊输入分开解析。合成一个泛型函数看着省事，但返回类型只能靠断言
  // 糊过去——而断言正是这里最不该用的东西：脏数据本来就是要在这一层拦住的。
  const rawRatio = Array.isArray(line.allocationsByRatio) ? line.allocationsByRatio : [];
  const rawAmount = Array.isArray(line.allocationsByAmount) ? line.allocationsByAmount : [];

  const allocationsByRatio = rawRatio
    .map((item) => (item ?? {}) as Record<string, unknown>)
    .filter((item) => typeof item.costCenterId === "string")
    .map((item) => ({
      costCenterId: item.costCenterId as string,
      ratioBp: Number(item.ratioBp)
    }));

  const allocationsByAmount = rawAmount
    .map((item) => (item ?? {}) as Record<string, unknown>)
    .filter((item) => typeof item.costCenterId === "string")
    .map((item) => ({
      costCenterId: item.costCenterId as string,
      amountCents: Number(item.amountCents)
    }));

  return {
    expenseType,
    accountCode,
    amountCents: Number(line.amountCents),
    quantity: line.quantity === undefined ? 1 : Number(line.quantity),
    invoiceId: typeof line.invoiceId === "string" ? line.invoiceId : null,
    summary: typeof line.summary === "string" ? line.summary : "",
    allocationsByRatio,
    allocationsByAmount
  };
}

export async function createReimbursementRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const expenseDate = typeof body.expenseDate === "string" ? body.expenseDate : "";
  if (!DATE_PATTERN.test(expenseDate)) {
    json(res, 400, { error: "expenseDate 应形如 2026-09-15" });
    return;
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines = rawLines.map(parseLine);
  if (lines.some((line) => line === null)) {
    json(res, 400, {
      error: "每行明细都必须有 accountCode 与 expenseType",
      code: "REIMBURSEMENT_LINE_INVALID"
    });
    return;
  }

  // 同一张票在这张单里出现两次由唯一约束挡住，但那报出来的是数据库错误。
  // 跨单据的重复报销检测是批次 D 的事，这里先把**已被别的单据占用**的票拦下——
  // 用户在提交时知道，比等到审批被拒强。
  const invoiceIds = (lines as ReimbursementLineInput[])
    .map((line) => line.invoiceId)
    .filter((id): id is string => typeof id === "string");
  for (const invoiceId of invoiceIds) {
    const used = await findInvoiceUsage(req.auth!.companyId, invoiceId);
    if (used.length > 0) {
      json(res, 409, {
        error: `发票已在报销单 ${used[0]!.reimbursementNo} 中使用`,
        code: "REIMBURSEMENT_DUPLICATE_INVOICE"
      });
      return;
    }
  }

  const result = await createReimbursement({
    companyId: req.auth!.companyId,
    requestId: typeof body.requestId === "string" ? body.requestId : null,
    advanceId: typeof body.advanceId === "string" ? body.advanceId : null,
    applicantUserId: req.auth!.userId,
    // 报销人的往来单位与借款用同一个（同一个人），复用那边的建档逻辑。
    counterpartyId: await ensureEmployeeCounterparty(req.auth!.companyId, req.auth!.userId),
    expenseDate,
    lines: lines as ReimbursementLineInput[],
    note: typeof body.note === "string" ? body.note : null
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  json(res, 201, { reimbursement: result.value });
}

export async function transitionReimbursementRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  // 提交审批前先过一遍合规审核。**只拦 block**——warn 与 escalate 放行，
  // 前者让审批人看到，后者由审批流加一级。审核放在状态流转之前：
  // 拦住的单据不该留下「提交过」的痕迹。
  if (action === "submit") {
    const current = await getReimbursement(req.auth!.companyId, id);
    if (current) {
      const audit = await runReimbursementAudit(req.auth!.companyId, current);
      if (audit.level === "block") {
        json(res, 409, {
          error: "存在必须处理的合规问题，不能提交",
          code: "REIMBURSEMENT_AUDIT_BLOCKED",
          audit
        });
        return;
      }
    }
  }

  const result = await transitionReimbursement(req.auth!.companyId, id, action);
  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  // 审批通过时生成凭证草稿。**放在状态流转之后而不是之内**：凭证生成失败
  // 不该让审批本身回滚——单据已经批了是事实，凭证可以重新生成。
  let voucherId: string | null = result.value.voucherId;
  if (result.value.status === "approved") {
    const outcome = await createReimbursementVoucher(result.value);
    voucherId = outcome.voucherId;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: `reimbursement.${action}`,
    resourceType: "reimbursement",
    resourceId: id,
    resourceLabel: `${result.value.reimbursementNo}（${(result.value.totalCents / 100).toFixed(2)} 元）`,
    changes: { status: result.value.status, voucherId }
  });

  json(res, 200, {
    reimbursement: { ...result.value, voucherId },
    ...(result.value.status === "approved"
      ? { note: "已生成报销凭证草稿，需会计复核后过账。" }
      : {})
  });
}

/**
 * 这张发票报过没有（B5 用）。
 *
 * 票据中心的「转报销单」按钮要在点之前就知道——挂上去再被拒是最差的顺序。
 */
export async function invoiceReimbursementUsageRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const usages = await findInvoiceUsage(req.auth!.companyId, id);
  json(res, 200, { used: usages.length > 0, usages });
}

/**
 * 业财合规审核（V13-D）。
 *
 * 独立成接口而不是只在提交时跑：用户填完表就该看到「这张票报过了」，
 * 而不是点了提交才被拒。同一套 `runReimbursementAudit` 两处共用，
 * 判断不会走岔。
 */
export async function auditReimbursementRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const found = await getReimbursement(req.auth!.companyId, id);
  if (!found) {
    json(res, 404, { error: "报销单不存在", code: "REIMBURSEMENT_NOT_FOUND" });
    return;
  }

  const audit = await runReimbursementAudit(req.auth!.companyId, found);
  json(res, 200, audit);
}
