/**
 * 汇率维护与期末调汇的 HTTP 入口（V12-D5）。
 *
 * - `GET  /api/currency/rates?currency=&limit=`   汇率列表
 * - `PUT  /api/currency/rates`                    录入/更新某日汇率（同日同币种唯一）
 * - `GET  /api/currency/revaluation?asOfDate=`    期末调汇预览（不落库）
 * - `POST /api/currency/revaluation`              生成调汇草稿凭证
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { uniqueId } from "../../utils/id.js";
import { writeAudit } from "../../services/audit.js";
import { BASE_CURRENCY, RATE_SCALE } from "./revaluation.js";
import { createRevaluationVoucher, previewRevaluation } from "./revaluation-store.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** ISO 4217 三字母码。 */
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface RateRow {
  id: string;
  currency: string;
  rate_date: string | Date;
  rate: string;
  source: string;
  note: string | null;
}

function toDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function mapRate(row: RateRow) {
  return {
    id: row.id,
    currency: row.currency,
    rateDate: toDateOnly(row.rate_date),
    /** 整数标度值，与库一致。 */
    rate: Number(row.rate),
    /** 人读的小数形式，前端直接显示，避免每处各除一遍。 */
    rateDisplay: (Number(row.rate) / RATE_SCALE).toFixed(6),
    source: row.source,
    note: row.note
  };
}

export async function listExchangeRatesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const currency = url.searchParams.get("currency");
  const limitRaw = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;

  const params: unknown[] = [req.auth!.companyId];
  let where = "where company_id = $1";
  if (currency) {
    params.push(currency.toUpperCase());
    where += ` and currency = $${params.length}`;
  }
  params.push(limit);

  const rows = await query<RateRow>(
    `select id, currency, rate_date, rate::text, source, note
       from exchange_rates ${where}
      order by rate_date desc, currency
      limit $${params.length}`,
    params
  );
  json(res, 200, { rates: rows.map(mapRate), baseCurrency: BASE_CURRENCY });
}

/**
 * 录入或更新某日汇率。
 *
 * 用 PUT + upsert 而不是 POST：同一天同一币种只该有一个汇率（库上有唯一约束）。
 * 录错了就是改那一行，而不是插入第二行让取数靠 `order by` 撞运气。
 */
export async function upsertExchangeRateRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const rateDate = typeof body.rateDate === "string" ? body.rateDate.trim() : "";

  if (!CURRENCY_PATTERN.test(currency)) {
    json(res, 400, { error: "currency 必须是 ISO 4217 三字母码，如 USD", code: "CURRENCY_INVALID" });
    return;
  }
  if (currency === BASE_CURRENCY) {
    json(res, 400, {
      error: `${BASE_CURRENCY} 是记账本位币，不需要也不能录汇率——录了会让「查不到汇率」与「汇率是 1」在取数时混淆。`,
      code: "CURRENCY_IS_BASE"
    });
    return;
  }
  if (!DATE_PATTERN.test(rateDate)) {
    json(res, 400, { error: "rateDate 必须形如 YYYY-MM-DD", code: "RATE_DATE_INVALID" });
    return;
  }

  // 接受小数形式（1 外币 = N 本位币），内部统一转成整数标度。
  const rateValue = Number(body.rate);
  if (!Number.isFinite(rateValue) || rateValue <= 0) {
    json(res, 400, { error: "rate 必须是大于 0 的数字", code: "RATE_INVALID" });
    return;
  }
  const rateScaled = Math.round(rateValue * RATE_SCALE);
  if (rateScaled <= 0) {
    json(res, 400, {
      error: "rate 小于汇率精度（6 位小数）下限",
      code: "RATE_INVALID"
    });
    return;
  }

  const source = typeof body.source === "string" && body.source ? body.source : "manual";
  const note = typeof body.note === "string" ? body.note : null;

  const rows = await query<RateRow>(
    `insert into exchange_rates (id, company_id, currency, rate_date, rate, source, note)
     values ($1, $2, $3, $4::date, $5, $6, $7)
     on conflict (company_id, currency, rate_date) do update
       set rate = excluded.rate, source = excluded.source, note = excluded.note, updated_at = now()
     returning id, currency, rate_date, rate::text, source, note`,
    [uniqueId("fx"), req.auth!.companyId, currency, rateDate, rateScaled, source, note]
  );

  const saved = mapRate(rows[0]!);
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "currency.rate.upsert",
    resourceType: "exchange_rate",
    resourceId: saved.id,
    resourceLabel: `${saved.currency} ${saved.rateDate}`,
    changes: { rate: saved.rateDisplay, source: saved.source }
  });
  json(res, 200, saved);
}

export async function previewRevaluationRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const asOfDate = url.searchParams.get("asOfDate") || "";
  if (!DATE_PATTERN.test(asOfDate)) {
    json(res, 400, { error: "asOfDate 必须形如 YYYY-MM-DD", code: "AS_OF_DATE_INVALID" });
    return;
  }

  const preview = await withTransaction((client) =>
    previewRevaluation(client, req.auth!.companyId, asOfDate)
  );
  json(res, 200, {
    asOfDate: preview.asOfDate,
    baseCurrency: BASE_CURRENCY,
    missingRates: preview.missingRates,
    netGainLoss: (preview.netGainLossCents / 100).toFixed(2),
    lines: preview.lines.map((line) => ({
      accountCode: line.accountCode,
      accountName: line.accountName,
      currency: line.currency,
      foreignBalance: (line.foreignBalanceCents / 100).toFixed(2),
      baseBookBalance: (line.baseBookBalanceCents / 100).toFixed(2),
      closingRate: line.closingRate === null ? null : (line.closingRate / RATE_SCALE).toFixed(6),
      difference: line.result ? (line.result.differenceCents / 100).toFixed(2) : null,
      needsAdjustment: line.result?.needsAdjustment ?? false,
      isGain: line.result?.isGain ?? null,
      reason: line.blockedReason ?? line.result?.reason ?? ""
    }))
  });
}

export async function createRevaluationVoucherRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const asOfDate = typeof body.asOfDate === "string" ? body.asOfDate.trim() : "";
  if (!DATE_PATTERN.test(asOfDate)) {
    json(res, 400, { error: "asOfDate 必须形如 YYYY-MM-DD", code: "AS_OF_DATE_INVALID" });
    return;
  }

  const result = await withTransaction((client) =>
    createRevaluationVoucher(client, req.auth!.companyId, asOfDate, req.auth!.userId)
  );

  if (!result.ok) {
    json(res, 400, { error: result.failure!.message, code: result.failure!.code });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "currency.revaluation.create",
    resourceType: "voucher",
    resourceId: result.voucherId!,
    resourceLabel: `${asOfDate} 期末调汇`,
    changes: { lineCount: result.lineCount }
  });
  json(res, 201, {
    voucherId: result.voucherId,
    lineCount: result.lineCount,
    status: "draft",
    notice: "调汇凭证已生成为草稿，请复核汇率与差额后过账。"
  });
}
