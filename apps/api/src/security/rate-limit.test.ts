import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, clientKey } from "./rate-limit.js";

test("allows requests up to the max within a window", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("a", 100).allowed, true);
  assert.equal(limiter.check("a", 200).allowed, true);
});

test("blocks the request that exceeds the max within a window", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
  limiter.check("a", 0);
  limiter.check("a", 10);
  const blocked = limiter.check("a", 20);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});

test("resets the counter after the window elapses", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("a", 500).allowed, false);
  assert.equal(limiter.check("a", 1000).allowed, true);
});

test("tracks separate keys independently", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("b", 0).allowed, true);
  assert.equal(limiter.check("a", 0).allowed, false);
});

test("reports remaining budget", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  assert.equal(limiter.check("a", 0).remaining, 2);
  assert.equal(limiter.check("a", 0).remaining, 1);
  assert.equal(limiter.check("a", 0).remaining, 0);
  assert.equal(limiter.check("a", 0).remaining, 0);
});

test("clientKey prefers the first X-Forwarded-For hop over the socket address", () => {
  const key = clientKey(
    { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    "10.0.0.1"
  );
  assert.equal(key, "203.0.113.7");
});

test("clientKey falls back to the socket address when no forwarded header", () => {
  assert.equal(clientKey({}, "198.51.100.9"), "198.51.100.9");
  assert.equal(clientKey({}, undefined), "unknown");
});
