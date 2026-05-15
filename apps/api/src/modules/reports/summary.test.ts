import test from "node:test";
import assert from "node:assert/strict";
import type { LedgerEntry } from "@finance-taxation/domain-model";
import {
  buildBalanceSheetReport,
  buildCashFlowReport,
  buildProfitStatementReport
} from "./summary.js";

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
