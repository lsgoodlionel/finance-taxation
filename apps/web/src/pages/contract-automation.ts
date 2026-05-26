import type { Contract } from "@finance-taxation/domain-model";
import { getContractFollowupActions, type ContractFollowupAction } from "./contract-event";

interface RelatedContractEvent {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export type ContractProgressState = "pending" | "in_progress" | "blocked" | "done";

function eventTitleFor(contract: Contract, action: ContractFollowupAction | "base") {
  if (action === "base") {
    return `${contract.title} 合同执行事项`;
  }

  const suffix: Record<ContractFollowupAction, string> = {
    invoice: "开票申请事项",
    collection: contract.contractType === "procurement" ? "付款安排事项" : "回款跟踪事项",
    revenue: "收入确认事项",
    procurement_execution: "采购执行事项",
    payment_arrangement: "付款安排事项",
    acceptance: "验收归档事项",
    lease_payment: "租赁付款事项",
    lease_accrual: "租赁费用确认事项"
  };

  return `${contract.title} ${suffix[action]}`;
}

export function resolveContractProgressState(status: string): ContractProgressState {
  switch (status) {
    case "analyzed":
    case "posted":
    case "archived":
      return "done";
    case "awaiting_documents":
    case "awaiting_approval":
      return "in_progress";
    case "blocked":
      return "blocked";
    case "draft":
    default:
      return "pending";
  }
}

export function buildContractAutoDerivationPlan({
  contract,
  relatedEvents
}: {
  contract: Contract;
  relatedEvents: RelatedContractEvent[];
}) {
  const baseTitle = eventTitleFor(contract, "base");
  const baseEvent = relatedEvents.find((event) => event.title === baseTitle) ?? null;
  const requiredActions = getContractFollowupActions(contract);
  const existingByAction = new Map(
    requiredActions.map((action) => [action, relatedEvents.find((event) => event.title === eventTitleFor(contract, action)) ?? null])
  );
  const missingActions = requiredActions.filter((action) => !existingByAction.get(action));

  if (contract.status !== "active") {
    return {
      baseEventId: baseEvent?.id ?? null,
      missingActions,
      autoCreateActions: [] as ContractFollowupAction[],
      summary: "合同已进入终态，本轮不再自动补齐新的履约事项。"
    };
  }

  if (!baseEvent) {
    return {
      baseEventId: null,
      missingActions,
      autoCreateActions: [] as ContractFollowupAction[],
      summary: "请先生成合同执行事项，再按规则自动补齐后续履约链。"
    };
  }

  if (missingActions.length === 0) {
    return {
      baseEventId: baseEvent.id,
      missingActions,
      autoCreateActions: [] as ContractFollowupAction[],
      summary: "履约链已完整，无需再自动补齐。"
    };
  }

  const blockingAction = requiredActions.find((action) => {
    const existing = existingByAction.get(action);
    if (!existing) {
      return false;
    }
    const state = resolveContractProgressState(existing.status);
    return state === "blocked" || state === "in_progress";
  });

  if (blockingAction) {
    return {
      baseEventId: baseEvent.id,
      missingActions,
      autoCreateActions: [] as ContractFollowupAction[],
      summary: `上游履约步骤仍在处理中或阻塞中，当前不自动继续补齐后续事项。`
    };
  }

  const nextMissingAction = requiredActions.find((action) => !existingByAction.get(action)) ?? null;

  return {
    baseEventId: baseEvent.id,
    missingActions,
    autoCreateActions: nextMissingAction ? [nextMissingAction] : [],
    summary: nextMissingAction
      ? `已识别 ${missingActions.length} 个待补步骤，系统将按顺序自动补齐 ${eventTitleFor(contract, nextMissingAction).replace(`${contract.title} `, "")}。`
      : "履约链已完整，无需再自动补齐。"
  };
}
