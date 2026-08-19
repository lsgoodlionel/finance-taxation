/**
 * 往来账龄与核销的 HTTP 接线（V12-C2）。
 *
 * - `GET    /api/settlement/aging?direction=&asOf=` 账龄分析表
 * - `GET    /api/settlement/open-items?direction=`  待核销明细（发生方 + 核销方）
 * - `POST   /api/settlement/settle`                 核销
 * - `GET    /api/settlement/settlements?entryId=`   某笔分录上的核销记录
 * - `DELETE /api/settlement/settlements/:id`        撤销核销
 *
 * ## 查询接口是 V15 补的
 *
 * `listSettlements` 早就写好了，只是**没接成路由**——于是撤销接口存在、
 * 但前台拿不到要撤哪一条的 id，核销错了改不了。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { fromCents } from "../../utils/money.js";
import { writeAudit } from "../../services/audit.js";
import { buildAgingReport, AGING_BUCKETS, type AgingReport } from "./aging.js";
import { deleteSettlement, listSettlements, loadSettlementEntries } from "./settlement-store.js";
import { directionOf } from "./settlement-store.js";
import { settleEntries } from "./settle.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDirection(raw: string | null): "receivable" | "payable" {
  return raw === "payable" ? "payable" : "receivable";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 分单位输出转成两位小数字符串，保持与其他财务接口一致的表现形式。 */
function serializeAging(report: AgingReport) {
  return {
    asOf: report.asOf,
    direction: report.direction,
    buckets: AGING_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      amount: fromCents(report.bucketCents[bucket.key] ?? 0)
    })),
    total: fromCents(report.totalCents),
    overdue: fromCents(report.overdueCents),
    counterparties: report.counterparties.map((row) => ({
      counterpartyId: row.counterpartyId,
      counterpartyName: row.counterpartyName,
      total: fromCents(row.totalCents),
      overdue: fromCents(row.overdueCents),
      itemCount: row.itemCount,
      buckets: Object.fromEntries(
        AGING_BUCKETS.map((bucket) => [bucket.key, fromCents(row.bucketCents[bucket.key] ?? 0)])
      )
    })),
    items: report.items.map((item) => ({
      entryId: item.entryId,
      counterpartyId: item.counterpartyId,
      counterpartyName: item.counterpartyName,
      accountCode: item.accountCode,
      accountName: item.accountName,
      entryDate: item.entryDate,
      summary: item.summary,
      original: fromCents(item.originalCents),
      settled: fromCents(item.settledCents),
      open: fromCents(item.openCents),
      agingDays: item.agingDays,
      overdueDays: item.overdueDays,
      bucketKey: item.bucketKey
    }))
  };
}

export async function getAgingRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const direction = parseDirection(url.searchParams.get("direction"));
  const asOf = url.searchParams.get("asOf") ?? todayIso();
  if (!DATE_PATTERN.test(asOf)) {
    json(res, 400, { error: "asOf 必须形如 YYYY-MM-DD", code: "AS_OF_INVALID" });
    return;
  }

  const { entries, truncated } = await withTransaction((client) =>
    loadSettlementEntries(client, req.auth!.companyId, {
      asOf,
      since: url.searchParams.get("since"),
      counterpartyId: url.searchParams.get("counterpartyId")
    })
  );

  const openItems = entries.filter(
    (entry) => entry.side === "open" && directionOf(entry.accountType) === direction
  );
  const report = buildAgingReport(openItems, asOf, direction);

  json(res, 200, {
    ...serializeAging(report),
    // 截断必须说出来：静默少给数据会让用户以为"应收就这么多"。
    truncated,
    truncatedHint: truncated
      ? "明细超过单次查询上限，已截断。请用 since 参数收窄日期范围后重新查询。"
      : null
  });
}

/** 待核销明细：发生方与核销方一起返回，供前端在同一屏里配对。 */
export async function getOpenItemsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const direction = parseDirection(url.searchParams.get("direction"));
  const asOf = url.searchParams.get("asOf") ?? todayIso();

  const { entries, truncated } = await withTransaction((client) =>
    loadSettlementEntries(client, req.auth!.companyId, {
      asOf,
      since: url.searchParams.get("since"),
      counterpartyId: url.searchParams.get("counterpartyId")
    })
  );

  const inDirection = entries.filter((entry) => directionOf(entry.accountType) === direction);
  const serialize = (entry: (typeof inDirection)[number]) => ({
    entryId: entry.entryId,
    counterpartyId: entry.counterpartyId,
    counterpartyName: entry.counterpartyName,
    accountCode: entry.accountCode,
    accountName: entry.accountName,
    entryDate: entry.entryDate,
    summary: entry.summary,
    original: fromCents(entry.originalCents),
    settled: fromCents(entry.settledCents),
    remaining: fromCents(entry.originalCents - entry.settledCents)
  });

  json(res, 200, {
    direction,
    asOf,
    // 只列还有余额的：全部核销完的笔留在配对界面里纯属噪音
    openItems: inDirection
      .filter((entry) => entry.side === "open" && entry.originalCents > entry.settledCents)
      .map(serialize),
    settleItems: inDirection
      .filter((entry) => entry.side === "settle" && entry.originalCents > entry.settledCents)
      .map(serialize),
    truncated
  });
}

export async function settleRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const openEntryId = typeof body.openEntryId === "string" ? body.openEntryId.trim() : "";
  const settleEntryId = typeof body.settleEntryId === "string" ? body.settleEntryId.trim() : "";
  if (!openEntryId || !settleEntryId) {
    json(res, 400, {
      error: "openEntryId 与 settleEntryId 均必填",
      code: "SETTLE_ENTRIES_REQUIRED"
    });
    return;
  }

  const result = await withTransaction((client) =>
    settleEntries(client, {
      companyId: req.auth!.companyId,
      openEntryId,
      settleEntryId,
      amount: body.amount == null ? null : String(body.amount),
      settledOn: typeof body.settledOn === "string" ? body.settledOn.trim() : todayIso(),
      createdBy: req.auth!.userId
    })
  );

  if (!result.ok) {
    const status =
      result.failure.code === "ENTRY_NOT_FOUND"
        ? 404
        : result.failure.code === "SETTLE_ALREADY_EXISTS"
          ? 409
          : 400;
    json(res, status, { error: result.failure.message, ...result.failure });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "settlement.settle",
    resourceType: "ar_ap_settlement",
    resourceId: result.summary.id,
    resourceLabel: `核销 ${result.summary.amount}`,
    changes: {
      openEntryId,
      settleEntryId,
      amount: result.summary.amount,
      openRemaining: result.summary.openRemaining
    }
  });

  json(res, 201, result.summary);
}

/**
 * 某笔分录上的核销记录（V15）。
 *
 * `entryId` 既可以是欠款那一笔，也可以是核销方那一笔——两边都能查到同一条记录，
 * 因为用户从哪一侧点进来都应当看得见。
 */
export async function listSettlementsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const entryId = url.searchParams.get("entryId") ?? "";
  if (entryId === "") {
    json(res, 400, { error: "entryId 不能为空" });
    return;
  }

  const items = await withTransaction((client) =>
    listSettlements(client, req.auth!.companyId, entryId)
  );
  json(res, 200, { items, total: items.length });
}

export async function deleteSettlementRoute(
  req: ApiRequest,
  res: ServerResponse,
  settlementId: string
): Promise<void> {
  const deleted = await withTransaction((client) =>
    deleteSettlement(client, req.auth!.companyId, settlementId)
  );
  if (!deleted) {
    json(res, 404, { error: `找不到核销记录 ${settlementId}`, code: "SETTLEMENT_NOT_FOUND" });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "settlement.unsettle",
    resourceType: "ar_ap_settlement",
    resourceId: settlementId,
    resourceLabel: `撤销核销 ${settlementId}`,
    changes: null
  });

  json(res, 200, { deleted: true, id: settlementId });
}
