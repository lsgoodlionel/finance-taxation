import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  isHashedPassword
} from "./password.js";

test("hashPassword produces a scrypt-prefixed PHC-like string", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.ok(hash.startsWith("scrypt$"), `expected scrypt$ prefix, got ${hash}`);
  assert.ok(hash.split("$").length >= 5, "expected params/salt/key segments");
});

test("hashPassword uses a random salt so two hashes of same input differ", async () => {
  const a = await hashPassword("123456");
  const b = await hashPassword("123456");
  assert.notEqual(a, b, "salt must randomize the digest");
});

test("verifyPassword accepts the correct password against its own hash", async () => {
  const hash = await hashPassword("s3cr3t-pass");
  assert.equal(await verifyPassword("s3cr3t-pass", hash), true);
});

test("verifyPassword rejects a wrong password against a hash", async () => {
  const hash = await hashPassword("s3cr3t-pass");
  assert.equal(await verifyPassword("wrong-pass", hash), false);
});

test("verifyPassword supports legacy plaintext rows for lazy upgrade", async () => {
  // Historical seed rows stored the raw password in password_hash.
  assert.equal(await verifyPassword("123456", "123456"), true);
  assert.equal(await verifyPassword("wrong", "123456"), false);
});

test("verifyPassword returns false (no throw) for malformed stored values", async () => {
  assert.equal(await verifyPassword("x", "scrypt$broken"), false);
  assert.equal(await verifyPassword("x", "scrypt$16384$8$1$notbase64$"), false);
  assert.equal(await verifyPassword("x", ""), false);
});

test("isHashedPassword distinguishes hashed from legacy plaintext", async () => {
  assert.equal(isHashedPassword(await hashPassword("abc")), true);
  assert.equal(isHashedPassword("123456"), false);
  assert.equal(isHashedPassword(""), false);
});

test("needsRehash flags legacy plaintext but not a fresh scrypt hash", async () => {
  assert.equal(needsRehash("123456"), true, "legacy plaintext must be upgraded");
  assert.equal(needsRehash(await hashPassword("abc")), false, "fresh hash is current");
});
