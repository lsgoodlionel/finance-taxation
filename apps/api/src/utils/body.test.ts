import test from "node:test";
import assert from "node:assert/strict";
import { shouldReadJsonBody } from "./body.js";

test("shouldReadJsonBody skips CSV bank statement imports", () => {
  assert.equal(
    shouldReadJsonBody("POST", "text/plain; charset=utf-8", "/api/banking/statements/import"),
    false
  );
});

test("shouldReadJsonBody keeps ordinary json posts enabled", () => {
  assert.equal(
    shouldReadJsonBody("POST", "application/json", "/api/contracts"),
    true
  );
});
