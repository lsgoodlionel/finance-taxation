/**
 * 金额与「整数分」之间的转换。
 *
 * ## 为什么统一走分
 *
 * 数据库金额列是 `numeric(18,2)`，node-postgres 把它读成字符串。一旦用
 * JavaScript number 做累加，`0.1 + 0.2` 那类误差会在几十次累加后攒成一分钱，
 * 而在会计里「差一分」和「差一万」是同一类问题：账不平就是账不平，没人能判断
 * 这一分是舍入误差还是真错账。全程按整数分算，误差在源头就不存在。
 *
 * ## 已有的副本
 *
 * 同名函数目前另有四份（reports/trial-balance.ts、ai-agents/close/close-drafts.routes.ts、
 * invoices/einvoice-parse.ts、ai-evals/journal-entry-bench.ts）。它们语义并不完全一致
 * —— einvoice-parse 那份对非法输入返回 null。本模块只承接新代码，不动那四处：
 * trial-balance 与 close-drafts 属刚合入的批次 B，此刻改它们只会制造跨批次冲突面。
 * 收敛它们是一件独立的事，需要逐个确认语义差异，不该顺手夹带在固定资产里。
 */

/**
 * 金额转整数分。
 *
 * `Math.round` 而不是 `Math.trunc`：`Number("12.34") * 100` 在浮点下可能是
 * `1233.9999999999998`，截断会丢一分。
 */
export function toCents(value: string | number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100);
}

/** 整数分转 `numeric(18,2)` 可直接接受的字符串。 */
export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
