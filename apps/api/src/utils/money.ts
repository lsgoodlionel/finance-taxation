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
 * ## 副本已收敛（V12 收尾）
 *
 * 曾另有四份同名函数。三份（reports/trial-balance.ts、ai-agents/close/close-drafts.routes.ts、
 * ai-evals/journal-entry-bench.ts）行为与本模块完全一致，已全部改为引用这里。
 *
 * 第四份**刻意保留**：`invoices/einvoice-parse.ts` 的 `toCentsOrNull` 对非法输入
 * 返回 null 而不是 0。它解析的是外部电子发票文件，分不清「金额确实是 0」和
 * 「这个字段根本没解析出来」会让一张坏票被当成零元票静默入库；而报表汇总里
 * 缺失即 0 才是对的。两处需求相反，合并只会逼其中一处将就——所以它改了名字
 * 以示区别，而不是合并。
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
