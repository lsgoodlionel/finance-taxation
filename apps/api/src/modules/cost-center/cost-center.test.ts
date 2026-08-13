import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCostCenterReport,
  describeUnassigned,
  isCostCenterApplicable,
  UNASSIGNED_ALERT_THRESHOLD,
  type CostEntry
} from "./cost-center.js";

function entry(overrides: Partial<CostEntry> & Pick<CostEntry, "amountCents">): CostEntry {
  return {
    costCenterId: "cc-sales",
    costCenterName: "销售部",
    accountCode: "660203",
    accountName: "管理费用-差旅费",
    ...overrides
  };
}

test("费用类与成本类科目适用成本中心", () => {
  assert.equal(
    isCostCenterApplicable({ code: "660203", category: "expense", accountType: "expense" }),
    true
  );
  assert.equal(
    isCostCenterApplicable({ code: "4001", category: "cost", accountType: "cost_production" }),
    true
  );
});

test("资产负债类不适用——银行存款不属于任何部门", () => {
  assert.equal(
    isCostCenterApplicable({ code: "1002", category: "asset", accountType: "asset_cash" }),
    false
  );
  assert.equal(
    isCostCenterApplicable({ code: "2202", category: "liability", accountType: "liability_payable" }),
    false
  );
  assert.equal(
    isCostCenterApplicable({ code: "6001", category: "revenue", accountType: "income_main" }),
    false
  );
});

test("所得税费用是费用类里唯一的例外", () => {
  assert.equal(
    isCostCenterApplicable({ code: "6801", category: "expense", accountType: "expense_tax" }),
    false,
    "公司整体税负摊到部门头上，会让部门多出一块既不能控制也无法解释的数字"
  );
});

test("判据用 category 而非逐个列举 account_type", () => {
  // 一个将来才会出现的新 account_type，只要 category 对就该适用——
  // 逐个列举的话，漏掉新类型会让那一档费用悄悄从部门报表里消失
  assert.equal(
    isCostCenterApplicable({ code: "660299", category: "expense", accountType: "expense_brand_new" }),
    true
  );
});

test("按成本中心汇总，同科目合并、按金额倒序", () => {
  const report = buildCostCenterReport("2026-06", [
    entry({ amountCents: 30_000_00 }),
    entry({ amountCents: 20_000_00, accountCode: "660201", accountName: "管理费用-办公费" }),
    entry({ amountCents: 10_000_00 }),
    entry({ amountCents: 80_000_00, costCenterId: "cc-rd", costCenterName: "研发部" })
  ]);

  assert.equal(report.totalCents, 140_000_00);
  assert.equal(report.rows[0]?.costCenterName, "研发部", "金额大的排前面");
  assert.equal(report.rows[0]?.totalCents, 80_000_00);

  const sales = report.rows.find((row) => row.costCenterId === "cc-sales")!;
  assert.equal(sales.totalCents, 60_000_00);
  assert.equal(sales.accounts.length, 2, "同一科目的多笔合并成一行");
  assert.equal(sales.accounts[0]?.amountCents, 40_000_00, "差旅费 3 万 + 1 万");
});

test("未指定成本中心单独成行，既不丢弃也不摊派", () => {
  const report = buildCostCenterReport("2026-06", [
    entry({ amountCents: 90_000_00 }),
    entry({ amountCents: 10_000_00, costCenterId: null, costCenterName: "未指定成本中心" })
  ]);

  assert.equal(report.totalCents, 100_000_00);
  assert.equal(report.unassignedCents, 10_000_00);

  const sum = report.rows.reduce((acc, row) => acc + row.totalCents, 0);
  assert.equal(sum, report.totalCents, "丢弃会让各部门合计对不上费用总额");

  const sales = report.rows.find((row) => row.costCenterId === "cc-sales")!;
  assert.equal(sales.totalCents, 90_000_00, "摊派会把无人认领的费用变成每个部门都要背的数字");
});

test("占比按各行金额除以总额", () => {
  const report = buildCostCenterReport("2026-06", [
    entry({ amountCents: 75_000_00 }),
    entry({ amountCents: 25_000_00, costCenterId: "cc-rd", costCenterName: "研发部" })
  ]);
  assert.equal(report.rows[0]?.share, 0.75);
  assert.equal(report.rows[1]?.share, 0.25);
});

test("总额为 0 时占比给 0 而不是 NaN", () => {
  const report = buildCostCenterReport("2026-06", [
    entry({ amountCents: 10_000_00 }),
    entry({ amountCents: -10_000_00 })
  ]);
  assert.equal(report.totalCents, 0);
  assert.equal(report.rows[0]?.share, 0, "NaN 会在界面上渲染成 NaN%");
});

test("红冲走负数，抵减本期费用", () => {
  const report = buildCostCenterReport("2026-06", [
    entry({ amountCents: 50_000_00 }),
    entry({ amountCents: -20_000_00 })
  ]);
  assert.equal(report.rows[0]?.totalCents, 30_000_00);
});

test("空期间给出零而不是报错", () => {
  const report = buildCostCenterReport("2026-06", []);
  assert.equal(report.totalCents, 0);
  assert.deepEqual(report.rows, []);
  assert.equal(describeUnassigned(report), null);
});

test("未指定比例超阈值时提示这张表已不足以支撑分析", () => {
  const report = buildCostCenterReport("2026-06", [
    entry({ amountCents: 80_000_00 }),
    entry({ amountCents: 20_000_00, costCenterId: null, costCenterName: "未指定成本中心" })
  ]);
  assert.ok(report.unassignedCents / report.totalCents >= UNASSIGNED_ALERT_THRESHOLD);
  const message = describeUnassigned(report)!;
  assert.match(message, /20\.0%/);
  assert.match(message, /不足以支撑分析/);
});

test("未指定比例较低时只作提示，不报警", () => {
  const report = buildCostCenterReport("2026-06", [
    entry({ amountCents: 99_000_00 }),
    entry({ amountCents: 1_000_00, costCenterId: null, costCenterName: "未指定成本中心" })
  ]);
  const message = describeUnassigned(report)!;
  assert.match(message, /已单列在「未指定」一行/);
  assert.doesNotMatch(message, /不足以支撑分析/);
});
