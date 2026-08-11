import test from "node:test";
import assert from "node:assert/strict";
import {
  AGING_BUCKETS,
  bucketFor,
  buildAgingReport,
  daysBetween,
  type OpenItem
} from "./aging.js";
import { classifyEntrySide } from "./settleable-accounts.js";

const AS_OF = "2026-06-30";

function item(overrides: Partial<OpenItem> & Pick<OpenItem, "entryId" | "entryDate">): OpenItem {
  return {
    counterpartyId: "cp-1",
    counterpartyName: "甲客户",
    accountCode: "1122",
    accountName: "应收账款",
    summary: "销售货款",
    originalCents: 100_000_00,
    settledCents: 0,
    creditDays: 0,
    ...overrides
  };
}

test("桶边界是闭区间：第 30 天仍属 30 天以内", () => {
  assert.equal(bucketFor(0).key, "0-30");
  assert.equal(bucketFor(30).key, "0-30");
  assert.equal(bucketFor(31).key, "31-60");
  assert.equal(bucketFor(60).key, "31-60");
  assert.equal(bucketFor(61).key, "61-90");
  assert.equal(bucketFor(365).key, "181-365");
  assert.equal(bucketFor(366).key, "365+");
});

test("未来日期的分录归入第一桶而非报错", () => {
  assert.equal(bucketFor(-5).key, "0-30");
});

test("daysBetween 跨月跨年正确", () => {
  assert.equal(daysBetween("2026-06-30", "2026-06-30"), 0);
  assert.equal(daysBetween("2026-05-31", "2026-06-30"), 30);
  assert.equal(daysBetween("2025-06-30", "2026-06-30"), 365);
  assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
});

test("已全额核销的笔不进账龄表", () => {
  const report = buildAgingReport(
    [item({ entryId: "e1", entryDate: "2026-01-01", settledCents: 100_000_00 })],
    AS_OF,
    "receivable"
  );
  assert.equal(report.totalCents, 0);
  assert.equal(report.items.length, 0, "结清的笔留在表里会让应收合计变成历史交易总额");
});

test("部分核销只把未结清余额计入账龄", () => {
  const report = buildAgingReport(
    [item({ entryId: "e1", entryDate: "2026-06-01", settledCents: 30_000_00 })],
    AS_OF,
    "receivable"
  );
  assert.equal(report.totalCents, 70_000_00);
  assert.equal(report.items[0]?.openCents, 70_000_00);
});

test("账龄按发生日算，逾期按信用账期另算", () => {
  // 90 天前发生，信用账期 60 天 → 账龄 90 天，逾期 30 天
  const report = buildAgingReport(
    [item({ entryId: "e1", entryDate: "2026-04-01", creditDays: 60 })],
    AS_OF,
    "receivable"
  );
  const aged = report.items[0]!;
  assert.equal(aged.agingDays, 90);
  assert.equal(aged.bucketKey, "61-90", "账龄口径与合同账期无关");
  assert.equal(aged.overdueDays, 30);
  assert.equal(report.overdueCents, 100_000_00);
});

test("账期内的笔账龄照常计算但不算逾期", () => {
  const report = buildAgingReport(
    [item({ entryId: "e1", entryDate: "2026-06-01", creditDays: 60 })],
    AS_OF,
    "receivable"
  );
  assert.equal(report.items[0]?.agingDays, 29);
  assert.equal(report.items[0]?.overdueDays, 0);
  assert.equal(report.overdueCents, 0);
});

test("分户合计与总额一致，且按金额倒序", () => {
  const report = buildAgingReport(
    [
      item({ entryId: "e1", entryDate: "2026-06-01", originalCents: 10_000_00 }),
      item({
        entryId: "e2",
        entryDate: "2026-01-01",
        counterpartyId: "cp-2",
        counterpartyName: "乙客户",
        originalCents: 50_000_00
      }),
      item({ entryId: "e3", entryDate: "2026-03-01", originalCents: 20_000_00 })
    ],
    AS_OF,
    "receivable"
  );

  assert.equal(report.totalCents, 80_000_00);
  const sum = report.counterparties.reduce((acc, row) => acc + row.totalCents, 0);
  assert.equal(sum, report.totalCents);

  assert.equal(report.counterparties[0]?.counterpartyName, "乙客户", "金额大的排前面");
  assert.equal(report.counterparties[0]?.totalCents, 50_000_00);
  assert.equal(report.counterparties[1]?.totalCents, 30_000_00);
  assert.equal(report.counterparties[1]?.itemCount, 2);
});

test("没有往来单位的笔归入未指定分组而不是被丢掉", () => {
  const report = buildAgingReport(
    [
      item({ entryId: "e1", entryDate: "2026-06-01", originalCents: 10_000_00 }),
      item({
        entryId: "e2",
        entryDate: "2026-06-01",
        counterpartyId: null,
        counterpartyName: "未指定往来单位",
        originalCents: 7_000_00
      })
    ],
    AS_OF,
    "receivable"
  );

  assert.equal(report.totalCents, 17_000_00);
  const sum = report.counterparties.reduce((acc, row) => acc + row.totalCents, 0);
  assert.equal(sum, report.totalCents, "丢掉无档案的笔会让分户合计对不上总额");
  assert.ok(report.counterparties.some((row) => row.counterpartyId === null));
});

test("各桶金额之和等于总额", () => {
  const report = buildAgingReport(
    [
      item({ entryId: "e1", entryDate: "2026-06-20", originalCents: 1_000_00 }),
      item({ entryId: "e2", entryDate: "2026-05-20", originalCents: 2_000_00 }),
      item({ entryId: "e3", entryDate: "2026-03-20", originalCents: 3_000_00 }),
      item({ entryId: "e4", entryDate: "2025-12-20", originalCents: 4_000_00 }),
      item({ entryId: "e5", entryDate: "2024-01-20", originalCents: 5_000_00 })
    ],
    AS_OF,
    "receivable"
  );

  const bucketSum = AGING_BUCKETS.reduce((sum, b) => sum + (report.bucketCents[b.key] ?? 0), 0);
  assert.equal(bucketSum, report.totalCents);
  assert.equal(report.bucketCents["365+"], 5_000_00);
});

test("classifyEntrySide：应收借方是发生、贷方是核销", () => {
  assert.equal(classifyEntrySide("asset_receivable", 100, 0), "open");
  assert.equal(classifyEntrySide("asset_receivable", 0, 100), "settle");
});

test("classifyEntrySide：应付方向完全相反", () => {
  assert.equal(classifyEntrySide("liability_payable", 0, 100), "open");
  assert.equal(classifyEntrySide("liability_payable", 100, 0), "settle");
});

test("classifyEntrySide：非往来科目一律 none", () => {
  assert.equal(classifyEntrySide("expense_direct_cost", 100, 0), "none");
  assert.equal(classifyEntrySide("asset_receivable", 0, 0), "none");
});
