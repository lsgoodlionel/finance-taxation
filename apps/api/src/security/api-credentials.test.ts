import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  signWebhook,
  verifyWebhookSignature
} from "./api-credentials.js";

test("generated API key is prefixed and verifies against its hash", () => {
  const { key, hash } = generateApiKey();
  assert.ok(key.startsWith("ftk_"));
  assert.equal(verifyApiKey(key, hash), true);
});

test("API keys are random per generation", () => {
  assert.notEqual(generateApiKey().key, generateApiKey().key);
});

test("verifyApiKey rejects a wrong key", () => {
  const { hash } = generateApiKey();
  assert.equal(verifyApiKey("ftk_wrong", hash), false);
});

test("hashApiKey never returns the raw key", () => {
  const key = "ftk_secret";
  assert.notEqual(hashApiKey(key), key);
});

test("webhook signature round-trips", () => {
  const body = JSON.stringify({ event: "voucher.posted", id: "v1" });
  const sig = signWebhook("whsec_abc", body);
  assert.equal(verifyWebhookSignature("whsec_abc", body, sig), true);
});

test("webhook signature fails on tampered body or wrong secret", () => {
  const body = JSON.stringify({ amount: 100 });
  const sig = signWebhook("whsec_abc", body);
  assert.equal(verifyWebhookSignature("whsec_abc", JSON.stringify({ amount: 999 }), sig), false);
  assert.equal(verifyWebhookSignature("whsec_other", body, sig), false);
  assert.equal(verifyWebhookSignature("whsec_abc", body, ""), false);
});
