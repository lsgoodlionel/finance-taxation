import test from "node:test";
import assert from "node:assert/strict";
import {
  AGING_BUCKETS,
  bucketFor,
  buildAgingReport,
  daysBetween,
  type OpenItem
} from "./aging.js";
import { classifyEntrySide, SETTLEABLE_ACCOUNT_TYPES } from "./settleable-accounts.js";

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

test("classifyEntrySide：预收账款收款是发生、发货结转是核销", () => {
  // 收到客户预付款：借 银行存款 / 贷 预收账款 —— 贷方形成「我欠客户货」
  assert.equal(classifyEntrySide("liability_advance_receipt", 0, 100), "open");
  // 发货确认收入：借 预收账款 / 贷 主营业务收入 —— 借方了结这笔义务
  assert.equal(classifyEntrySide("liability_advance_receipt", 100, 0), "settle");
});

/**
 * 往来科目的资产/负债对称性护栏。
 *
 * 049 把负债侧的往来科目单边漏掉了：资产侧 1131 应收利息、1221 其他应收款都进了
 * `asset_receivable`，负债侧对称的 2231 应付利息、2241 其他应付款却留在泛化的
 * `liability_current` 里，于是**有真实写入路径的科目核销不了**——员工垫付款挂
 * 2241（差旅、采购、事项路由、凭证模板四处在写），却查不出「谁垫了多少、还欠多少」。
 *
 * 这条钉住对称关系本身。将来再加一个可核销的资产类型而忘了负债侧（或反过来），
 * 立刻红——而不是等到某个客户发现账龄表少了一半。
 */
test("每个可核销的资产类型都有对称的负债类型，反之亦然", () => {
  const SYMMETRY = [
    { asset: "asset_receivable", liability: "liability_payable" },
    { asset: "asset_prepayment", liability: "liability_advance_receipt" }
  ];

  const settleable = new Set(SETTLEABLE_ACCOUNT_TYPES.map((item) => item.accountType));
  const missing = SYMMETRY.flatMap((pair) =>
    [pair.asset, pair.liability].filter((type) => !settleable.has(type))
  );
  assert.deepEqual(missing, [], `这些往来类型没有纳入核销，账龄表会缺一半：${missing.join("、")}`);

  // 对称两侧的发生方必须相反：资产侧借方发生，负债侧贷方发生。
  // 搞反的话账龄表会把收款当成新欠款、把欠款当成核销，数字全反。
  for (const pair of SYMMETRY) {
    const asset = SETTLEABLE_ACCOUNT_TYPES.find((item) => item.accountType === pair.asset);
    const liability = SETTLEABLE_ACCOUNT_TYPES.find((item) => item.accountType === pair.liability);
    assert.equal(asset?.openSide, "debit", `${pair.asset} 的发生方应在借方`);
    assert.equal(liability?.openSide, "credit", `${pair.liability} 的发生方应在贷方`);
  }
});
