import type { Contract } from "@finance-taxation/domain-model";
import { buildContractWorkflow } from "./contract-workflow";

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectTrue(value: boolean, message: string) {
  if (!value) {
    throw new Error(message);
  }
}

const contract: Contract = {
  id: "contract-1",
  companyId: "cmp-1",
  contractNo: "CNT-001",
  contractType: "sales",
  title: "企业软件订阅合同",
  counterpartyName: "甲公司",
  counterpartyType: "external",
  amount: 100000,
  currency: "CNY",
  signedDate: "2026-05-01",
  startDate: "2026-05-10",
  endDate: "2027-05-09",
  status: "active",
  notes: "",
  createdByUserId: "u1",
  createdByName: "admin",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

const workflow = buildContractWorkflow({
  contract,
  relatedEvents: [
    { id: "evt-1", title: "企业软件订阅合同 合同执行事项", status: "analyzed", createdAt: "2026-05-01T00:00:00.000Z" },
    { id: "evt-2", title: "企业软件订阅合同 开票申请事项", status: "analyzed", createdAt: "2026-05-12T00:00:00.000Z" }
  ]
});

expectEqual(workflow.steps.length, 4, "sales workflow should have four milestones before terminal state");
expectEqual(workflow.steps[0]?.title, "合同执行事项", "workflow should start with execution event");
expectEqual(workflow.steps[0]?.state, "done", "existing contract execution event should mark done");
expectEqual(workflow.steps[1]?.title, "开票申请事项", "workflow should include invoice step");
expectEqual(workflow.steps[1]?.state, "done", "existing invoice event should mark done");
expectEqual(workflow.steps[2]?.title, "回款跟踪事项", "workflow should include collection step");
expectEqual(workflow.steps[2]?.state, "pending", "missing collection step should be pending");
expectEqual(workflow.recommendedActions.join(","), "collection,revenue", "missing actions should be recommended in order");
expectTrue(workflow.summary.includes("待补"), "summary should mention missing steps");

console.log("contract-workflow-ok");
