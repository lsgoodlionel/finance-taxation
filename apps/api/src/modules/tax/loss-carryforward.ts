/**
 * 弥补以前年度亏损（V17 阶段三批次 C）。
 *
 * ## 这一层解决什么
 *
 * 批次 A 把本期亏损带出来了（不再被 `Math.max(x, 0)` 抹平），但系统里
 * **没有以前年度亏损的台账**——只知道「今年亏了多少」，不知道
 * 「前几年还剩多少可以补」。于是盈利年度的应纳税所得额一分不减，
 * 企业按全额缴税，而法律给的弥补权利用不上。
 *
 * ## 为什么顺序重要
 *
 * 「先亏先补」在总额相同时看不出差别，但一旦有亏损接近超期就会差出
 * 真金白银：早年的先超期，留着不用等于白白作废。
 *
 * 政策依据见 `docs/v17-tax-rate-policy/POLICY-MAP-CIT-SURTAX.md` 第 2.3 节。
 */
import { query } from "../../db/client.js";

/** 一般企业结转 5 年（企业所得税法第十八条）。 */
const DEFAULT_CARRYFORWARD_YEARS = 5;

/** 高新技术企业、科技型中小企业结转 10 年（财税〔2018〕76 号）。 */
const HIGH_TECH_CARRYFORWARD_YEARS = 10;

export interface LossLedgerEntry {
  /** 亏损所属年度。 */
  lossYear: number;
  /** 该年度的亏损额（分，正数）。 */
  lossCents: number;
  /** 已在以后年度弥补掉的金额（分）。 */
  offsetCents: number;
}

export type LossCarryforwardResult = {
  /** 本次弥补的总额（分）。 */
  offsetCents: number;
  /** 弥补后的应纳税所得额（分）。亏损年度原样带出负数。 */
  remainingIncomeCents: number;
  /** 本次各年度实际弥补了多少，按弥补顺序排列。 */
  applied: Array<{ lossYear: number; appliedCents: number }>;
  /**
   * 已超过结转年限、不能再弥补的台账。
   *
   * **单独列出来**：一笔权利作废了，用户得知道，而不是让它悄悄消失。
   */
  expired: Array<{ lossYear: number; remainingCents: number }>;
};

export function resolveCarryforwardYears(input: { isHighTech: boolean }): number {
  return input.isHighTech ? HIGH_TECH_CARRYFORWARD_YEARS : DEFAULT_CARRYFORWARD_YEARS;
}

/**
 * 用以前年度亏损弥补本期应纳税所得额。
 *
 * @returns 弥补明细与弥补后的余额。
 */
export function applyLossCarryforward(input: {
  /** 弥补前的应纳税所得额（分）。负数 = 本期亏损。 */
  taxableIncomeCents: number;
  /** 当前年度。 */
  currentYear: number;
  losses: readonly LossLedgerEntry[];
  /** 结转年限，见 `resolveCarryforwardYears`。 */
  carryforwardYears: number;
}): LossCarryforwardResult {
  const { taxableIncomeCents, currentYear, carryforwardYears } = input;

  // 先亏先补：按亏损年度从早到晚。
  const sorted = [...input.losses].sort((a, b) => a.lossYear - b.lossYear);

  const expired: LossCarryforwardResult["expired"] = [];
  const usable: LossLedgerEntry[] = [];

  for (const entry of sorted) {
    const remaining = entry.lossCents - entry.offsetCents;
    if (remaining <= 0) continue;

    // 结转窗口是**含**第 N 年：2021 年的亏损、5 年结转，2022..2026 都能补。
    const isExpired = currentYear - entry.lossYear > carryforwardYears;
    if (isExpired) {
      expired.push({ lossYear: entry.lossYear, remainingCents: remaining });
      continue;
    }
    usable.push(entry);
  }

  // 本期亏损时不动用以前年度的额度——没有所得可以补，
  // 而本期这笔亏损本身要成为新的一条台账。
  if (taxableIncomeCents <= 0) {
    return {
      offsetCents: 0,
      remainingIncomeCents: taxableIncomeCents,
      applied: [],
      expired
    };
  }

  let remainingIncome = taxableIncomeCents;
  const applied: LossCarryforwardResult["applied"] = [];

  for (const entry of usable) {
    if (remainingIncome <= 0) break;
    const available = entry.lossCents - entry.offsetCents;
    // 弥补不产生新的亏损：最多补到应纳税所得额为 0。
    const appliedCents = Math.min(available, remainingIncome);
    applied.push({ lossYear: entry.lossYear, appliedCents });
    remainingIncome -= appliedCents;
  }

  return {
    offsetCents: taxableIncomeCents - remainingIncome,
    remainingIncomeCents: remainingIncome,
    applied,
    expired
  };
}

/**
 * 读公司的亏损台账。
 *
 * 按年度从早到晚返回——**先亏先补**的顺序在这里就定下来，
 * 免得每个调用方各排一次，排漏一个就静默用错顺序。
 */
export async function loadLossLedger(companyId: string): Promise<LossLedgerEntry[]> {
  const rows = await query<{
    loss_year: number;
    loss_cents: string;
    offset_cents: string;
  }>(
    `select loss_year, loss_cents::text, offset_cents::text
       from loss_carryforward_ledger
      where company_id = $1
      order by loss_year`,
    [companyId]
  );
  return rows.map((row) => ({
    lossYear: row.loss_year,
    lossCents: Number(row.loss_cents),
    offsetCents: Number(row.offset_cents)
  }));
}
