import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeTestDatabase } from "./reset-test-db.js";

test("accepts the isolated V4 acceptance database", () => {
  assert.doesNotThrow(() =>
    assertSafeTestDatabase(
      "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test"
    )
  );
});

test("rejects a non-test database", () => {
  assert.throws(
    () =>
      assertSafeTestDatabase(
        "postgres://finance_taxation:finance_taxation@127.0.0.1:5433/finance_taxation_v2"
      ),
    /non-test database/i
  );
});

test("rejects malformed database URLs", () => {
  assert.throws(() => assertSafeTestDatabase("not-a-database-url"), /valid database URL/i);
});
