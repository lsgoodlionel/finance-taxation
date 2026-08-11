/**
 * 系统结转分录的识别口径（V12-B5）—— `closing-entries.ts` 那套机制的扩展。
 *
 * ## 为什么不直接改 closing-entries.ts
 *
 * 那个文件定义的是**月末结转损益**这一件事的口径，且被多条读路径引用。年结引入了
 * 第二种「系统生成、不代表业务发生额」的分录，正确做法是复用它的机制（`source`
 * 标记 + `is distinct from` 谓词）而不是把两种语义塞进同一个常量 —— 因为两者的
 * 排除规则并不总是相同：
 *
 * - **损益聚合**（利润表、驾驶舱、所得税）要排除 `period_closing`；年结分录只碰
 *   3131/3141 两个权益科目，本来就不会进损益聚合，排不排除无所谓。
 * - **3131 本年利润的待结转余额**两者都**不能**排除。它取的是累计余额：往年的
 *   已被往年的年结分录冲平，剩下的恰好是本年度待结转的金额（与 `closePeriod` 取
 *   6xxx 余额同一个自我修正机制）。排除年结分录会让累计余额退回「开业至今全部
 *   利润」，于是第二年起每次年结都把此前所有年度重复结转一遍，3141 逐年翻倍。
 * - **账簿列示**（总账、明细账、科目余额、试算平衡）两者都不排除。它们是真实
 *   凭证，藏起来会让账簿不完整、借贷发生额对不上。
 *
 * 所以这里给的是**分别可用的谓词**，不是一个笼统的「排除所有结转」。
 * 判断依据永远是「这个读路径在问什么」。
 *
 * ## `is distinct from` 而不是 `<>`
 *
 * 与 closing-entries.ts 同一个理由：历史分录的 `source` 可能为 NULL，而
 * `NULL <> 'x'` 求值为 NULL（即假），会把全部历史业务分录一并滤掉 —— 那是比原
 * 缺陷更糟的静默失真。
 */

import { PERIOD_CLOSING_SOURCE } from "./closing-entries.js";

/** 年末结转（借 3131 本年利润 / 贷 3141 利润分配）分录的 `source` 取值。 */
export const ANNUAL_CLOSING_SOURCE = "annual_closing";

/** 期初建账分录的 `source` 取值。见迁移 050 的载体选型说明。 */
export const OPENING_BALANCE_SOURCE = "opening_balance";

/** 全部由系统生成的结转分录（月末 + 年末），不含期初 —— 期初是真实余额，不是结转。 */
export const SYSTEM_CLOSING_SOURCES = [PERIOD_CLOSING_SOURCE, ANNUAL_CLOSING_SOURCE] as const;

/**
 * 排除月末 + 年末两种结转分录。「本期真实经营发生额」类的聚合用它。
 *
 * `alias` 用于带 JOIN 的查询：`accounts` 表也有 `source` 列（system/custom），
 * 与 `ledger_entries` 一起 JOIN 时不加限定会得到 "column reference source is
 * ambiguous"。不加别名时行为与 closing-entries.ts 的常量一致。
 */
export function excludeSystemClosingSql(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return SYSTEM_CLOSING_SOURCES.map(
    (source) => `${prefix}source is distinct from '${source}'`
  ).join(" and ");
}

/** 不带表别名的形式，供单表查询直接内联。 */
export const EXCLUDE_SYSTEM_CLOSING_SQL = excludeSystemClosingSql();

/** 期初分录的内存判定。账簿列示要把期初行与业务行区分开时用它。 */
export function isOpeningBalanceEntry(entry: { source?: string | null }): boolean {
  return entry.source === OPENING_BALANCE_SOURCE;
}

/** `EXCLUDE_SYSTEM_CLOSING_SQL` 的内存孪生：过滤已取出的分录时用它，语义必须一致。 */
export function isSystemClosingEntry(entry: { source?: string | null }): boolean {
  return SYSTEM_CLOSING_SOURCES.some((source) => source === entry.source);
}
