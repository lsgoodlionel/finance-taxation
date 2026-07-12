import { test } from "node:test";
import assert from "node:assert/strict";
import { comparePeriods, budgetVariance } from "./period-comparison.js";

test("computes delta and change rate for growth", () => {
  const c = comparePeriods(1200, 1000);
  assert.equal(c.delta, 200);
  assert.equal(c.changeRate, 0.2);
});

test("negative previous uses absolute base for the rate", () => {
  const c = comparePeriods(-50, -100);
  assert.equal(c.delta, 50);
  assert.equal(c.changeRate, 0.5);
});

test("zero previous with non-zero current yields null rate", () => {
  const c = comparePeriods(500, 0);
  assert.equal(c.delta, 500);
  assert.equal(c.changeRate, null);
});

test("zero to zero is a zero-rate no-change", () => {
  const c = comparePeriods(0, 0);
  assert.equal(c.changeRate, 0);
});

test("budgetVariance flags overspend", () => {
  const v = budgetVariance(1200, 1000);
  assert.equal(v.variance, 200);
  assert.equal(v.utilization, 1.2);
  assert.equal(v.status, "over");
});

test("budgetVariance flags underspend and on-track", () => {
  assert.equal(budgetVariance(800, 1000).status, "under");
  assert.equal(budgetVariance(1000, 1000).status, "on_track");
});

test("budgetVariance guards a zero budget", () => {
  const v = budgetVariance(500, 0);
  assert.equal(v.utilization, null);
  assert.equal(v.status, "over");
});
