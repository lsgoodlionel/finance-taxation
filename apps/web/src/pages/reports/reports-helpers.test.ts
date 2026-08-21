import {
  defaultReportsView,
  formatSnapshotLabel,
  parseSnapshotPeriod,
  pickLatestSnapshotId,
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
// 月结 / 审计 / 稽核资料包已移交 /export-center（同一 closing-bundle 接口，
// 且那边会登记导出历史与审计轨迹），本页不再自带期间推导。

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

// ─── 快照期间解析（P1 重算）──────────────────────────────────────────────────
// 解析错了会静默生成一份期间不对的报表，覆盖掉原来那份——比解析不出来严重得多。

function ok(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

ok(
  JSON.stringify(parseSnapshotPeriod("2026-07")) ===
    JSON.stringify({ periodType: "month", year: 2026, month: 7, quarter: 3 }),
  "月度标签解析出年月，并带上对应季度"
);

ok(
  JSON.stringify(parseSnapshotPeriod("2026 Q3")) ===
    JSON.stringify({ periodType: "quarter", year: 2026, month: 9, quarter: 3 }),
  "季度标签不能被当成 3 月"
);

ok(
  JSON.stringify(parseSnapshotPeriod("2026")) ===
    JSON.stringify({ periodType: "year", year: 2026, month: 12, quarter: 4 }),
  "年度标签解析为整年"
);

ok(parseSnapshotPeriod("2026-13") === null, "13 月不是有效期间，返回 null 而不是硬算");
ok(parseSnapshotPeriod("2026-00") === null, "0 月同样无效");
ok(parseSnapshotPeriod("2026 Q5") === null, "没有第 5 季度");
ok(parseSnapshotPeriod("") === null, "空标签返回 null");
ok(parseSnapshotPeriod("上个月") === null, "认不出的格式一律 null，让调用方禁用按钮");
