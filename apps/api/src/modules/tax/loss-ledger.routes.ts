/**
 * 以前年度亏损台账的录入与查询（V17 阶段三批次 C）。
 *
 * ## 为什么要能手工录
 *
 * 亏损台账的第一批数据来自**系统上线之前**——企业换系统时，
 * 前几年的亏损还在结转期内。自动生成只能覆盖系统里发生的年度，
 * 覆盖不了历史，而历史那几笔恰恰是最急着用的。
 *
 * 自动生成（年度结账时按当年亏损登记一条）是后续项，不在批次 C。
 */
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { query } from "../../db/client.js";
import { uniqueId } from "../../utils/id.js";

interface LossLedgerRow {
  id: string;
  loss_year: number;
  loss_cents: string;
  offset_cents: string;
  note: string;
}

function mapRow(row: LossLedgerRow) {
  return {
    id: row.id,
    lossYear: row.loss_year,
    lossCents: Number(row.loss_cents),
    offsetCents: Number(row.offset_cents),
    /** 剩余可弥补额。**算出来的，不入库**——存它意味着每次弥补都要回写。 */
    remainingCents: Number(row.loss_cents) - Number(row.offset_cents),
    note: row.note
  };
}

export async function listLossLedgerEntries(req: ApiRequest, res: ServerResponse) {
  const rows = await query<LossLedgerRow>(
    `select id, loss_year, loss_cents::text, offset_cents::text, note
       from loss_carryforward_ledger
      where company_id = $1
      order by loss_year`,
    [req.auth!.companyId]
  );
  return json(res, 200, { items: rows.map(mapRow), total: rows.length });
}

export async function createLossLedgerEntry(req: ApiRequest, res: ServerResponse) {
  const body = (req.body ?? {}) as {
    lossYear?: number;
    lossCents?: number;
    offsetCents?: number;
    note?: string;
  };

  const lossYear = Number(body.lossYear);
  if (!Number.isInteger(lossYear) || lossYear < 1980 || lossYear > 2200) {
    return json(res, 400, {
      error: "请填写亏损所属年度（四位年份）。",
      code: "LOSS_LEDGER_INVALID"
    });
  }

  // 亏损额存正数。存负数会让「亏了多少」和「补了多少」符号相反，
  // 弥补计算里到处都要判符号，迟早有一处判反。
  const lossCents = Number(body.lossCents);
  if (!Number.isInteger(lossCents) || lossCents <= 0) {
    return json(res, 400, {
      error: "亏损额要填正整数（单位：分）。盈利年度不需要登记台账。",
      code: "LOSS_LEDGER_INVALID"
    });
  }

  const offsetCents = body.offsetCents === undefined ? 0 : Number(body.offsetCents);
  if (!Number.isInteger(offsetCents) || offsetCents < 0 || offsetCents > lossCents) {
    return json(res, 400, {
      error: "已弥补额要在 0 与亏损额之间。",
      code: "LOSS_LEDGER_INVALID"
    });
  }

  const existing = await query<{ id: string }>(
    `select id from loss_carryforward_ledger where company_id = $1 and loss_year = $2`,
    [req.auth!.companyId, lossYear]
  );
  if (existing.length > 0) {
    return json(res, 409, {
      error: `${lossYear} 年的亏损台账已经登记过了。同一年度只能有一条——两条会被重复弥补。`,
      code: "LOSS_LEDGER_DUPLICATE"
    });
  }

  const id = uniqueId("lcf");
  await query(
    `insert into loss_carryforward_ledger
       (id, company_id, loss_year, loss_cents, offset_cents, note)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, req.auth!.companyId, lossYear, lossCents, offsetCents, body.note ?? ""]
  );

  return json(res, 201, { id, lossYear, lossCents, offsetCents });
}
