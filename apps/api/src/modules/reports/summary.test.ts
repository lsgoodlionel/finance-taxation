import test from "node:test";
import assert from "node:assert/strict";
import type { LedgerEntry } from "@finance-taxation/domain-model";
import {
  buildBalanceSheetReport,
  buildCashFlowReport,
  buildProfitStatementReport
} from "./summary.js";
import { classifyBalanceSheetAccount } from "./balance-sheet-accounts.js";

const entries: LedgerEntry[] = [
  {
    id: "le-1",
    companyId: "cmp-1",
    voucherId: "v-1",
    businessEventId: "evt-sales",
    entryDate: "2026-05-10",
    summary: "销售收款",
    accountCode: "1002",
    accountName: "银行存款",
    debit: "1000.00",
    credit: "0.00",
    source: "voucher_posting",
    postedAt: "2026-05-10T01:00:00.000Z"
  },
  {
    id: "le-2",
    companyId: "cmp-1",
    voucherId: "v-1",
    businessEventId: "evt-sales",
    entryDate: "2026-05-10",
    summary: "销售收款",
    accountCode: "6001",
    accountName: "主营业务收入",
    debit: "0.00",
    credit: "1000.00",
    source: "voucher_posting",
    postedAt: "2026-05-10T01:00:00.000Z"
  },
  {
    id: "le-3",
    companyId: "cmp-1",
    voucherId: "v-2",
    businessEventId: "evt-cost",
    entryDate: "2026-05-11",
    summary: "主营成本",
    accountCode: "6001c",
    accountName: "主营业务成本",
    debit: "300.00",
    credit: "0.00",
    source: "voucher_posting",
    postedAt: "2026-05-11T01:00:00.000Z"
  },
  {
    id: "le-4",
    companyId: "cmp-1",
    voucherId: "v-2",
    businessEventId: "evt-cost",
    entryDate: "2026-05-11",
    summary: "主营成本",
    accountCode: "1403",
    accountName: "库存商品",
    debit: "0.00",
    credit: "300.00",
    source: "voucher_posting",
    postedAt: "2026-05-11T01:00:00.000Z"
  },
  {
    id: "le-5",
    companyId: "cmp-1",
    voucherId: "v-3",
    businessEventId: "evt-rnd",
    entryDate: "2026-05-12",
    summary: "研发支出",
    accountCode: "1801001",
    accountName: "研发支出-费用化支出",
    debit: "200.00",
    credit: "0.00",
    source: "voucher_posting",
    postedAt: "2026-05-12T01:00:00.000Z"
  },
  {
    id: "le-6",
    companyId: "cmp-1",
    voucherId: "v-3",
    businessEventId: "evt-rnd",
    entryDate: "2026-05-12",
    summary: "研发支出",
    accountCode: "1002",
    accountName: "银行存款",
    debit: "0.00",
    credit: "200.00",
    source: "voucher_posting",
    postedAt: "2026-05-12T01:00:00.000Z"
  }
];

test("buildProfitStatementReport aggregates revenue, cost, and profit", () => {
  const report = buildProfitStatementReport({
    periodLabel: "2026-05",
    entries
  });

  assert.equal(report.totals.revenue, "1000");
  assert.equal(report.totals.cost, "300");
  assert.equal(report.totals.grossProfit, "700");
  assert.equal(report.totals.expenses, "0");
  assert.equal(report.totals.netProfit, "700");
});

test("buildProfitStatementReport keeps income tax out of 营业总成本 and 利润总额", () => {
  // Arrange：在基础分录上追加一笔所得税费用（借 6801 / 贷 2221）
  const incomeTaxEntries: LedgerEntry[] = [
    ...entries,
    {
      id: "le-tax-1",
      companyId: "cmp-1",
      voucherId: "v-tax",
      businessEventId: "evt-tax",
      entryDate: "2026-05-31",
      summary: "计提所得税",
      accountCode: "6801",
      accountName: "所得税费用",
      debit: "100.00",
      credit: "0.00",
      source: "voucher_posting",
      postedAt: "2026-05-31T01:00:00.000Z"
    },
    {
      id: "le-tax-2",
      companyId: "cmp-1",
      voucherId: "v-tax",
      businessEventId: "evt-tax",
      entryDate: "2026-05-31",
      summary: "计提所得税",
      accountCode: "2221",
      accountName: "应交税费",
      debit: "0.00",
      credit: "100.00",
      source: "voucher_posting",
      postedAt: "2026-05-31T01:00:00.000Z"
    }
  ];

  // Act
  const report = buildProfitStatementReport({ periodLabel: "2026-05", entries: incomeTaxEntries });

  // Assert：展示口径 grossProfit - expenses = totalProfit，所得税只在净利润扣一次
  assert.equal(report.totals.grossProfit, "700");
  assert.equal(report.totals.expenses, "0");
  assert.equal(report.totals.totalProfit, "700");
  // 所得税单列，前端才能解释「利润总额 700 → 净利润 600」之间的 100 是什么
  assert.equal(report.totals.incomeTax, "100");
  assert.equal(report.totals.netProfit, "600");
  // 6801 金额仍以明细行保留在报表中
  assert.equal(report.costsAndExpenses.some((line) => line.code === "6801" && line.amount === "100"), true);
});

test("buildProfitStatementReport reports zero 所得税费用 when the period has no 6801 entries", () => {
  // Act
  const report = buildProfitStatementReport({ periodLabel: "2026-05", entries });

  // Assert：无所得税时该口径仍存在且为 0，净利润等于利润总额
  assert.equal(report.totals.incomeTax, "0");
  assert.equal(report.totals.netProfit, report.totals.totalProfit);
});

test("buildBalanceSheetReport builds assets and equity totals as of end date", () => {
  const report = buildBalanceSheetReport({
    periodLabel: "2026-05",
    asOfDate: "2026-05-31",
    entries
  });

  assert.equal(report.totals.assets, "700");
  assert.equal(report.totals.liabilitiesAndEquity, "700");
  assert.equal(report.assets.some((item) => item.code === "1002"), true);
  assert.equal(report.equity.some((item) => item.code === "3131"), true);
});

function makeEntry(
  id: string,
  accountCode: string,
  accountName: string,
  debit: string,
  credit: string
): LedgerEntry {
  return {
    id,
    companyId: "cmp-1",
    voucherId: `v-${id}`,
    businessEventId: `evt-${id}`,
    entryDate: "2026-04-30",
    summary: accountName,
    accountCode,
    accountName,
    debit,
    credit,
    source: "voucher_posting",
    postedAt: "2026-04-30T08:30:00.000Z"
  };
}

// 复刻 2026-04 真实数据：6602 未登记在科目主数据里，修复前被利润表静默丢弃，
// 却被资产负债表计入费用 —— 两张表对同一份数据给出不同的净利润。
const unregisteredAccountEntries: LedgerEntry[] = [
  makeEntry("ue-1", "1002", "银行存款", "300000.00", "0.00"),
  makeEntry("ue-2", "6001", "主营业务收入", "0.00", "300000.00"),
  makeEntry("ue-3", "6401", "财务费用", "183000.00", "0.00"),
  makeEntry("ue-4", "6601", "职工薪酬（成本）", "15000.00", "0.00"),
  makeEntry("ue-5", "6602", "管理费用-工资", "8000.00", "0.00"),
  makeEntry("ue-6", "2211", "应付职工薪酬", "0.00", "206000.00")
];

test("buildProfitStatementReport counts expenses booked to accounts missing from the chart", () => {
  // Act
  const report = buildProfitStatementReport({
    periodLabel: "2026-04",
    entries: unregisteredAccountEntries
  });

  // Assert：修复前 expenses = 198000（6602 的 8000 被丢弃），利润虚高 8000
  assert.equal(report.totals.expenses, "206000");
  assert.equal(report.totals.totalProfit, "94000");
  assert.equal(report.totals.netProfit, "94000");
  // 明细行同样不能漏，否则合计与明细对不上
  assert.equal(
    report.costsAndExpenses.some((line) => line.code === "6602" && line.amount === "8000"),
    true
  );
});

test("profit statement and balance sheet agree on net profit for the same entries", () => {
  // Arrange：同一份分录，同一期间——两表本就必须给出同一个净利润
  const period = { periodLabel: "2026-04", entries: unregisteredAccountEntries };

  // Act
  const profitReport = buildProfitStatementReport(period);
  const balanceSheet = buildBalanceSheetReport({ ...period, asOfDate: "2026-04-30" });
  const retainedEarnings = balanceSheet.equity.find((line) => line.code === "3131");

  // Assert：资产负债表的本年利润 = 利润表净利润（修复前分别是 94000 与 102000）
  assert.equal(retainedEarnings?.amount, profitReport.totals.netProfit);
  assert.equal(retainedEarnings?.amount, "94000");
  // 净利润正确才配平：资产 300000 = 负债 206000 + 权益 94000
  assert.equal(balanceSheet.totals.assets, balanceSheet.totals.liabilitiesAndEquity);
});

test("both reports subtract income tax exactly once and stay in agreement", () => {
  // Arrange：追加所得税费用（6801 借 20000 / 应交税费 贷 20000）
  const withTax: LedgerEntry[] = [
    ...unregisteredAccountEntries,
    makeEntry("ue-tax-1", "6801", "所得税费用", "20000.00", "0.00"),
    makeEntry("ue-tax-2", "2221", "应交税费", "0.00", "20000.00")
  ];

  // Act
  const profitReport = buildProfitStatementReport({ periodLabel: "2026-04", entries: withTax });
  const balanceSheet = buildBalanceSheetReport({
    periodLabel: "2026-04",
    asOfDate: "2026-04-30",
    entries: withTax
  });

  // Assert：利润总额不含所得税，净利润只减一次
  assert.equal(profitReport.totals.totalProfit, "94000");
  assert.equal(profitReport.totals.netProfit, "74000");
  // 资产负债表的本年利润按净利润口径（含所得税），与利润表一致
  assert.equal(
    balanceSheet.equity.find((line) => line.code === "3131")?.amount,
    profitReport.totals.netProfit
  );
});

test("buildCashFlowReport classifies operating and investing cash flows", () => {
  const report = buildCashFlowReport({
    periodLabel: "2026-05",
    entries
  });

  assert.equal(report.totals.operatingNetCash, "1000");
  assert.equal(report.totals.investingNetCash, "-200");
  assert.equal(report.totals.financingNetCash, "0");
  assert.equal(report.totals.netCashChange, "800");
});

// ─── V11：结转损益分录的处理口径（见 ledger/closing-entries.ts） ──────────────

/**
 * 构造一条结转损益分录。`LedgerEntry.source` 的类型目前被窄化成
 * `"voucher_posting"` 字面量，而 closePeriod 实际会写入 `"period_closing"`，
 * 因此这里必须绕过类型（类型与运行时的偏差已在报告中记录）。
 */
function makeClosingEntry(
  id: string,
  accountCode: string,
  accountName: string,
  debit: string,
  credit: string
): LedgerEntry {
  return {
    ...makeEntry(id, accountCode, accountName, debit, credit),
    summary: "期末结转 2026-04",
    source: "period_closing"
  };
}

/**
 * 2026-04 业务分录：银行存款 1000 / 主营业务收入 1000，主营业务成本 400 / 库存商品 400。
 * 净利润 600。每张凭证自身平衡，可用于验证资产负债表恒等式。
 */
const aprilBusinessEntries: LedgerEntry[] = [
  makeEntry("v11-1", "1002", "银行存款", "1000.00", "0.00"),
  makeEntry("v11-2", "6001", "主营业务收入", "0.00", "1000.00"),
  makeEntry("v11-3", "6001c", "主营业务成本", "400.00", "0.00"),
  makeEntry("v11-4", "1405", "库存商品", "0.00", "400.00")
];

/** 4 月的结转分录：借 6001 1000 / 贷 6001c 400 / 贷 3131 600。 */
const aprilClosingEntries: LedgerEntry[] = [
  makeClosingEntry("v11-c1", "6001", "主营业务收入", "1000.00", "0.00"),
  makeClosingEntry("v11-c2", "6001c", "主营业务成本", "0.00", "400.00"),
  makeClosingEntry("v11-c3", "3131", "本年利润", "0.00", "600.00")
];

test("profit statement excludes period-closing entries so a closed period keeps its results", () => {
  // Arrange：同一期间，一份只有业务分录、一份追加了结转分录
  const period = { periodLabel: "2026-04", entries: aprilBusinessEntries };
  const closed = { periodLabel: "2026-04", entries: [...aprilBusinessEntries, ...aprilClosingEntries] };

  // Act
  const before = buildProfitStatementReport(period);
  const after = buildProfitStatementReport(closed);

  // Assert：结转不是经营活动，利润表必须逐项不变（旧实现全部塌成 0）
  assert.deepEqual(after.totals, before.totals);
  assert.equal(after.totals.revenue, "1000");
  assert.equal(after.totals.cost, "400");
  assert.equal(after.totals.netProfit, "600");
  // 明细行同样要保持，否则合计与明细互相矛盾
  assert.deepEqual(after.revenues, before.revenues);
  assert.deepEqual(after.costsAndExpenses, before.costsAndExpenses);
});

test("balance sheet lists 本年利润 exactly once and stays balanced across closing states", () => {
  const sheetFor = (entries: LedgerEntry[], asOfDate: string) =>
    buildBalanceSheetReport({ periodLabel: "2026-04", asOfDate, entries });

  const assertBalanced = (sheet: ReturnType<typeof sheetFor>, label: string) => {
    assert.equal(
      sheet.equity.filter((line) => line.code === "3131").length,
      1,
      `${label}：本年利润只能出现一行`
    );
    assert.equal(
      sheet.totals.assets,
      sheet.totals.liabilitiesAndEquity,
      `${label}：资产必须等于负债加所有者权益`
    );
  };

  // 状态 A：未结转 —— 3131 无账面余额，利润由合成行承载
  const open = sheetFor(aprilBusinessEntries, "2026-04-30");
  assertBalanced(open, "未结转");
  assert.equal(open.equity.find((l) => l.code === "3131")?.amount, "600");

  // 状态 B：已结转 —— 3131 有账面余额 600，未结转利润为 0，合计不得变化
  const closed = sheetFor([...aprilBusinessEntries, ...aprilClosingEntries], "2026-04-30");
  assertBalanced(closed, "已结转");
  assert.equal(closed.equity.find((l) => l.code === "3131")?.amount, "600");
  assert.deepEqual(closed.totals, open.totals, "结转不改变资产负债表任何合计");

  // 状态 C：部分结转（月结后的常态）—— 4 月已结转，5 月又有 300 未结转利润。
  // 旧实现在这里会 push 两行 3131（合成的 300 + 循环里的 900），权益虚增 300。
  const halfClosed = sheetFor(
    [
      ...aprilBusinessEntries,
      ...aprilClosingEntries,
      { ...makeEntry("v11-5", "1002", "银行存款", "300.00", "0.00"), entryDate: "2026-05-10" },
      { ...makeEntry("v11-6", "6001", "主营业务收入", "0.00", "300.00"), entryDate: "2026-05-10" }
    ],
    "2026-05-31"
  );
  assertBalanced(halfClosed, "部分结转");
  assert.equal(
    halfClosed.equity.find((l) => l.code === "3131")?.amount,
    "900",
    "本年利润 = 已结转的 600 + 尚未结转的 300"
  );
});

test("balance sheet keeps closing entries in scope so 本年利润 is never double counted", () => {
  // 这条专门守住"不要顺手给资产负债表也加排除过滤"：若排除了结转分录，
  // netProfit 会回到 600（全部利润），再叠上 3131 的账面 600 → 权益虚增一倍。
  const sheet = buildBalanceSheetReport({
    periodLabel: "2026-04",
    asOfDate: "2026-04-30",
    entries: [...aprilBusinessEntries, ...aprilClosingEntries]
  });
  assert.equal(sheet.equity.find((l) => l.code === "3131")?.amount, "600");
  assert.equal(sheet.totals.equity, "600");
});

// ─────────────────────────────────────────────────────────────────────────────
// V12-A5：任意科目都不会被静默丢弃（蓝图 E4）
//
// 旧实现按首位数字 `if 1 / else if 2 / else if 3`，**没有 else**：4 开头的生产成本
// 4001 / 制造费用 4101 既不进资产也不进负债权益，直接从表上消失，制造业客户的
// 资产负债表因此不平。这组断言比那个具体修复更重要——它守的是「不会再有下一个
// 被丢弃的科目段位」。
// ─────────────────────────────────────────────────────────────────────────────

function entryOf(id: string, accountCode: string, debit: string, credit: string): LedgerEntry {
  return {
    id,
    companyId: "cmp-1",
    voucherId: `v-${id}`,
    businessEventId: `evt-${id}`,
    entryDate: "2026-04-10",
    summary: accountCode,
    accountCode,
    accountName: accountCode,
    debit,
    credit,
    source: "voucher_posting",
    postedAt: "2026-04-10T08:00:00.000Z"
  };
}

/** 报表上出现过该科目代码的所有位置。 */
function locateCode(report: ReturnType<typeof buildBalanceSheetReport>, code: string): string[] {
  const sections: Array<[string, { code: string }[]]> = [
    ["assets", report.assets],
    ["liabilities", report.liabilities],
    ["equity", report.equity],
    ["unclassified", report.unclassified]
  ];
  return sections.filter(([, lines]) => lines.some((l) => l.code === code)).map(([name]) => name);
}

test("A5 断言：任意科目代码的余额都不会从资产负债表上静默消失", () => {
  // 覆盖已登记科目 + 当前未使用的编码段 + 畸形代码。非损益科目必须能在表上找到；
  // 损益科目必须体现在「本年利润」里。两者都不允许「哪儿都找不到」。
  const probeCodes = [
    "1001", "1002", "1602", "2202", "222102", "3001", "3131",
    "4001", "4101", "400199",          // 成本类：此前被丢弃的那一段
    "5001", "7001", "8888", "9999",    // 尚未启用的编码段
    "abc", "中文科目", "1;DROP TABLE"    // 畸形输入（写入路径目前不校验，见蓝图 E2）
  ];

  for (const code of probeCodes) {
    // 每个科目单独建一张表：借该科目 500，贷对手科目 500，保证被探测科目有非零余额。
    // 对手科目默认用银行存款；探测的正是银行存款时改用实收资本，避免自身对冲成 0
    // 被 nonZeroLines 过滤掉，那样测的就不是「是否被丢弃」了。
    const contraCode = code === "1002" ? "3001" : "1002";
    const report = buildBalanceSheetReport({
      periodLabel: "2026-04",
      asOfDate: "2026-04-30",
      entries: [
        entryOf(`probe-${code}-d`, code, "500.00", "0.00"),
        entryOf(`probe-${code}-c`, contraCode, "0.00", "500.00")
      ]
    });

    const found = locateCode(report, code);
    const isProfitAndLoss = classifyBalanceSheetAccount(code) === "profitAndLoss";

    if (isProfitAndLoss) {
      // 损益类不单独成行，但其净额必须体现在权益的本年利润上，否则也是丢弃。
      assert.ok(
        report.equity.some((l) => l.code === "3131"),
        `损益科目 ${code} 的余额没有汇入本年利润，等同被丢弃`
      );
      continue;
    }

    assert.notDeepEqual(
      found, [],
      `科目 ${JSON.stringify(code)} 在资产负债表上无处可寻——这正是 4001 当年消失的方式`
    );
  }
});

test("A5：生产成本 4001 计入资产，资产负债表重新平衡", () => {
  // 制造业典型分录：领料投入生产。旧实现下借方 4001 消失、贷方 1002 照常入表，
  // 资产合计凭空少 800，A = L + E 被打破。
  const report = buildBalanceSheetReport({
    periodLabel: "2026-04",
    asOfDate: "2026-04-30",
    entries: [
      entryOf("mfg-1", "1002", "10000.00", "0.00"),
      entryOf("mfg-2", "3001", "0.00", "10000.00"),
      entryOf("mfg-3", "4001", "800.00", "0.00"),
      entryOf("mfg-4", "1002", "0.00", "800.00")
    ]
  });

  assert.equal(report.assets.find((l) => l.code === "4001")?.amount, "800");
  assert.equal(report.assets.find((l) => l.code === "1002")?.amount, "9200");
  assert.equal(report.totals.assets, "10000");
  assert.equal(report.totals.liabilitiesAndEquity, "10000", "资产 = 负债 + 权益");
  assert.deepEqual(report.unclassified, []);
  assert.deepEqual(report.warnings, []);
});

test("A5：制造费用 4101 同样计入资产", () => {
  const report = buildBalanceSheetReport({
    periodLabel: "2026-04",
    asOfDate: "2026-04-30",
    entries: [
      entryOf("oh-1", "4101", "300.00", "0.00"),
      entryOf("oh-2", "2202", "0.00", "300.00")
    ]
  });

  assert.equal(report.assets.find((l) => l.code === "4101")?.amount, "300");
  assert.equal(report.totals.assets, "300");
  assert.equal(report.totals.liabilitiesAndEquity, "300");
});

test("A5：真正无法归类的科目显式列出并告警，不计入合计", () => {
  const report = buildBalanceSheetReport({
    periodLabel: "2026-04",
    asOfDate: "2026-04-30",
    entries: [
      entryOf("unk-1", "1002", "1000.00", "0.00"),
      entryOf("unk-2", "3001", "0.00", "1000.00"),
      entryOf("unk-3", "9999", "250.00", "0.00"),
      entryOf("unk-4", "1002", "0.00", "250.00")
    ]
  });

  assert.deepEqual(
    report.unclassified.map((l) => ({ code: l.code, amount: l.amount })),
    [{ code: "9999", amount: "250" }]
  );
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0]!, /9999/);
  assert.match(report.warnings[0]!, /未纳入资产负债表口径/);

  // 未分类余额不掺进合计：掺进去会把「科目没归好类」伪装成「表是平的」。
  assert.equal(report.totals.assets, "750");
  assert.equal(report.totals.liabilitiesAndEquity, "1000");
});

test("A5：正常账套 unclassified 与 warnings 恒为空", () => {
  const report = buildBalanceSheetReport({
    periodLabel: "2026-05",
    asOfDate: "2026-05-31",
    entries
  });

  assert.deepEqual(report.unclassified, []);
  assert.deepEqual(report.warnings, []);
});

test("A5：零余额的未分类科目不产生噪音告警", () => {
  const report = buildBalanceSheetReport({
    periodLabel: "2026-04",
    asOfDate: "2026-04-30",
    entries: [
      entryOf("z-1", "9999", "100.00", "0.00"),
      entryOf("z-2", "9999", "0.00", "100.00")
    ]
  });

  assert.deepEqual(report.unclassified, []);
  assert.deepEqual(report.warnings, []);
});
