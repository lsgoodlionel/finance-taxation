import test from "node:test";
import assert from "node:assert/strict";
import { deriveContractRevenueSummary } from "./contract-revenue-summary.ts";

test("deriveContractRevenueSummary returns null for ordinary descriptions", () => {
  assert.equal(deriveContractRevenueSummary("sales", "普通事项描述"), null);
});

test("deriveContractRevenueSummary explains missing acceptance record", () => {
  const summary = deriveContractRevenueSummary(
    "contract_revenue",
    JSON.stringify({
      expected: {
        exceptions: ["missing_acceptance_record"],
        risks: ["premature_revenue_recognition"]
      }
    })
  );

  assert.equal(summary?.tone, "warning");
  assert.equal(summary?.title, "当前合同收入事项处于缺验收待补状态");
});

test("deriveContractRevenueSummary explains revenue timing conflict", () => {
  const summary = deriveContractRevenueSummary(
    "contract_revenue",
    JSON.stringify({
      expected: {
        exceptions: ["revenue_timing_conflict"],
        risks: ["tax_accounting_timing_difference"]
      }
    })
  );

  assert.equal(summary?.title, "当前合同收入事项已切到分期确认口径");
});
