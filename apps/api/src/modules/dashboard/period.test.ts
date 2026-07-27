import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardPeriod } from "./routes.js";

test("resolveDashboardPeriod defaults to the current calendar month when no period is given", () => {
  const period = resolveDashboardPeriod(null, new Date("2026-07-27T10:00:00.000Z"));

  assert.equal(period.label, "2026-07");
  assert.equal(period.startDate, "2026-07-01");
  assert.equal(period.endDate, "2026-07-31");
});

test("resolveDashboardPeriod honours an explicit ?period=YYYY-MM and its month length", () => {
  const february = resolveDashboardPeriod("2026-02", new Date("2026-07-27T10:00:00.000Z"));
  assert.equal(february.startDate, "2026-02-01");
  assert.equal(february.endDate, "2026-02-28");

  const leapFebruary = resolveDashboardPeriod("2024-02", new Date("2026-07-27T10:00:00.000Z"));
  assert.equal(leapFebruary.endDate, "2024-02-29");

  const december = resolveDashboardPeriod("2025-12", new Date("2026-07-27T10:00:00.000Z"));
  assert.equal(december.endDate, "2025-12-31");
});

test("resolveDashboardPeriod falls back to the current month for malformed input", () => {
  for (const raw of ["", "2026-7", "not-a-period", "2026-07-15"]) {
    const period = resolveDashboardPeriod(raw, new Date("2026-07-27T10:00:00.000Z"));
    assert.equal(period.label, "2026-07", `expected fallback for ${JSON.stringify(raw)}`);
  }
});
