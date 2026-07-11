import test from "node:test";
import assert from "node:assert/strict";
import { derivePurchaseTaskGuidance } from "./purchase-task-guidance.ts";

function task(title) {
  return {
    id: title,
    companyId: "cmp-1",
    businessEventId: "evt-1",
    parentTaskId: null,
    title,
    description: "",
    status: "not_started",
    priority: "high",
    ownerId: null,
    dueAt: null,
    assigneeDepartment: "财务部",
    source: "ai"
  };
}

test("derivePurchaseTaskGuidance detects missing invoice workflow", () => {
  const guidance = derivePurchaseTaskGuidance([
    task("补齐发票与票据依据"),
    task("复核税前扣除与进项限制")
  ]);
  assert.equal(guidance?.tone, "warning");
  assert.match(guidance?.title ?? "", /缺票/);
});

test("derivePurchaseTaskGuidance detects duplicate reimbursement workflow", () => {
  const guidance = derivePurchaseTaskGuidance([
    task("核对重复票据与历史报销"),
    task("关闭重复事项或并单处理")
  ]);
  assert.equal(guidance?.tone, "error");
  assert.match(guidance?.title ?? "", /重复报销/);
});

test("derivePurchaseTaskGuidance detects asset reclassification workflow", () => {
  const guidance = derivePurchaseTaskGuidance([
    task("改走固定资产审批链"),
    task("补齐资产验收与台账资料")
  ]);
  assert.equal(guidance?.tone, "warning");
  assert.match(guidance?.title ?? "", /固定资产/);
});
