import test from "node:test";
import assert from "node:assert/strict";
import type { BalanceSheetReport, ReportSnapshot } from "@finance-taxation/domain-model";
import { buildReportDiff } from "./snapshots.js";

test("buildReportDiff compares two balance sheet snapshots", () => {
  const payloadA: BalanceSheetReport = {
    periodLabel: "2026-04",
    asOfDate: "2026-04-30",
    assets: [{ code: "1002", label: "银行存款", amount: "100" }],
    liabilities: [],
    equity: [{ code: "3131", label: "本年利润", amount: "100" }],
    totals: {
      assets: "100",
      liabilities: "0",
      equity: "100",
      liabilitiesAndEquity: "100"
    }
  };
  const payloadB: BalanceSheetReport = {
    periodLabel: "2026-05",
    asOfDate: "2026-05-31",
    assets: [{ code: "1002", label: "银行存款", amount: "180" }],
    liabilities: [],
    equity: [{ code: "3131", label: "本年利润", amount: "180" }],
    totals: {
      assets: "180",
      liabilities: "0",
      equity: "180",
      liabilitiesAndEquity: "180"
    }
  };

  const fromSnapshot: ReportSnapshot = {
    id: "snap-a",
    companyId: "cmp-1",
    reportType: "balance_sheet",
    periodType: "month",
    periodLabel: "2026-04",
    snapshotDate: "2026-04-30",
    payload: payloadA,
    createdAt: "2026-05-15T00:00:00.000Z"
  };
  const toSnapshot: ReportSnapshot = {
    id: "snap-b",
    companyId: "cmp-1",
    reportType: "balance_sheet",
    periodType: "month",
    periodLabel: "2026-05",
    snapshotDate: "2026-05-31",
    payload: payloadB,
    createdAt: "2026-05-15T00:00:00.000Z"
  };

  const diff = buildReportDiff(fromSnapshot, toSnapshot);
  assert.equal(diff.lines[0]?.code, "1002");
  assert.equal(diff.lines[0]?.delta, "80");
});
