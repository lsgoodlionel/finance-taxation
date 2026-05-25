import type { Contract } from "@finance-taxation/domain-model";
import type { ContractFollowupAction } from "./contract-event";

interface RelatedContractEvent {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface WorkflowStep {
  title: string;
  state: "done" | "pending";
  action: ContractFollowupAction | "base";
  relatedEventId: string | null;
}

function requiredSteps(contract: Contract): Array<{ title: string; action: ContractFollowupAction | "base" }> {
  switch (contract.contractType) {
    case "sales":
    case "service":
      return [
        { title: "合同执行事项", action: "base" },
        { title: "开票申请事项", action: "invoice" },
        { title: "回款跟踪事项", action: "collection" },
        { title: "收入确认事项", action: "revenue" }
      ];
    case "procurement":
      return [
        { title: "合同执行事项", action: "base" },
        { title: "采购执行事项", action: "procurement_execution" },
        { title: "付款安排事项", action: "payment_arrangement" },
        { title: "验收归档事项", action: "acceptance" }
      ];
    case "lease":
      return [
        { title: "合同执行事项", action: "base" },
        { title: "租赁付款事项", action: "lease_payment" },
        { title: "租赁费用确认事项", action: "lease_accrual" }
      ];
    default:
      return [
        { title: "合同执行事项", action: "base" },
        { title: "回款跟踪事项", action: "collection" }
      ];
  }
}

function matchEvent(stepTitle: string, relatedEvents: RelatedContractEvent[]) {
  return relatedEvents.find((event) => event.title.endsWith(stepTitle)) ?? null;
}

export function buildContractWorkflow({
  contract,
  relatedEvents
}: {
  contract: Contract;
  relatedEvents: RelatedContractEvent[];
}) {
  const steps: WorkflowStep[] = requiredSteps(contract).map((step) => {
    const event = matchEvent(step.title, relatedEvents);
    return {
      title: step.title,
      action: step.action,
      state: event ? "done" : "pending",
      relatedEventId: event?.id ?? null
    };
  });

  const recommendedActions = steps
    .filter((step) => step.state === "pending" && step.action !== "base")
    .map((step) => step.action as ContractFollowupAction);

  return {
    steps,
    recommendedActions,
    summary:
      recommendedActions.length > 0
        ? `待补 ${recommendedActions.length} 个履约步骤，请优先补齐 ${steps.find((step) => step.state === "pending")?.title ?? "后续动作"}。`
        : "当前合同履约主线已补齐，下一步可继续跟踪归档或终态处理。"
  };
}
