import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSensitive, REDACTED } from "./redact.js";

test("redacts a top-level password field", () => {
  const out = redactSensitive({ username: "amy", password: "hunter2" }) as Record<string, unknown>;
  assert.equal(out.username, "amy");
  assert.equal(out.password, REDACTED);
});

test("redacts nested credential fields", () => {
  const out = redactSensitive({
    provider: "nuonuo",
    config: { apiKey: "sk-123", endpoint: "https://x" }
  }) as Record<string, unknown>;
  const config = out.config as Record<string, unknown>;
  assert.equal(config.apiKey, REDACTED);
  assert.equal(config.endpoint, "https://x");
});

test("redacts sensitive fields inside arrays", () => {
  const out = redactSensitive({ items: [{ token: "abc" }, { name: "ok" }] }) as Record<string, unknown>;
  const items = out.items as Array<Record<string, unknown>>;
  assert.equal(items[0]!.token, REDACTED);
  assert.equal(items[1]!.name, "ok");
});

test("matches common sensitive key spellings", () => {
  const out = redactSensitive({
    api_key: "a",
    accessToken: "b",
    refresh_token: "c",
    clientSecret: "d",
    authorization: "e",
    privateKey: "f"
  }) as Record<string, unknown>;
  for (const value of Object.values(out)) {
    assert.equal(value, REDACTED);
  }
});

test("leaves non-sensitive data intact", () => {
  const input = { amount: 100, memo: "rent", tags: ["a", "b"] };
  assert.deepEqual(redactSensitive(input), input);
});

test("returns primitives and null unchanged without throwing", () => {
  assert.equal(redactSensitive(null), null);
  assert.equal(redactSensitive(42), 42);
  assert.equal(redactSensitive("plain"), "plain");
});

test("handles circular references without infinite recursion", () => {
  const obj: Record<string, unknown> = { name: "x" };
  obj.self = obj;
  const out = redactSensitive(obj) as Record<string, unknown>;
  assert.equal(out.name, "x");
});
