import {
  defaultReportsView,
  formatSnapshotLabel,
  pickLatestSnapshotId,
  resolveBundlePeriodLabel,
  resolveInitialReportsView
} from "./reports-helpers";

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

// ── V7 K3：guided 默认落「老板摘要」，pro 保持三表工作台 ─────────────────────
assertEqual(resolveInitialReportsView("guided"), "chairman", "expected guided default view to be chairman summary");
assertEqual(resolveInitialReportsView("pro"), "balanceSheet", "expected pro default view unchanged");

// ── 最新快照挑选（snapshotDate 降序） ────────────────────────────────────────
assertEqual(pickLatestSnapshotId([]), null, "expected null when no snapshots");
assertEqual(
  pickLatestSnapshotId([
    { id: "s1", snapshotDate: "2026-05-31" },
    { id: "s3", snapshotDate: "2026-07-14" },
    { id: "s2", snapshotDate: "2026-06-30" }
  ]),
  "s3",
  "expected the snapshot with the latest date"
);
