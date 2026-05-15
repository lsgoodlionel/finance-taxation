import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRndCostLineInput,
  normalizeRndTimeEntryInput
} from "./inputs.js";

test("normalizeRndCostLineInput applies defaults and validates amount", () => {
  const input = normalizeRndCostLineInput({
    costType: "software",
    accountingTreatment: "capitalized",
    amount: "300.00",
    occurredOn: "2026-05-15"
  });

  assert.equal(input.costType, "software");
  assert.equal(input.accountingTreatment, "capitalized");
  assert.equal(input.amount, "300.00");
  assert.equal(input.occurredOn, "2026-05-15");
  assert.equal(input.notes, "");
});

test("normalizeRndCostLineInput rejects non-positive amount", () => {
  assert.throws(
    () =>
      normalizeRndCostLineInput({
        costType: "service",
        accountingTreatment: "expensed",
        amount: "0",
        occurredOn: "2026-05-15"
      }),
    /amount must be greater than 0/
  );
});

test("normalizeRndTimeEntryInput validates hours and defaults notes", () => {
  const input = normalizeRndTimeEntryInput({
    staffName: "张三",
    workDate: "2026-05-15",
    hours: "7.5"
  });

  assert.equal(input.staffName, "张三");
  assert.equal(input.hours, "7.50");
  assert.equal(input.notes, "");
});

test("normalizeRndTimeEntryInput rejects blank staff names", () => {
  assert.throws(
    () =>
      normalizeRndTimeEntryInput({
        staffName: "  ",
        workDate: "2026-05-15",
        hours: "7"
      }),
    /staffName is required/
  );
});
