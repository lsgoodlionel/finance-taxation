import test from "node:test";
import assert from "node:assert/strict";
import type { ProfitStatementReport, RndProjectSummary, TaxItem } from "@finance-taxation/domain-model";
import { buildCorporateIncomeTaxPreparation } from "./corporate-income-tax.js";

test("buildCorporateIncomeTaxPreparation estimates prepayment and checklist", () => {
  const profitStatement: ProfitStatementReport = {
    periodLabel: "2026 Q2",
    revenues: [],
    costsAndExpenses: [],
    totals: {
      revenue: "100000",
      cost: "30000",
      grossProfit: "70000",
      expenses: "20000",
      totalProfit: "50000",
      netProfit: "50000"
    }
  };

  const taxItems: TaxItem[] = [
    {
      id: "tx-ent",
      companyId: "cmp-1",
      businessEventId: "evt-ent",
      mappingId: "m-ent",
      taxType: "企业所得税",
      treatment: "业务招待费纳税调整关注",
      basis: "2000",
      filingPeriod: "2026-Q2",
      status: "review_required",
      source: "analysis",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    }
  ];

  const rndSummary: RndProjectSummary = {
    projectId: "rnd-1",
    expenseAmount: "12000",
    capitalizedAmount: "3000",
    totalHours: "80",
    superDeductionEligibleBase: "12000"
  };

  const result = buildCorporateIncomeTaxPreparation({
    companyId: "cmp-1",
    filingPeriod: "2026-Q2",
    profitStatement,
    taxItems,
    rndSummaries: [rndSummary]
  });

  assert.equal(result.accountingProfit, "50000");
  assert.equal(result.taxableIncomeEstimate, "50000");
  assert.equal(result.incomeTaxRate, "25");
  assert.equal(result.prepaymentTaxEstimate, "12500");
  assert.equal(result.adjustmentHints.some((item) => item.includes("业务招待费")), true);
  assert.equal(result.adjustmentHints.some((item) => item.includes("研发加计扣除")), true);
});
