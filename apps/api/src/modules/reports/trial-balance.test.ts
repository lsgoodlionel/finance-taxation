/**
 * 试算平衡表纯计算层的单元测试（V12-B6 / 蓝图 F3）。
 *
 * 这里钉的是**口径**，不是取数：SQL 侧的行为由 trial-balance.integration.test.ts 负责。
 * 分工的理由是这两类缺陷的复现成本差一个数量级——分栏符号规则、损益类期初口径、
 * 空行保留与否，这些用几行内存夹具就能穷举，不该塞进要起库的集成测试里。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrialBalance,
  resolveFiscalYearStart,
  resolveOpeningBasis,
  resolvePeriodRange,
  type TrialBalanceAggregate
} from "./trial-balance.js";

function aggregate(overrides: Partial<TrialBalanceAggregate>): TrialBalanceAggregate {
  return {
    accountCode: "1001",
    accountName: "库存现金",
    category: "asset",
    isRegistered: true,
    isActive: true,
    inceptionOpeningDebit: "0",
    inceptionOpeningCredit: "0",
    fiscalOpeningDebit: "0",
    fiscalOpeningCredit: "0",
    periodDebit: "0",
    periodCredit: "0",
    ...overrides
  };
}

function build(accounts: TrialBalanceAggregate[]) {
  return buildTrialBalance({
    period: "2026-05",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    fiscalYearStart: "2026-01-01",
    accounts
  });
}

// ─── 期间与财年 ──────────────────────────────────────────────────────────────

test("resolvePeriodRange maps YYYY-MM to the first and last day of that month", () => {
  assert.deepEqual(resolvePeriodRange("2026-05"), {
    startDate: "2026-05-01",
    endDate: "2026-05-31"
  });
  assert.deepEqual(resolvePeriodRange("2026-02"), {
    startDate: "2026-02-01",
    endDate: "2026-02-28"
  });
  // 闰年二月：29 天，不能靠固定天数表
  assert.equal(resolvePeriodRange("2024-02").endDate, "2024-02-29");
  assert.equal(resolvePeriodRange("2026-12").endDate, "2026-12-31");
});

test("resolveFiscalYearStart falls back to the natural year until B5 lands fiscal_years", () => {
  // 临时口径：会计年度表（V12-B5）落地前固定取自然年 1 月 1 日。
  // 这条断言是为了让 B5 完成后改动这里时必须显式改测试，而不是悄悄改语义。
  assert.equal(resolveFiscalYearStart("2026-05"), "2026-01-01");
  assert.equal(resolveFiscalYearStart("2026-01"), "2026-01-01");
  assert.equal(resolveFiscalYearStart("2025-12"), "2025-01-01");
});

// ─── 期初口径：损益类按财年，其余按建库至今 ───────────────────────────────────

test("profit-and-loss accounts take the fiscal-year opening basis, others accrue from inception", () => {
  assert.equal(resolveOpeningBasis("6001", "revenue"), "fiscal_year");
  assert.equal(resolveOpeningBasis("6201", "expense"), "fiscal_year");

  assert.equal(resolveOpeningBasis("1002", "asset"), "inception");
  assert.equal(resolveOpeningBasis("2202", "liability"), "inception");
  assert.equal(resolveOpeningBasis("3001", "equity"), "inception");
  // 成本类期末余额即在产品（属存货），跨年结转，与 A5 的资产归类口径一致。
  assert.equal(resolveOpeningBasis("4001", "cost"), "inception");
});

test("unregistered accounts fall back to the A5 balance-sheet classifier, never to a guess", () => {
  // 科目表未登记时用编码兜底，且口径与 classifyBalanceSheetAccount 完全一致。
  assert.equal(resolveOpeningBasis("6001", null), "fiscal_year");
  assert.equal(resolveOpeningBasis("1405", null), "inception");
  assert.equal(resolveOpeningBasis("4101", null), "inception");
  // 完全无法归类的编码不能被当成损益类清零，否则期初会凭空消失。
  assert.equal(resolveOpeningBasis("9999", null), "inception");
});

test("fiscal-year basis only affects profit-and-loss rows", () => {
  const report = build([
    aggregate({
      accountCode: "6001",
      accountName: "主营业务收入",
      category: "revenue",
      // 上年累计贷方 900，本财年内累计贷方 200
      inceptionOpeningCredit: "900",
      fiscalOpeningCredit: "200"
    }),
    aggregate({
      accountCode: "1002",
      accountName: "银行存款",
      category: "asset",
      inceptionOpeningDebit: "900",
      fiscalOpeningDebit: "200"
    })
  ]);

  const revenue = report.rows.find((row) => row.accountCode === "6001")!;
  const bank = report.rows.find((row) => row.accountCode === "1002")!;
  assert.equal(revenue.openingBasis, "fiscal_year");
  assert.equal(revenue.openingCredit, "200.00", "收入类期初只取本财年");
  assert.equal(bank.openingBasis, "inception");
  assert.equal(bank.openingDebit, "900.00", "资产类期初取建库至今");
});

// ─── 六栏数字 ────────────────────────────────────────────────────────────────

test("six columns are opening, period movement, and closing derived from opening plus movement", () => {
  const report = build([
    aggregate({
      accountCode: "1002",
      accountName: "银行存款",
      inceptionOpeningDebit: "1000",
      inceptionOpeningCredit: "300",
      periodDebit: "500",
      periodCredit: "200"
    })
  ]);

  const row = report.rows[0]!;
  // 期初净额 1000 − 300 = 700 → 借方
  assert.equal(row.openingDebit, "700.00");
  assert.equal(row.openingCredit, "0.00");
  // 本期发生额是原始借贷方合计，不轧差
  assert.equal(row.periodDebit, "500.00");
  assert.equal(row.periodCredit, "200.00");
  // 期末净额 700 + 500 − 200 = 1000 → 借方
  assert.equal(row.closingDebit, "1000.00");
  assert.equal(row.closingCredit, "0.00");
});

test("a balance is shown on the side its sign dictates, not on the account's default side", () => {
  // 借方科目出现贷方余额（红字）时必须落在贷方栏——试算平衡恒等式
  // 「Σ期末借 = Σ期末贷」只在符号规则下成立，按科目预设方向分栏会把它打破。
  const report = build([
    aggregate({
      accountCode: "1002",
      category: "asset",
      inceptionOpeningDebit: "100",
      periodCredit: "400"
    })
  ]);

  const row = report.rows[0]!;
  assert.equal(row.closingDebit, "0.00");
  assert.equal(row.closingCredit, "300.00", "净额 −300 必须列在贷方栏");
});

// ─── 表尾合计与差额 ──────────────────────────────────────────────────────────

test("totals balance for a well-formed ledger and expose an explicit zero difference", () => {
  const report = build([
    aggregate({
      accountCode: "1002",
      category: "asset",
      inceptionOpeningDebit: "1000",
      periodDebit: "500"
    }),
    aggregate({
      accountCode: "3001",
      accountName: "实收资本",
      category: "equity",
      inceptionOpeningCredit: "1000",
      periodCredit: "500"
    })
  ]);

  assert.equal(report.totals.opening.debit, "1000.00");
  assert.equal(report.totals.opening.credit, "1000.00");
  assert.equal(report.totals.period.debit, "500.00");
  assert.equal(report.totals.period.credit, "500.00");
  assert.equal(report.totals.closing.debit, "1500.00");
  assert.equal(report.totals.closing.credit, "1500.00");

  for (const group of [report.totals.opening, report.totals.period, report.totals.closing]) {
    assert.equal(group.difference, "0.00");
    assert.equal(group.isBalanced, true);
  }
  assert.equal(report.isBalanced, true);
  assert.deepEqual(report.warnings, []);
});

test("a non-zero difference is surfaced explicitly instead of being rounded away", () => {
  // 单腿分录（数据库约束理论上拦得住）——这张表就是发现它的探针。
  const report = build([
    aggregate({ accountCode: "1002", category: "asset", periodDebit: "100.05" })
  ]);

  assert.equal(report.totals.period.debit, "100.05");
  assert.equal(report.totals.period.credit, "0.00");
  assert.equal(report.totals.period.difference, "100.05");
  assert.equal(report.totals.period.isBalanced, false);
  assert.equal(report.isBalanced, false);
  assert.ok(
    report.warnings.some((warning) => warning.includes("本期发生额借贷不平")),
    `差额非零必须显式告警，实际告警：${JSON.stringify(report.warnings)}`
  );
});

test("cent-level amounts do not drift through floating point when summed", () => {
  // 0.1 + 0.2 !== 0.3 —— 合计若用浮点累加，几千行之后差额会凭空长出来，
  // 而这张表的全部价值就在于「差额非零 = 有问题」。
  const rows = Array.from({ length: 300 }, (_, index) =>
    aggregate({
      accountCode: `100${index % 9}`,
      category: "asset",
      periodDebit: "0.10",
      periodCredit: "0.10"
    })
  );
  const report = build(rows);
  assert.equal(report.totals.period.debit, "30.00");
  assert.equal(report.totals.period.difference, "0.00");
  assert.equal(report.isBalanced, true);
});

// ─── 表的骨架：科目表而非分录 ────────────────────────────────────────────────

test("active accounts with no movement still appear on the table", () => {
  const report = build([
    aggregate({ accountCode: "1001", accountName: "库存现金", isActive: true }),
    aggregate({
      accountCode: "1002",
      accountName: "银行存款",
      isActive: true,
      periodDebit: "100",
      periodCredit: "100"
    })
  ]);

  const codes = report.rows.map((row) => row.accountCode);
  assert.deepEqual(codes, ["1001", "1002"], "启用科目即使六栏全零也必须列出");
  const idle = report.rows.find((row) => row.accountCode === "1001")!;
  assert.equal(idle.isEmpty, true);
  assert.equal(idle.openingDebit, "0.00");
  assert.equal(idle.closingCredit, "0.00");
});

test("disabled accounts are hidden only while they carry nothing", () => {
  const report = build([
    aggregate({ accountCode: "1001", isActive: false }),
    aggregate({ accountCode: "1012", isActive: false, inceptionOpeningDebit: "50" })
  ]);

  const codes = report.rows.map((row) => row.accountCode);
  assert.deepEqual(codes, ["1012"], "停用且全零才隐藏；有余额的停用科目不得消失");
});

test("ledger accounts missing from the chart are listed and flagged, never dropped", () => {
  const report = build([
    aggregate({
      accountCode: "9999",
      accountName: "未登记科目",
      category: null,
      isRegistered: false,
      isActive: false,
      periodDebit: "80"
    }),
    aggregate({ accountCode: "2202", category: "liability", periodCredit: "80" })
  ]);

  const orphan = report.rows.find((row) => row.accountCode === "9999");
  assert.ok(orphan, "账上有余额、科目表没登记的编码必须出现在表上");
  assert.equal(orphan!.isRegistered, false);
  // 金额照常计入合计，否则表会因为「藏了一行」而假性不平
  assert.equal(report.totals.period.debit, "80.00");
  assert.equal(report.isBalanced, true);
  assert.ok(
    report.warnings.some((warning) => warning.includes("9999")),
    "未登记科目必须点名告警"
  );
});

// ─── 上年损益未结平：期初不平时给出可执行的解释 ──────────────────────────────

test("an unclosed prior-year P&L balance is named as the cause of the opening difference", () => {
  const report = build([
    aggregate({
      accountCode: "6001",
      accountName: "主营业务收入",
      category: "revenue",
      // 上年结转过一半：建库至今贷方 500，本财年内 0
      inceptionOpeningCredit: "500",
      fiscalOpeningCredit: "0"
    }),
    aggregate({
      accountCode: "1002",
      category: "asset",
      inceptionOpeningDebit: "500",
      fiscalOpeningDebit: "500"
    })
  ]);

  assert.equal(report.totals.opening.isBalanced, false);
  assert.equal(report.totals.opening.difference, "500.00");
  const warning = report.warnings.find((item) => item.includes("期初余额借贷不平"));
  assert.ok(warning, "期初不平必须告警");
  assert.ok(
    warning!.includes("上一财年未结转") && warning!.includes("500.00"),
    `告警须点明残余金额与成因，实际：${warning}`
  );
});
