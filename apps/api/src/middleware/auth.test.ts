import test from "node:test";
import assert from "node:assert/strict";
import { createSessionId, hasPermission } from "./auth.js";

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

test("role-tax-specialist can trigger event risk-check through tax.manage but not risk.manage", () => {
  assert.equal(hasPermission(["role-tax-specialist"], "tax.manage"), true);
  assert.equal(hasPermission(["role-tax-specialist"], "risk.manage"), false);
});

test("role-finance-director can still trigger event risk-check through risk.manage", () => {
  assert.equal(hasPermission(["role-finance-director"], "risk.manage"), true);
});
