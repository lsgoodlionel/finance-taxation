import type { Contract } from "@finance-taxation/domain-model";
import {
  buildContractAutoDerivationPlan,
  resolveContractProgressState
} from "./contract-automation";

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

expectEqual(resolveContractProgressState("draft"), "pending", "draft should be pending");
expectEqual(resolveContractProgressState("awaiting_documents"), "in_progress", "awaiting documents should be in progress");
expectEqual(resolveContractProgressState("awaiting_approval"), "in_progress", "awaiting approval should be in progress");
expectEqual(resolveContractProgressState("blocked"), "blocked", "blocked should remain blocked");
expectEqual(resolveContractProgressState("analyzed"), "done", "analyzed should be done");
expectEqual(resolveContractProgressState("archived"), "done", "archived should be done");

const planWithBaseOnly = buildContractAutoDerivationPlan({
  contract,
  relatedEvents: [
    {
      id: "evt-1",
      title: "企业软件订阅合同 合同执行事项",
      status: "analyzed",
      createdAt: "2026-05-01T00:00:00.000Z"
    }
  ]
});

expectEqual(planWithBaseOnly.baseEventId, "evt-1", "base event should be detected");
expectEqual(planWithBaseOnly.missingActions.join(","), "invoice,collection,revenue", "sales contract should derive full remaining chain");
expectEqual(planWithBaseOnly.autoCreateActions.join(","), "invoice", "auto creation should only unlock the next missing action in sequence");
expectTrue(planWithBaseOnly.summary.includes("自动补齐"), "summary should describe auto derivation");

const planWithPartialFlow = buildContractAutoDerivationPlan({
  contract,
  relatedEvents: [
    {
      id: "evt-1",
      title: "企业软件订阅合同 合同执行事项",
      status: "analyzed",
      createdAt: "2026-05-01T00:00:00.000Z"
    },
    {
      id: "evt-2",
      title: "企业软件订阅合同 开票申请事项",
      status: "blocked",
      createdAt: "2026-05-02T00:00:00.000Z"
    },
    {
      id: "evt-3",
      title: "企业软件订阅合同 回款跟踪事项",
      status: "awaiting_documents",
      createdAt: "2026-05-03T00:00:00.000Z"
    }
  ]
});

expectEqual(planWithPartialFlow.missingActions.join(","), "revenue", "existing blocked or in-progress steps should not be re-created");
expectEqual(planWithPartialFlow.autoCreateActions.join(","), "", "blocked upstream steps should prevent downstream auto creation");

const inactivePlan = buildContractAutoDerivationPlan({
  contract: { ...contract, status: "fulfilled" },
  relatedEvents: [
    {
      id: "evt-1",
      title: "企业软件订阅合同 合同执行事项",
      status: "analyzed",
      createdAt: "2026-05-01T00:00:00.000Z"
    }
  ]
});

expectEqual(inactivePlan.autoCreateActions.length, 0, "fulfilled contracts should not auto-create new followup actions");
expectTrue(inactivePlan.summary.includes("终态"), "inactive summary should explain terminal state");

console.log("contract-automation-ok");
