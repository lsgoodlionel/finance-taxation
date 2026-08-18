/**
 * 费用超标判定（V13-A1）。
 *
 * `match.ts` 挑出适用的标准，这里把标准与实际金额比出结论。分成两个模块是因为
 * 匹配规则（最具体优先）与超标规则（限额怎么算、超了怎么办）各自会变，
 * 混在一起改一个就必须重读另一个。
 *
 * ## 没有标准时放行
 *
 * 很多公司只管差旅和招待两类费用，其余不设标准。这时必须放行——拦截会让
 * 「还没来得及配标准」的公司完全无法提单，而那是新客户的第一天体验。
 */

import type { ControlCheckResult } from "../controls/result.js";
import type { ExpenseStandard } from "./match.js";

export interface ExpenseStandardCheckInput {
  /** 适用的标准；`null` 表示没有配置（合法状态）。 */
  standard: ExpenseStandard | null;
  /** 实际发生金额（分）。 */
  actualCents: number;
  /** 数量。仅 `per_day` 基准使用（住了几晚）；其余基准忽略。 */
  quantity: number;
}

export interface ExpenseStandardCheckResult extends ControlCheckResult {
  /** 换算后的总限额（分）；没有适用标准时为 null。 */
  limitCents: number | null;
  /** 超标金额（分）；未超标为 0。 */
  overrunCents: number;
}

function yuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * 总限额 = 单位限额 × 数量（仅按日基准）。
 *
 * `per_time` 的语义是「每次报销不超过 X」，`per_month` 是「每月合计不超过 X」，
 * 两者乘以数量都会变成「可以多报几次」——那是对限额的曲解。
 */
function totalLimitCents(standard: ExpenseStandard, quantity: number): number {
  return standard.limitBasis === "per_day" ? standard.limitCents * quantity : standard.limitCents;
}

export function checkExpenseStandard(input: ExpenseStandardCheckInput): ExpenseStandardCheckResult {
  const { standard, actualCents, quantity } = input;

  if (!Number.isInteger(actualCents)) {
    throw new Error(`实际金额必须是整数分，收到 ${actualCents}`);
  }
  if (actualCents < 0) {
    throw new Error(`实际金额不得为负，收到 ${actualCents}`);
  }

  if (standard === null) {
    return {
      level: "ok",
      limitCents: null,
      overrunCents: 0,
      code: "standard.none",
      message: `未配置适用的费用标准，本项不做超标判定（实际 ${yuan(actualCents)} 元）。`
    };
  }

  // 数量只在按日基准下参与计算，但校验对所有基准都做：调用方传 0 或小数说明
  // 上游取数有问题，而按日基准下 0 天会让限额变成 0、任何金额都「超标」。
  // 与其在一种基准下静默误报，不如在所有基准下都拒绝脏输入。
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`数量必须是正整数，收到 ${quantity}`);
  }

  const limitCents = totalLimitCents(standard, quantity);
  const basisNote =
    standard.limitBasis === "per_day"
      ? `限额 ${yuan(standard.limitCents)} 元/天 × ${quantity} 天 = ${yuan(limitCents)} 元`
      : `限额 ${yuan(limitCents)} 元`;

  // 恰好达到限额不算超标：把预算/标准用满是正常行为，不是异常。
  if (actualCents <= limitCents) {
    return {
      level: "ok",
      limitCents,
      overrunCents: 0,
      code: "standard.ok",
      message: `${basisNote}，实际 ${yuan(actualCents)} 元，未超标。`
    };
  }

  const overrunCents = actualCents - limitCents;
  return {
    // 级别直接取标准上配置的策略：同一笔超标，宽严由配置决定，
    // 但超标金额不因策略而变。
    level: standard.overPolicy,
    limitCents,
    overrunCents,
    code: "standard.overrun",
    message: `${basisNote}，实际 ${yuan(actualCents)} 元，超标 ${yuan(overrunCents)} 元。`
  };
}
