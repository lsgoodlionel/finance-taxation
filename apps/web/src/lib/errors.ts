/**
 * 面板级的错误文案与日期小工具。
 *
 * `errorMessage` 此前在六个面板里各有一份**逐字相同**的实现（TaxRatePanel、
 * BankReconciliationPage、FixedAssetsPanel、RecurringVouchersPanel、AgingPanel、
 * CostCenterPanel）——批次 C/D 一路复制出来的。加第七份的时候收敛掉：
 * 重复是真实的而不是猜测的，六处一致也说明它没有分叉的语义需求。
 *
 * 与 `utils/money.ts` 那次 `toCents` 收敛的判断标准一致：行为完全一致的才合并，
 * 语义不同的（如 einvoice-parse 的 toCentsOrNull）宁可改名保留。
 */

/** 从 unknown 错误里取可展示的文案，取不到就用兜底。 */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** 今天的 ISO 日期（YYYY-MM-DD），用作日期选择器的默认值。 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
