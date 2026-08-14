/**
 * 外币凭证的原币逐行分摊（V12-D5 录入侧）。
 *
 * ## 为什么不能按本位币反算
 *
 * 凭证是模板驱动的：用户给一个总额，模板展开成多行。外币业务下**原币是权威输入、
 * 本位币是折算结果**——若逐行按 `本位币 ÷ 汇率` 反算原币，各行之和会因舍入而对不上
 * 用户输入的那个数。而外币余额正是逐行累加出来的，差出去的分会一直留在账上，
 * 期末调汇时被当成汇率变动算进汇兑损益。
 *
 * 所以按比例分摊后**末行扫尾**，保证各行之和严格等于原币总额。这与折旧末期扫尾、
 * 加速折旧排程扫尾是同一套做法。
 *
 * ## 借贷各扫各的
 *
 * 一张凭证借贷两侧各自等于总额，所以两侧要分别分摊、分别扫尾。混在一起扫会让
 * 其中一侧多出或少掉一分。
 */

import { RATE_SCALE } from "./revaluation.js";

export interface AllocatableLine {
  debitCents: number;
  creditCents: number;
}

/**
 * 把原币总额按各行本位币金额的比例分摊到每一行。
 *
 * 返回数组与入参等长，元素是该行的原币金额（外币分）。
 * 借方各行之和、贷方各行之和都严格等于 `totalForeignCents`。
 */
export function allocateForeignAmounts(
  lines: readonly AllocatableLine[],
  totalForeignCents: number,
  rate: number
): number[] {
  const result = new Array<number>(lines.length).fill(0);

  for (const side of ["debit", "credit"] as const) {
    const indexes = lines
      .map((line, index) => ({ index, amount: side === "debit" ? line.debitCents : line.creditCents }))
      .filter((item) => item.amount > 0);
    if (indexes.length === 0) continue;

    const sideTotal = indexes.reduce((sum, item) => sum + item.amount, 0);
    if (sideTotal <= 0) continue;

    let allocated = 0;
    for (const [position, item] of indexes.entries()) {
      const isFinal = position === indexes.length - 1;
      // 末行扫尾：把除不尽的分给最后一行，而不是让各行四舍五入后总额飘走
      const amount = isFinal
        ? totalForeignCents - allocated
        : Math.round((totalForeignCents * item.amount) / sideTotal);
      result[item.index] = amount;
      allocated += amount;
    }
  }

  return result;
}

/**
 * 本位币金额（分）= 原币 × 汇率。
 *
 * 与 `revaluation.ts` 的 `convertToBaseCents` 是同一个换算，这里再导出一次是为了
 * 让录入路径不必依赖调汇模块——两者的调用时机完全不同（录入是逐笔实时，调汇是
 * 期末批量），但换算必须是同一套，所以复用实现而非各写一遍。
 */
export function foreignToBaseCents(foreignCents: number, rate: number): number {
  return Math.round((foreignCents * rate) / RATE_SCALE);
}
