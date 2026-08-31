/**
 * 税款缴纳记录的录入与查询（V17 阶段三批次 B）。
 *
 * ## 为什么需要这条链路
 *
 * 附加税以**实际缴纳**的增值税为计税依据。这个事实此前在系统里没有落点：
 * 申报批次的状态机到 `submitted` 就结束了，不含「已缴纳」，也不存金额。
 *
 * 没有它，附加税只能按应纳额估算——而应纳与实缴在有留抵、有减免、
 * 分期缴纳时都不相等，用户会拿这个近似值去申报。
 */
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { query } from "../../db/client.js";
import { toDateOnly } from "../../db/date-column.js";
import { uniqueId } from "../../utils/id.js";

interface TaxPaymentRow {
  id: string;
  tax_type: string;
  filing_period: string;
  amount_cents: string;
  paid_on: string | Date;
  voucher_id: string | null;
  note: string;
  created_at: string | Date;
}

function mapRow(row: TaxPaymentRow) {
  return {
    id: row.id,
    taxType: row.tax_type,
    filingPeriod: row.filing_period,
    amountCents: Number(row.amount_cents),
    paidOn: toDateOnly(row.paid_on),
    voucherId: row.voucher_id,
    note: row.note
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function listTaxPayments(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const filingPeriod = url.searchParams.get("filingPeriod");

  const rows = await query<TaxPaymentRow>(
    `select id, tax_type, filing_period, amount_cents::text, paid_on, voucher_id, note, created_at
       from tax_payments
      where company_id = $1
        and ($2::text is null or filing_period = $2)
      order by paid_on desc, created_at desc`,
    [req.auth!.companyId, filingPeriod]
  );

  return json(res, 200, { items: rows.map(mapRow), total: rows.length });
}

export async function createTaxPayment(req: ApiRequest, res: ServerResponse) {
  const body = (req.body ?? {}) as {
    taxType?: string;
    filingPeriod?: string;
    amountCents?: number;
    paidOn?: string;
    voucherId?: string | null;
    note?: string;
  };

  if (!body.taxType) {
    return json(res, 400, { error: "请选择税种。", code: "TAX_PAYMENT_INVALID" });
  }

  // 属期必填：附加税按属期取计税依据，没有它这笔就不知道该归到哪一期。
  if (!body.filingPeriod) {
    return json(res, 400, {
      error: "请填写所属属期（如 2026-08）。附加税按属期取计税依据，缺了它这笔缴款算不进任何一期。",
      code: "TAX_PAYMENT_INVALID"
    });
  }

  // 金额必须是正数。负数在业务上是退税，那是另一件事——
  // 混进「实缴」会把附加税的计税依据算小。
  const amountCents = Number(body.amountCents);
  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents) || amountCents <= 0) {
    return json(res, 400, {
      error: "缴款金额要填正整数（单位：分）。退税不在这里登记。",
      code: "TAX_PAYMENT_INVALID"
    });
  }

  // 缴款日决定这笔计入哪一期。
  if (!body.paidOn || !DATE_PATTERN.test(body.paidOn)) {
    return json(res, 400, {
      error: "请填写缴款日期（YYYY-MM-DD）。",
      code: "TAX_PAYMENT_INVALID"
    });
  }

  const id = uniqueId("txp");
  await query(
    `insert into tax_payments
       (id, company_id, tax_type, filing_period, amount_cents, paid_on, voucher_id, note, created_by)
     values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9)`,
    [
      id,
      req.auth!.companyId,
      body.taxType,
      body.filingPeriod,
      amountCents,
      body.paidOn,
      body.voucherId ?? null,
      body.note ?? "",
      req.auth!.userId
    ]
  );

  return json(res, 201, {
    id,
    taxType: body.taxType,
    filingPeriod: body.filingPeriod,
    amountCents,
    paidOn: body.paidOn
  });
}
