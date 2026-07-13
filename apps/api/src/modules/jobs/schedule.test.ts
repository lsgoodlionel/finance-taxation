import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBackoffMs, planRetry, selectDue } from "./schedule.js";

const opts = { baseMs: 1000, maxMs: 60000 };

test("computeBackoffMs grows exponentially and caps at maxMs", () => {
  assert.equal(computeBackoffMs(1, opts), 1000);
  assert.equal(computeBackoffMs(2, opts), 2000);
  assert.equal(computeBackoffMs(3, opts), 4000);
  assert.equal(computeBackoffMs(100, opts), 60000); // capped
});

test("planRetry schedules the next run with backoff while attempts remain", () => {
  const plan = planRetry({ attempts: 1, maxAttempts: 3 }, 10_000, opts);
  assert.equal(plan.shouldRetry, true);
  // attempt 2 backoff = 2000ms → nextRunAt = 12s
  assert.equal(plan.nextRunAt, new Date(12_000).toISOString());
});

test("planRetry gives up after maxAttempts (dead letter)", () => {
  const plan = planRetry({ attempts: 3, maxAttempts: 3 }, 0, opts);
  assert.equal(plan.shouldRetry, false);
  assert.equal(plan.nextRunAt, null);
});

test("selectDue returns only pending jobs whose runAt has passed", () => {
  const now = 1000;
  const due = selectDue(
    [
      { id: "a", status: "pending", runAt: new Date(500).toISOString() },
      { id: "b", status: "pending", runAt: new Date(2000).toISOString() },
      { id: "c", status: "running", runAt: new Date(0).toISOString() },
      { id: "d", status: "pending", runAt: new Date(1000).toISOString() }
    ],
    now
  );
  assert.deepEqual(due.map((j) => j.id), ["a", "d"]);
});
