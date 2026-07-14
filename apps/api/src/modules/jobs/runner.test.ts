import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveJobOutcome } from "./runner.js";

const NOW = 1_000_000;
const opts = { baseMs: 1000, maxMs: 60000, factor: 2 };

test("success on a one-shot job completes it", () => {
  const out = resolveJobOutcome({ attempts: 0, max_attempts: 5, recurring_interval_ms: null }, true, NOW, undefined, opts);
  assert.equal(out.status, "completed");
  assert.equal(out.runAt, null);
  assert.equal(out.lastError, null);
});

test("success on a recurring job reschedules and resets attempts", () => {
  const out = resolveJobOutcome({ attempts: 3, max_attempts: 5, recurring_interval_ms: "5000" }, true, NOW, undefined, opts);
  assert.equal(out.status, "pending");
  assert.equal(out.attempts, 0);
  assert.equal(out.runAt, new Date(NOW + 5000).toISOString());
});

test("failure below max retries reschedules with backoff and increments attempts", () => {
  const out = resolveJobOutcome({ attempts: 1, max_attempts: 5, recurring_interval_ms: null }, false, NOW, "boom", opts);
  assert.equal(out.status, "pending");
  assert.equal(out.attempts, 2);
  assert.equal(out.lastError, "boom");
  // attempt 2 backoff = base * factor^(2-1) = 2000
  assert.equal(out.runAt, new Date(NOW + 2000).toISOString());
});

test("failure at max retries goes to dead letter", () => {
  const out = resolveJobOutcome({ attempts: 5, max_attempts: 5, recurring_interval_ms: null }, false, NOW, "boom", opts);
  assert.equal(out.status, "dead");
  assert.equal(out.runAt, null);
  assert.equal(out.attempts, 6);
});
