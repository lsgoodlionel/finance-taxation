import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableDbStartupError, retryDbStartup } from "./startup.js";

test("isRetryableDbStartupError matches transient database boot errors", () => {
  assert.equal(
    isRetryableDbStartupError(new Error("Connection terminated due to connection timeout")),
    true
  );
  assert.equal(isRetryableDbStartupError(new Error("syntax error at or near select")), false);
});

test("retryDbStartup retries transient startup errors and returns success", async () => {
  let attempts = 0;
  const delays: number[] = [];

  const result = await retryDbStartup(
    async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Connection terminated due to connection timeout");
      }
      return "ready";
    },
    {
      maxAttempts: 5,
      delayMs: 15,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      }
    }
  );

  assert.equal(result, "ready");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [15, 15]);
});

test("retryDbStartup stops immediately on non-retryable errors", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      retryDbStartup(
        async () => {
          attempts++;
          throw new Error("column does_not_exist does not exist");
        },
        {
          maxAttempts: 5,
          sleep: async () => undefined
        }
      ),
    /does not exist/
  );

  assert.equal(attempts, 1);
});

test("retryDbStartup throws after exhausting retry budget", async () => {
  let attempts = 0;
  let beforeRetryCalls = 0;

  await assert.rejects(
    () =>
      retryDbStartup(
        async () => {
          attempts++;
          throw new Error("Connection terminated due to connection timeout");
        },
        {
          maxAttempts: 3,
          sleep: async () => undefined,
          beforeRetry: async () => {
            beforeRetryCalls++;
          }
        }
      ),
    /Connection terminated due to connection timeout/
  );

  assert.equal(attempts, 3);
  assert.equal(beforeRetryCalls, 2);
});
