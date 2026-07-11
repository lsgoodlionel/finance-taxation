import { test } from "node:test";
import assert from "node:assert/strict";
import { validateObject } from "./validate.js";

const loginSchema = {
  username: { type: "string", required: true, min: 1, max: 64 },
  password: { type: "string", required: true, min: 1, max: 200 }
} as const;

test("accepts a valid object and returns only whitelisted fields", () => {
  const result = validateObject({ username: "amy", password: "pw", extra: "x" }, loginSchema);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { username: "amy", password: "pw" });
});

test("rejects a missing required field", () => {
  const result = validateObject({ username: "amy" }, loginSchema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("password")));
});

test("rejects a wrong type", () => {
  const result = validateObject({ username: 42, password: "pw" }, loginSchema);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("username")));
});

test("enforces string length bounds", () => {
  const schema = { name: { type: "string", required: true, min: 2, max: 4 } } as const;
  assert.equal(validateObject({ name: "a" }, schema).ok, false);
  assert.equal(validateObject({ name: "abcde" }, schema).ok, false);
  assert.equal(validateObject({ name: "abc" }, schema).ok, true);
});

test("enforces a string pattern", () => {
  const schema = { code: { type: "string", required: true, pattern: /^[A-Z]{3}$/ } } as const;
  assert.equal(validateObject({ code: "abc" }, schema).ok, false);
  assert.equal(validateObject({ code: "ABC" }, schema).ok, true);
});

test("enforces number int and range", () => {
  const schema = { age: { type: "number", required: true, int: true, min: 0, max: 150 } } as const;
  assert.equal(validateObject({ age: 1.5 }, schema).ok, false);
  assert.equal(validateObject({ age: -1 }, schema).ok, false);
  assert.equal(validateObject({ age: 200 }, schema).ok, false);
  assert.equal(validateObject({ age: 30 }, schema).ok, true);
});

test("enforces an enum", () => {
  const schema = { kind: { type: "string", required: true, enum: ["a", "b"] } } as const;
  assert.equal(validateObject({ kind: "c" }, schema).ok, false);
  assert.equal(validateObject({ kind: "b" }, schema).ok, true);
});

test("allows optional fields to be absent", () => {
  const schema = {
    name: { type: "string", required: true },
    note: { type: "string", required: false }
  } as const;
  const result = validateObject({ name: "x" }, schema);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: "x" });
});

test("rejects a non-object payload", () => {
  assert.equal(validateObject(null, loginSchema).ok, false);
  assert.equal(validateObject("nope", loginSchema).ok, false);
  assert.equal(validateObject(undefined, loginSchema).ok, false);
});
