import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChain, verifyChain, hashRecord, GENESIS_HASH } from "./hash-chain.js";

test("builds a chain linking each record to the previous hash", () => {
  const chain = buildChain([{ a: 1 }, { a: 2 }, { a: 3 }]);
  assert.equal(chain.length, 3);
  assert.equal(chain[0]!.prevHash, GENESIS_HASH);
  assert.equal(chain[1]!.prevHash, chain[0]!.hash);
  assert.equal(chain[2]!.prevHash, chain[1]!.hash);
});

test("verifies an untampered chain", () => {
  const chain = buildChain([{ event: "post" }, { event: "close" }]);
  assert.deepEqual(verifyChain(chain), { valid: true });
});

test("detects a tampered payload", () => {
  const chain = buildChain([{ amount: 100 }, { amount: 200 }, { amount: 300 }]);
  // Mutate a middle record's payload without recomputing hashes.
  chain[1] = { ...chain[1]!, payload: { amount: 999 } };
  const result = verifyChain(chain);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAt, 1);
});

test("detects a deleted record (broken linkage)", () => {
  const chain = buildChain([{ n: 1 }, { n: 2 }, { n: 3 }]);
  const truncated = [chain[0]!, chain[2]!]; // drop seq 1
  const result = verifyChain(truncated);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAt, 2);
});

test("hashRecord is deterministic regardless of key order", () => {
  assert.equal(hashRecord(GENESIS_HASH, { a: 1, b: 2 }), hashRecord(GENESIS_HASH, { b: 2, a: 1 }));
});

test("different previous hashes yield different record hashes", () => {
  assert.notEqual(hashRecord("a".repeat(64), { x: 1 }), hashRecord("b".repeat(64), { x: 1 }));
});
