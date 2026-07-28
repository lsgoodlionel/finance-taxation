import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAnalyzeGuard } from "./analyze-guard.js";

test("没有已过账凭证、没有锁定期间时放行重新分析", () => {
  const verdict = evaluateAnalyzeGuard({ postedVoucherIds: [], lockedPeriods: [] });

  assert.equal(verdict.allowed, true);
});

test("存在已过账凭证时拒绝，并提示改走红冲而非物理删除", () => {
  const verdict = evaluateAnalyzeGuard({
    postedVoucherIds: ["vch-2026-05-001", "vch-2026-05-002"],
    lockedPeriods: []
  });

  assert.equal(verdict.allowed, false);
  if (verdict.allowed) return;
  assert.equal(verdict.code, "EVENT_HAS_POSTED_VOUCHERS");
  assert.deepEqual(verdict.postedVoucherIds, ["vch-2026-05-001", "vch-2026-05-002"]);
  assert.match(verdict.message, /红冲/);
});

test("凭证所属期间已锁账时拒绝", () => {
  const verdict = evaluateAnalyzeGuard({ postedVoucherIds: [], lockedPeriods: ["2026-04"] });

  assert.equal(verdict.allowed, false);
  if (verdict.allowed) return;
  assert.equal(verdict.code, "EVENT_PERIOD_LOCKED");
  assert.deepEqual(verdict.lockedPeriods, ["2026-04"]);
});

test("两个条件同时命中时先报已过账凭证（更根本的会计档案约束）", () => {
  const verdict = evaluateAnalyzeGuard({
    postedVoucherIds: ["vch-1"],
    lockedPeriods: ["2026-04"]
  });

  assert.equal(verdict.allowed, false);
  if (verdict.allowed) return;
  assert.equal(verdict.code, "EVENT_HAS_POSTED_VOUCHERS");
});

test("裁决结果不引用调用方传入的数组实例（避免外部改动影响已产出的裁决）", () => {
  const postedVoucherIds = ["vch-1"];
  const verdict = evaluateAnalyzeGuard({ postedVoucherIds, lockedPeriods: [] });

  assert.equal(verdict.allowed, false);
  if (verdict.allowed) return;
  assert.notEqual(verdict.postedVoucherIds, postedVoucherIds);
  assert.deepEqual(verdict.postedVoucherIds, ["vch-1"]);
});
