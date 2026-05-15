import test from "node:test";
import assert from "node:assert/strict";
import type { ReportSnapshot, RiskFinding, TaxpayerProfile } from "@finance-taxation/domain-model";
import { buildChairmanReportSummary } from "./chairman-summary.js";

test("buildChairmanReportSummary builds concise boss summary", () => {
  const snapshot: ReportSnapshot = {
    id: "snap-1",
    companyId: "cmp-1",
    reportType: "profit_statement",
    periodType: "month",
    periodLabel: "2026-05",
    snapshotDate: "2026-05-31",
    payload: {
      periodLabel: "2026-05",
      revenues: [],
      costsAndExpenses: [],
      totals: {
        revenue: "1000",
        cost: "300",
        grossProfit: "700",
        expenses: "100",
        totalProfit: "600",
        netProfit: "600"
      }
    },
    createdAt: "2026-05-15T00:00:00.000Z"
  };
  const taxpayerProfile: TaxpayerProfile = {
    id: "tp-1",
    companyId: "cmp-1",
    taxpayerType: "general_vat",
    effectiveFrom: "2026-01-01",
    status: "active",
    notes: "",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
  const findings: RiskFinding[] = [
    {
      id: "risk-1",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      ruleCode: "X",
      severity: "high",
      score: 95,
      priority: "P1",
      status: "open",
      title: "重大风险",
      detail: "",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    }
  ];

  const summary = buildChairmanReportSummary({ snapshot, taxpayerProfile, findings });
  assert.equal(summary.reportType, "profit_statement");
  assert.equal(summary.risks[0], "P1 重大风险");
});
