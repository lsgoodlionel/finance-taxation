import test from "node:test";
import assert from "node:assert/strict";
import { createSessionId } from "./auth.js";

test("createSessionId stays unique within the same millisecond", () => {
  const originalNow = Date.now;
  Date.now = () => 1782277552366;
  try {
    const ids = new Set([createSessionId(), createSessionId(), createSessionId()]);
    assert.equal(ids.size, 3);
  } finally {
    Date.now = originalNow;
  }
});
