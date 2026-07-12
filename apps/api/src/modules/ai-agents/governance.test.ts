import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAutomation } from "./governance.js";

test("high-confidence non-financial output is auto-applied", () => {
  const d = decideAutomation({ ruleConfidence: 0.95, isFinancialMutation: false });
  assert.equal(d.level, "auto");
});

test("high-confidence financial mutation is never auto (surfaced as suggest)", () => {
  const d = decideAutomation({ ruleConfidence: 0.99, isFinancialMutation: true, amountCents: 5000 });
  assert.equal(d.level, "suggest");
});

test("financial mutation above the cap forces manual regardless of confidence", () => {
  const d = decideAutomation({ ruleConfidence: 1, isFinancialMutation: true, amountCents: 2_000_000 });
  assert.equal(d.level, "manual");
});

test("medium confidence yields a suggestion", () => {
  const d = decideAutomation({ ruleConfidence: 0.7, isFinancialMutation: false });
  assert.equal(d.level, "suggest");
});

test("low confidence requires manual handling", () => {
  const d = decideAutomation({ ruleConfidence: 0.3, isFinancialMutation: false });
  assert.equal(d.level, "manual");
});

test("custom thresholds are honoured", () => {
  const d = decideAutomation({
    ruleConfidence: 0.8,
    isFinancialMutation: false,
    thresholds: { autoMin: 0.75 }
  });
  assert.equal(d.level, "auto");
});

test("NaN confidence is treated as zero", () => {
  const d = decideAutomation({ ruleConfidence: Number.NaN, isFinancialMutation: false });
  assert.equal(d.level, "manual");
});
