/**
 * 付款与合同付款计划的 HTTP 接线（V13-C）。
 *
 * - `GET  /api/contracts/:id/schedules`    某合同的付款计划与进度
 * - `POST /api/contracts/:id/schedules`    新增一期（含质保金）
 * - `POST /api/schedules/:id/cancel`       作废一期
 * - `GET  /api/payments/due?from=&to=`     应付列表（出纳视角，C7）
 * - `GET  /api/payments`                   付款单列表
 * - `POST /api/payments`                   建付款单
 * - `POST /api/payments/:id/confirm`       确认付款，生成凭证草稿
 * - `POST /api/payments/export`            导出银行可导入的 CSV（不做直连）
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import {
  cancelSchedule,
  createSchedule,
  listDuePayments,
  listSchedules,
  type ScheduleFailureCode
} from "../contracts/schedule-store.js";
import { buildBankExportRows, toBankCsv } from "./voucher.js";
import {
  confirmPayment,
  createPayment,
  getPayment,
  listPayments,
  markExported,
  type PaymentFailureCode,
  type PaymentStatus
} from "./store.js";

const SCHEDULE_STATUS: Record<ScheduleFailureCode, number> = {
  SCHEDULE_NOT_FOUND: 404,
  SCHEDULE_AMOUNT_INVALID: 400,
  SCHEDULE_PERIOD_DUPLICATE: 409,
  SCHEDULE_RETENTION_DATE_INVALID: 400,
  SCHEDULE_HAS_PAYMENT: 409
};

const PAYMENT_STATUS: Record<PaymentFailureCode, number> = {
  PAYMENT_NOT_FOUND: 404,
  PAYMENT_AMOUNT_INVALID: 400,
  PAYMENT_TARGET_INVALID: 400,
  PAYMENT_EXCEEDS_REMAINING: 409,
  PAYMENT_INVALID_TRANSITION: 409
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listSchedulesRoute(
  req: ApiRequest,
  res: ServerResponse,
  contractId: string
): Promise<void> {
  // 逾期判定要一个「今天」。在这里取一次传给纯函数，而不是让纯函数自己取——
  // 那会让同一份数据在不同机器上显示不同状态。
  const result = await listSchedules(req.auth!.companyId, contractId, todayIso());
  json(res, 200, result);
}

export async function createScheduleRoute(
  req: ApiRequest,
  res: ServerResponse,
  contractId: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const dueDate = typeof body.dueDate === "string" ? body.dueDate : "";
  if (!DATE_PATTERN.test(dueDate)) {
    json(res, 400, { error: "dueDate 应形如 2026-06-30" });
    return;
  }

  const scheduleType = body.scheduleType === "retention" ? "retention" : "normal";
  const result = await createSchedule({
    companyId: req.auth!.companyId,
    contractId,
    periodNo: Number(body.periodNo),
    title: typeof body.title === "string" ? body.title.trim() : "",
    dueDate,
    amountCents: Number(body.amountCents),
    ratioBp: body.ratioBp === undefined || body.ratioBp === null ? null : Number(body.ratioBp),
    scheduleType,
    retentionReleaseDate:
      typeof body.retentionReleaseDate === "string" && DATE_PATTERN.test(body.retentionReleaseDate)
        ? body.retentionReleaseDate
        : null,
    note: typeof body.note === "string" ? body.note : null
  });

  if (!result.ok) {
    json(res, SCHEDULE_STATUS[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "contract_schedule.create",
    resourceType: "contract_payment_schedule",
    resourceId: result.value.id,
    resourceLabel: `${contractId} 第 ${result.value.periodNo} 期 ${result.value.title}`,
    changes: { amountCents: result.value.amountCents, scheduleType }
  });

  json(res, 201, { schedule: result.value });
}

export async function cancelScheduleRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const result = await cancelSchedule(req.auth!.companyId, id);
  if (!result.ok) {
    json(res, SCHEDULE_STATUS[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }
  json(res, 200, { ok: true });
}

/**
 * 应付列表（C7）。
 *
 * 默认查本月——出纳每天要看的第一个东西就是「这个月还有什么要付」。
 */
export async function listDuePaymentsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const today = todayIso();
  const from = url.searchParams.get("from") ?? `${today.slice(0, 7)}-01`;
  const to = url.searchParams.get("to") ?? `${today.slice(0, 7)}-31`;

  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    json(res, 400, { error: "from / to 应形如 2026-09-01" });
    return;
  }

  const items = await listDuePayments(req.auth!.companyId, { from, to });
  json(res, 200, {
    items,
    total: items.length,
    // 合计写出来：出纳要知道这个月总共要付多少才好安排头寸。
    totalCents: items.reduce((sum, item) => sum + (item.amountCents - item.paidCents), 0)
  });
}

export async function listPaymentsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listPayments(req.auth!.companyId, {
    status: (url.searchParams.get("status") as PaymentStatus) || undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined
  });
  json(res, 200, { items, total: items.length });
}

export async function createPaymentRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const paidOn = typeof body.paidOn === "string" && DATE_PATTERN.test(body.paidOn)
    ? body.paidOn
    : todayIso();

  const result = await createPayment({
    companyId: req.auth!.companyId,
    reimbursementId: typeof body.reimbursementId === "string" ? body.reimbursementId : null,
    scheduleId: typeof body.scheduleId === "string" ? body.scheduleId : null,
    amountCents: Number(body.amountCents),
    paidOn,
    bankAccountCode:
      typeof body.bankAccountCode === "string" && body.bankAccountCode.trim() !== ""
        ? body.bankAccountCode.trim()
        : "1002",
    createdByUserId: req.auth!.userId,
    note: typeof body.note === "string" ? body.note : null
  });

  if (!result.ok) {
    json(res, PAYMENT_STATUS[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  json(res, 201, { payment: result.value });
}

export async function confirmPaymentRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const result = await confirmPayment(req.auth!.companyId, id);
  if (!result.ok) {
    json(res, PAYMENT_STATUS[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "payment.confirm",
    resourceType: "payment",
    resourceId: id,
    resourceLabel: `${result.value.payment.paymentNo}`,
    changes: { voucherId: result.value.voucherId, amountCents: result.value.payment.amountCents }
  });

  json(res, 200, {
    payment: result.value.payment,
    voucherId: result.value.voucherId,
    note: "已生成付款凭证草稿，需会计复核后过账。"
  });
}

/**
 * 导出银行付款指令（C6）。
 *
 * **不做银企直连**——只生成银行可导入的 CSV。理由见迁移 088 的文件头：
 * 直连依赖各行协议与网银证书，无法在没有真实银行环境时验证。
 */
export async function exportPaymentsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(body.paymentIds)
    ? body.paymentIds.filter((id): id is string => typeof id === "string")
    : [];

  if (ids.length === 0) {
    json(res, 400, { error: "paymentIds 不能为空" });
    return;
  }

  const payments = await Promise.all(
    ids.map((id) => getPayment(req.auth!.companyId, id))
  );
  const found = payments.filter((item): item is NonNullable<typeof item> => item !== null);

  // 收款人信息（户名/账号/开户行）在 FT 里还没有落点——供应商银行账户
  // 需要在往来单位档案上扩展，那超出 C6 的范围。这里先导出付款单本身的
  // 信息，账号列留空由出纳补。**明说而不是编造空字符串**：
  // 导出的文件直接进银行系统，编出来的账号是要出事的。
  const rows = buildBankExportRows(
    found.map((payment) => ({
      paymentNo: payment.paymentNo,
      payeeName: "",
      payeeAccount: "",
      payeeBank: "",
      amountCents: payment.amountCents,
      note: payment.note ?? ""
    }))
  );

  const batchNo = `EXP-${todayIso().replace(/-/g, "")}-${found.length}`;
  await markExported(req.auth!.companyId, found.map((item) => item.id), batchNo);

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "payment.export",
    resourceType: "payment",
    resourceId: batchNo,
    resourceLabel: `导出 ${found.length} 笔付款指令`,
    changes: { batchNo, count: found.length }
  });

  // 响应头与 tax-integration 的 csvResponse 同一套（含 nosniff）。
  // BOM 头：Excel 打开 UTF-8 CSV 不加 BOM 会把中文显示成乱码，
  // 而出纳几乎一定会先用 Excel 打开看一眼。
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(`${batchNo}.csv`)}"`,
    "X-Content-Type-Options": "nosniff"
  });
  res.end(`\ufeff${toBankCsv(rows)}`);
}
