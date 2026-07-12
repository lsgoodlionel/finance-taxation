import { test } from "node:test";
import assert from "node:assert/strict";
import { linearFit, forecastCashFlow } from "./cash-forecast.js";

test("fits a perfect upward trend", () => {
  const fit = linearFit([100, 200, 300, 400]);
  assert.equal(fit.slope, 100);
  assert.equal(fit.intercept, 100);
});

test("extrapolates future periods along the trend", () => {
  const { predictions } = forecastCashFlow([100, 200, 300], 2);
  assert.deepEqual(
    predictions.map((p) => p.value),
    [400, 500]
  );
  assert.deepEqual(predictions.map((p) => p.index), [3, 4]);
});

test("handles a flat history", () => {
  const { fit, predictions } = forecastCashFlow([500, 500, 500], 1);
  assert.equal(fit.slope, 0);
  assert.equal(predictions[0]!.value, 500);
});

test("single data point predicts a flat line at that value", () => {
  const { predictions } = forecastCashFlow([250], 2);
  assert.deepEqual(predictions.map((p) => p.value), [250, 250]);
});

test("empty history yields zeros", () => {
  const { fit, predictions } = forecastCashFlow([], 3);
  assert.equal(fit.slope, 0);
  assert.equal(predictions.every((p) => p.value === 0), true);
});

test("rounds fractional predictions to whole units", () => {
  const { predictions } = forecastCashFlow([100, 150, 220], 1);
  assert.equal(Number.isInteger(predictions[0]!.value), true);
});
