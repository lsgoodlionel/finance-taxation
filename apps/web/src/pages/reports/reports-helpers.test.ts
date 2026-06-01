import { defaultReportsView, formatSnapshotLabel, resolveBundlePeriodLabel } from "./reports-helpers";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(defaultReportsView, "balanceSheet", "expected default workbench view");
assertEqual(
  formatSnapshotLabel({ reportType: "profit_statement", periodLabel: "2026-05" }),
  "2026-05 利润表",
  "expected snapshot label"
);
assertEqual(
  resolveBundlePeriodLabel("audit", { year: 2026, month: 5, quarter: 2 }, "2026-05"),
  "2026-05",
  "expected audit bundle to prefer loaded period label"
);
