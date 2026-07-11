import test from "node:test";
import assert from "node:assert/strict";
import { deriveTravelTaskGuidance } from "./travel-task-guidance.ts";

test("deriveTravelTaskGuidance detects missing hotel workflow", () => {
  const guidance = deriveTravelTaskGuidance([{ title: "补齐住宿发票与行程依据" }]);
  assert.equal(guidance?.tone, "warning");
});

test("deriveTravelTaskGuidance detects duplicate travel reimbursement workflow", () => {
  const guidance = deriveTravelTaskGuidance([{ title: "核对重复差旅报销记录" }]);
  assert.equal(guidance?.tone, "error");
});

test("deriveTravelTaskGuidance detects cross-period travel workflow", () => {
  const guidance = deriveTravelTaskGuidance([{ title: "拆分跨期差旅归属月份" }]);
  assert.equal(guidance?.title, "当前任务集已切换到跨期差旅处理");
});
