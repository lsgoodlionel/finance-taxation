/**
 * 结转损益分录的识别口径 —— 损益类聚合的单一事实来源。
 *
 * ## 问题
 *
 * `closePeriod` 把结转分录写进 `ledger_entries`，`entry_date` 取期末日（**落在被结转
 * 的期间之内**），`source` 标为 `period_closing`。结转的本质就是把 6xxx 损益科目
 * 冲平结转到本年利润，因此这批分录与该期间的业务分录金额恰好相反。
 *
 * 于是任何「按期间聚合损益」的读路径，只要不排除这批分录，结转之后该期间的
 * 收入/成本/费用/净利就会全部塌成 0 —— 利润表、驾驶舱、企业所得税、经营分析、
 * 一致性校验会同时且静默地失真。月结是常规操作，不是边缘场景。
 *
 * ## 口径
 *
 * - **损益聚合**（利润表、驾驶舱盈利概览、所得税应纳税所得额、经营分析）
 *   必须排除结转分录，用 `EXCLUDE_PERIOD_CLOSING_SQL` / `isPeriodClosingEntry`。
 * - **账簿明细列示**（总账、明细账、凭证详情、科目余额）**不得**排除。
 *   结转分录是真实且必要的账簿内容，藏起来会让账簿不完整、也对不上试算平衡。
 * - **资产负债表**同样不排除：结转的对手方是 3131 本年利润，那是权益类的真实余额。
 *
 * 换句话说：排除的是「重复计量」，不是「隐藏凭证」。判断依据永远是
 * 「这个读路径是在算某期间的经营成果吗」，是则排除，否则保留。
 */

/** `ledger_entries.source` 中标记结转损益分录的取值，由 `closePeriod` 写入。 */
export const PERIOD_CLOSING_SOURCE = "period_closing";

/**
 * 用于 SQL `where` 子句的排除条件。
 *
 * 用 `is distinct from` 而非 `<> `：历史分录的 `source` 可能为 NULL，
 * 而 `NULL <> 'period_closing'` 求值为 NULL（即假），会把全部历史业务分录
 * 一并滤掉 —— 那是比原缺陷更糟的静默失真。
 */
export const EXCLUDE_PERIOD_CLOSING_SQL = `source is distinct from '${PERIOD_CLOSING_SOURCE}'`;

/** 在内存中过滤已取出的分录时使用，语义与 `EXCLUDE_PERIOD_CLOSING_SQL` 一致。 */
export function isPeriodClosingEntry(entry: { source?: string | null }): boolean {
  return entry.source === PERIOD_CLOSING_SOURCE;
}
