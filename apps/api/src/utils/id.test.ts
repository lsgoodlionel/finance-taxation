import assert from "node:assert/strict";
import test from "node:test";
import { uniqueId } from "./id.js";

test("uniqueId keeps the legacy sortable prefix-timestamp shape with a random suffix", () => {
  // Arrange & Act
  const id = uniqueId("evt");

  // Assert
  assert.match(id, /^evt-\d{13,}-[0-9a-f]{8}$/);
});

test("uniqueId never collides for many ids generated within the same millisecond", () => {
  // Arrange
  const ROUNDS = 10_000;

  // Act — 紧循环里大量 id 必然落在同一毫秒，复现 E2E 双 project 并行的同毫秒创建
  const ids = Array.from({ length: ROUNDS }, () => uniqueId("evt"));

  // Assert
  assert.equal(new Set(ids).size, ROUNDS);
});
