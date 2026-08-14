/**
 * 期末调汇的取数与凭证生成（V12-D5）。
 *
 * 规则本身在 `revaluation.ts`（纯函数、可单测）。这里只负责：从总账汇总外币余额、
 * 取期末汇率、按规则算出差额、生成**草稿**凭证。
 *
 * ## 为什么生成 draft 而不直接过账
 *
 * 与折旧计提、红冲、增值税结转、期末结转损益一致：系统生成的凭证一律 draft，
 * 由人复核后过账。调汇尤其如此——汇率是人填的，填错一位小数就是一笔凭空的损益。
 */

import type { PoolClient } from "pg";
import { uniqueId } from "../../utils/id.js";
import {
  BASE_CURRENCY,
  revalueMonetaryItem,
  type MonetaryCategory,
  type RevaluationResult
} from "./revaluation.js";

/** 汇兑损益科目（迁移 076）。 */
export const EXCHANGE_GAIN_LOSS_CODE = "660303";
export const EXCHANGE_GAIN_LOSS_NAME = "财务费用-汇兑损益";

/**
 * 参与调汇的科目语义。
 *
 * 与 `settlement/settleable-accounts.ts` 同一个思路：按 `account_type` 判定而不是
 * 硬编码科目码，D3 那种编码变更就不用改这里。
 *
 * **`asset_prepayment` 不在列**：预付账款是以历史成本计量的非货币性项目，
 * 准则 19 号第十二条明确不调（`revaluation.ts` 也有一条用例钉住）。
 */
const MONETARY_ACCOUNT_TYPES: Readonly<Record<string, MonetaryCategory>> = {
  asset_cash: "asset",
  asset_receivable: "asset",
  liability_payable: "liability",
  liability_advance_receipt: "liability",
  liability_borrowing: "liability",
  liability_non_current: "liability"
};

interface BalanceRow {
  account_code: string;
  account_name: string;
  account_type: string;
  currency: string;
  foreign_balance: string;
  base_balance: string;
}

export interface RevaluationLine {
  accountCode: string;
  accountName: string;
  currency: string;
  foreignBalanceCents: number;
  baseBookBalanceCents: number;
  closingRate: number | null;
  result: RevaluationResult | null;
  /** 取不到期末汇率时的说明。 */
  blockedReason?: string;
}

export interface RevaluationPreview {
  asOfDate: string;
  lines: RevaluationLine[];
  /** 汇兑损益合计（分）。正数是收益，负数是损失。 */
  netGainLossCents: number;
  /** 缺汇率的币种。有缺口时不生成凭证——半张调汇凭证比不调更难查。 */
  missingRates: string[];
}

/**
 * 截至某日的外币余额（按科目 × 币种）。
 *
 * 外币余额取 `original_amount` 的借贷净额，本位币余额取 `debit - credit`。
 * 两者必须同源同口径，否则差额里会混进取数偏差而不只是汇率变动。
 */
export async function loadForeignBalances(
  client: PoolClient,
  companyId: string,
  asOfDate: string
): Promise<BalanceRow[]> {
  const result = await client.query<BalanceRow>(
    `select e.account_code,
            max(e.account_name) as account_name,
            max(a.account_type) as account_type,
            e.currency,
            sum(case when e.debit > 0 then e.original_amount else -e.original_amount end)::text
              as foreign_balance,
            sum(e.debit - e.credit)::text as base_balance
       from ledger_entries e
       left join accounts a on a.company_id = e.company_id and a.code = e.account_code
      where e.company_id = $1
        and e.entry_date <= $2::date
        and e.currency <> $3
      group by e.account_code, e.currency
      having sum(case when e.debit > 0 then e.original_amount else -e.original_amount end) <> 0
      order by e.account_code, e.currency`,
    [companyId, asOfDate, BASE_CURRENCY]
  );
  return result.rows;
}

/** 某日适用的汇率：取该日或之前最近一天的挂牌价。 */
export async function resolveClosingRate(
  client: PoolClient,
  companyId: string,
  currency: string,
  asOfDate: string
): Promise<number | null> {
  const result = await client.query<{ rate: string }>(
    `select rate::text from exchange_rates
      where company_id = $1 and currency = $2 and rate_date <= $3::date
      order by rate_date desc
      limit 1`,
    [companyId, currency, asOfDate]
  );
  const row = result.rows[0];
  return row ? Number(row.rate) : null;
}

function toCentsFromAmount(value: string | null): number {
  return Math.round(Number(value ?? 0) * 100);
}

/** 期末调汇预览：算给人看，不落库、不生成凭证。 */
export async function previewRevaluation(
  client: PoolClient,
  companyId: string,
  asOfDate: string
): Promise<RevaluationPreview> {
  const rows = await loadForeignBalances(client, companyId, asOfDate);
  const rateCache = new Map<string, number | null>();
  const lines: RevaluationLine[] = [];
  const missingRates = new Set<string>();
  let netGainLossCents = 0;

  for (const row of rows) {
    if (!rateCache.has(row.currency)) {
      rateCache.set(row.currency, await resolveClosingRate(client, companyId, row.currency, asOfDate));
    }
    const closingRate = rateCache.get(row.currency) ?? null;
    const foreignBalanceCents = toCentsFromAmount(row.foreign_balance);
    const baseBookBalanceCents = toCentsFromAmount(row.base_balance);
    const category = MONETARY_ACCOUNT_TYPES[row.account_type ?? ""];

    if (!category) {
      // 科目不是货币性项目（或未登记 account_type）。不调、也不算缺汇率——
      // 它本来就不该进调汇。
      lines.push({
        accountCode: row.account_code,
        accountName: row.account_name,
        currency: row.currency,
        foreignBalanceCents,
        baseBookBalanceCents,
        closingRate,
        result: null,
        blockedReason: "非货币性项目或科目未登记 account_type，不参与调汇。"
      });
      continue;
    }

    if (closingRate === null) {
      missingRates.add(row.currency);
      lines.push({
        accountCode: row.account_code,
        accountName: row.account_name,
        currency: row.currency,
        foreignBalanceCents,
        baseBookBalanceCents,
        closingRate: null,
        result: null,
        blockedReason: `缺少 ${row.currency} 在 ${asOfDate} 或之前的汇率，请先维护汇率。`
      });
      continue;
    }

    const result = revalueMonetaryItem({
      accountCode: row.account_code,
      accountName: row.account_name,
      category,
      currency: row.currency,
      foreignBalanceCents,
      baseBookBalanceCents,
      closingRate
    });
    if (result.needsAdjustment) {
      netGainLossCents += result.isGain ? Math.abs(result.differenceCents) : -Math.abs(result.differenceCents);
    }
    lines.push({
      accountCode: row.account_code,
      accountName: row.account_name,
      currency: row.currency,
      foreignBalanceCents,
      baseBookBalanceCents,
      closingRate,
      result
    });
  }

  return { asOfDate, lines, netGainLossCents, missingRates: [...missingRates] };
}

export interface RevaluationVoucherLine {
  accountCode: string;
  accountName: string;
  summary: string;
  debit: string;
  credit: string;
}

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * 把预览结果转成凭证行。
 *
 * 各外币科目一行，汇兑损益**合并成一行**：一次调汇是一个整体动作，逐笔拆开会让
 * 财务费用明细账多出十几行金额琐碎的分录，而它们的业务含义完全相同。
 */
export function buildRevaluationLines(preview: RevaluationPreview): RevaluationVoucherLine[] {
  const lines: RevaluationVoucherLine[] = [];
  let gainLossDebitCents = 0;
  let gainLossCreditCents = 0;

  for (const line of preview.lines) {
    if (!line.result?.needsAdjustment) continue;
    const amount = Math.abs(line.result.differenceCents);
    const isDebit = line.result.accountSide === "debit";
    lines.push({
      accountCode: line.accountCode,
      accountName: line.accountName,
      summary: `期末调汇 ${line.currency} @ ${(line.closingRate! / 1_000_000).toFixed(6)}`,
      debit: isDebit ? formatAmount(amount) : "0.00",
      credit: isDebit ? "0.00" : formatAmount(amount)
    });
    if (line.result.gainLossSide === "debit") gainLossDebitCents += amount;
    else gainLossCreditCents += amount;
  }

  if (lines.length === 0) return [];

  // 借贷两侧都有时轧差成一行：一张凭证里同一科目既借又贷会让明细账难读，
  // 而净额才是本期真实的汇兑损益。
  const net = gainLossDebitCents - gainLossCreditCents;
  lines.push({
    accountCode: EXCHANGE_GAIN_LOSS_CODE,
    accountName: EXCHANGE_GAIN_LOSS_NAME,
    summary: net >= 0 ? "期末调汇净损失" : "期末调汇净收益",
    debit: net >= 0 ? formatAmount(net) : "0.00",
    credit: net >= 0 ? "0.00" : formatAmount(-net)
  });
  return lines;
}

export interface CreateRevaluationVoucherResult {
  ok: boolean;
  voucherId?: string;
  lineCount?: number;
  failure?: { code: string; message: string };
}

/** 生成期末调汇的**草稿**凭证。 */
export async function createRevaluationVoucher(
  client: PoolClient,
  companyId: string,
  asOfDate: string,
  createdBy: string
): Promise<CreateRevaluationVoucherResult> {
  const preview = await previewRevaluation(client, companyId, asOfDate);

  if (preview.missingRates.length > 0) {
    // 缺汇率就整张不生成。生成半张调汇凭证比不调更难查——账上会出现一部分
    // 币种调了、一部分没调，而凭证本身看不出缺了谁。
    return {
      ok: false,
      failure: {
        code: "EXCHANGE_RATE_MISSING",
        message: `缺少这些币种在 ${asOfDate} 或之前的汇率：${preview.missingRates.join("、")}。请先维护汇率再调汇。`
      }
    };
  }

  const lines = buildRevaluationLines(preview);
  if (lines.length === 0) {
    return {
      ok: false,
      failure: { code: "REVALUATION_NOT_NEEDED", message: "没有需要调整的外币余额。" }
    };
  }

  const period = asOfDate.slice(0, 7);
  const voucherId = uniqueId("vch");
  await client.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period)
     values ($1, $2, 'general', $3, 'draft', 'currency_revaluation', $4::date, $5)`,
    [voucherId, companyId, `${period} 期末调汇`, asOfDate, period]
  );

  for (const [index, line] of lines.entries()) {
    await client.query(
      `insert into voucher_lines
         (id, voucher_id, company_id, summary, account_code, account_name, debit, credit, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9)`,
      [
        uniqueId("vl"),
        voucherId,
        companyId,
        line.summary,
        line.accountCode,
        line.accountName,
        line.debit,
        line.credit,
        index + 1
      ]
    );
  }

  return { ok: true, voucherId, lineCount: lines.length };
}
