import test from "node:test";
import assert from "node:assert/strict";
import { deriveTravelExceptionSummary } from "./travel-exception-summary.ts";

test("deriveTravelExceptionSummary returns null for ordinary descriptions", () => {
  assert.equal(deriveTravelExceptionSummary("expense", "普通事项描述"), null);
});

test("deriveTravelExceptionSummary explains missing hotel invoice travel expense", () => {
  const summary = deriveTravelExceptionSummary(
    "travel_expense",
    JSON.stringify({
      expected: {
        exceptions: ["missing_hotel_invoice"],
        risks: ["unsupported_travel_cost"]
      }
    })
  );

  assert.equal(summary?.tone, "warning");
  assert.equal(summary?.title, "当前差旅事项处于缺住宿票待补状态");
});

test("deriveTravelExceptionSummary explains cross-period travel expense", () => {
  const summary = deriveTravelExceptionSummary(
    "travel_expense",
    JSON.stringify({
      expected: {
        exceptions: ["accounting_period_conflict"],
        risks: ["cutoff_misstatement"]
      }
    })
  );

  assert.equal(summary?.tone, "warning");
  assert.equal(summary?.title, "当前差旅事项已切到跨期归属处理");
});
