import { buildPayrollLinkageSummary } from "./payroll-linkage";

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const summary = buildPayrollLinkageSummary({
  taxItemCount: 2,
  voucherCount: 1,
  confirmedCount: 3,
  totalCount: 3,
  linkedEventId: "evt-payroll-1"
});

expectEqual(summary.readiness, "ready_for_tax_review", "all confirmed records with event should be tax-review ready");
expectEqual(summary.highlights[0], "已确认 3/3 条工资记录", "summary should include confirmation progress");
expectEqual(summary.highlights[1], "已生成 2 条税务事项", "summary should include tax item count");
expectEqual(summary.highlights[2], "已生成 1 张凭证草稿", "summary should include voucher count");

const pending = buildPayrollLinkageSummary({
  taxItemCount: 0,
  voucherCount: 0,
  confirmedCount: 1,
  totalCount: 3,
  linkedEventId: null
});

expectEqual(pending.readiness, "pending_confirmation", "unconfirmed records should block readiness");
expectEqual(pending.highlights[0], "已确认 1/3 条工资记录", "pending summary should reflect confirmation status");

console.log("payroll-linkage-ok");
