import { PROCESS_FLOW_NODES } from "./definition";
import { resolveProcessFlowState } from "./resolve";
import type { ProcessFlowBranch, ProcessFlowNodeStatus, ProcessFlowResolvedNode } from "./types";

const PURCHASE_HINTS = ["采购", "外购", "购置", "办公用品", "固定资产", "低值易耗", "存货", "采购单"];
const ENTERTAINMENT_HINTS = ["招待", "宴请", "餐费", "餐饮", "接待", "会议费", "会议", "差旅餐饮", "招待登记"];

const STATUS_PRIORITY: Record<ProcessFlowNodeStatus, number> = {
  pending: 0,
  done: 1,
  blocked: 2,
  current: 3
};

function normalizeText(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function includesAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function pickHigherPriorityStatus(current: ProcessFlowNodeStatus, next: ProcessFlowNodeStatus) {
  return STATUS_PRIORITY[next] > STATUS_PRIORITY[current] ? next : current;
}

function mergeResolvedNodes(groups: ProcessFlowResolvedNode[][]) {
  const merged = new Map<string, ProcessFlowResolvedNode>();

  for (const group of groups) {
    for (const node of group) {
      const existing = merged.get(node.id);
      if (!existing) {
        merged.set(node.id, node);
        continue;
      }

      merged.set(node.id, {
        ...existing,
        status: pickHigherPriorityStatus(existing.status, node.status)
      });
    }
  }

  return PROCESS_FLOW_NODES.flatMap((node) => {
    const resolvedNode = merged.get(node.id);
    return resolvedNode ? [resolvedNode] : [];
  });
}

function resolveBranchStageNodeId(branch: ProcessFlowBranch, currentNodeId: string) {
  if (currentNodeId === "approval_dispatch") {
    return branch === "purchase" ? "purchase_approval_dispatch" : "entertainment_approval_dispatch";
  }

  if (currentNodeId === "document_generation") {
    return branch === "purchase" ? "purchase_document_generation" : "entertainment_document_generation";
  }

  return currentNodeId;
}

export function inferProcessFlowBranchFromTexts(values: Array<string | null | undefined>): ProcessFlowBranch | null {
  const combinedText = normalizeText(values);
  if (!combinedText) {
    return null;
  }

  const hasPurchaseHint = includesAnyKeyword(combinedText, PURCHASE_HINTS);
  const hasEntertainmentHint = includesAnyKeyword(combinedText, ENTERTAINMENT_HINTS);

  if (hasPurchaseHint === hasEntertainmentHint) {
    return null;
  }

  return hasEntertainmentHint ? "entertainment" : "purchase";
}

export function buildProcessFlowPageContext(input: {
  currentNodeId: string;
  branch?: ProcessFlowBranch | null;
  businessEventId?: string | null;
}) {
  const businessEventId = input.businessEventId?.trim() || undefined;

  if (input.branch) {
    const state = resolveProcessFlowState(input.branch, resolveBranchStageNodeId(input.branch, input.currentNodeId));
    return {
      activeBranch: input.branch,
      currentNodeId: state.currentNodeId,
      nodes: state.nodes,
      businessEventId
    };
  }

  const purchaseCurrentNodeId = resolveBranchStageNodeId("purchase", input.currentNodeId);
  const entertainmentCurrentNodeId = resolveBranchStageNodeId("entertainment", input.currentNodeId);
  const purchaseState = resolveProcessFlowState("purchase", purchaseCurrentNodeId);
  const entertainmentState = resolveProcessFlowState("entertainment", entertainmentCurrentNodeId);

  return {
    activeBranch: undefined,
    currentNodeId: input.currentNodeId,
    nodes: mergeResolvedNodes([purchaseState.nodes, entertainmentState.nodes]),
    businessEventId
  };
}
