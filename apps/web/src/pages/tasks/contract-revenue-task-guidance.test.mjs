import test from "node:test";
import assert from "node:assert/strict";
import { deriveContractRevenueTaskGuidance } from "./contract-revenue-task-guidance.ts";

test("deriveContractRevenueTaskGuidance detects missing acceptance workflow", () => {
  const guidance = deriveContractRevenueTaskGuidance([{ title: "补齐验收单与履约证据" }]);
  assert.equal(guidance?.tone, "warning");
});

test("deriveContractRevenueTaskGuidance detects duplicate revenue workflow", () => {
  const guidance = deriveContractRevenueTaskGuidance([{ title: "核对重复合同与收入主链" }]);
  assert.equal(guidance?.tone, "error");
});

test("deriveContractRevenueTaskGuidance detects deferred revenue workflow", () => {
  const guidance = deriveContractRevenueTaskGuidance([{ title: "拆分服务期间收入归属" }]);
  assert.equal(guidance?.title, "当前任务集已切换到分期收入确认");
});
