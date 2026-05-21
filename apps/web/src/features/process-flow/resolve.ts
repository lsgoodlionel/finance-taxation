import { getProcessFlowNodesForBranch } from "./definition";
import type {
  ProcessFlowBranch,
  ProcessFlowContext,
  ProcessFlowNode,
  ProcessFlowResolvedNode,
  ProcessFlowNodeStatus,
  ProcessFlowResolverInput
} from "./types";

const PURCHASE_KEYWORDS = ["采购", "外购", "购置", "purchase", "procurement", "asset"];
const ENTERTAINMENT_KEYWORDS = ["招待", "宴请", "餐", "餐费", "接待", "entertainment", "meal", "travel", "meeting", "会议"];
const PURCHASE_TYPES = new Set(["procurement", "asset", "expense"]);
const ENTERTAINMENT_TYPES = new Set(["business_entertainment", "travel", "meeting"]);

function includesAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function resolveBranch(event: ProcessFlowResolverInput["event"]): ProcessFlowBranch {
  const type = event.type.toLowerCase();
  const combinedText = `${event.title ?? ""} ${event.description ?? ""}`.toLowerCase();

  if (ENTERTAINMENT_TYPES.has(type) || includesAnyKeyword(combinedText, ENTERTAINMENT_KEYWORDS)) {
    return "entertainment";
  }

  if (PURCHASE_TYPES.has(type) || includesAnyKeyword(combinedText, PURCHASE_KEYWORDS)) {
    return "purchase";
  }

  return "common";
}

function branchApprovalNodeId(branch: ProcessFlowBranch) {
  if (branch === "purchase") return "purchase_approval_dispatch";
  if (branch === "entertainment") return "entertainment_approval_dispatch";
  return "approval_dispatch";
}

function branchDocumentNodeId(branch: ProcessFlowBranch) {
  if (branch === "purchase") return "purchase_document_generation";
  if (branch === "entertainment") return "entertainment_document_generation";
  return "document_generation";
}

function resolveCurrentNodeId(input: ProcessFlowResolverInput, branch: ProcessFlowBranch) {
  if (input.detail.hasArchivedArtifacts) {
    return "archive_trace_query";
  }

  if ((input.detail.taxFilingBatches?.length ?? 0) > 0) {
    return "tax_filing_archive";
  }

  if (input.detail.vouchers.length > 0) {
    return "voucher_tax_processing";
  }

  if (input.detail.generatedDocuments.length > 0) {
    return branchDocumentNodeId(branch);
  }

  if (input.detail.tasks.length > 0) {
    return branchApprovalNodeId(branch);
  }

  return "ai_precheck";
}

function resolveBranchNodes(branch: ProcessFlowBranch): ProcessFlowNode[] {
  return getProcessFlowNodesForBranch(branch);
}

function resolveNodeStatus(nodeIndex: number, currentNodeIndex: number): ProcessFlowNodeStatus {
  if (nodeIndex < currentNodeIndex) {
    return "done";
  }

  if (nodeIndex === currentNodeIndex) {
    return "current";
  }

  return "pending";
}

export function resolveProcessFlowState(
  branch: ProcessFlowBranch,
  requestedCurrentNodeId: string
): Pick<ProcessFlowContext, "currentNodeId" | "nodes"> {
  const branchNodes = resolveBranchNodes(branch);
  const normalizedCurrentNodeId = branchNodes.find((node) => node.id === requestedCurrentNodeId)?.id
    ?? branchNodes[0]?.id
    ?? requestedCurrentNodeId;
  const currentNodeIndex = branchNodes.findIndex((node) => node.id === normalizedCurrentNodeId);

  return {
    currentNodeId: normalizedCurrentNodeId,
    nodes: branchNodes.map((node, nodeIndex) => ({
      ...node,
      status: resolveNodeStatus(nodeIndex, currentNodeIndex)
    })) as ProcessFlowResolvedNode[]
  };
}

export function resolveProcessFlowContext(input: ProcessFlowResolverInput): ProcessFlowContext {
  const branch = resolveBranch(input.event);
  const requestedCurrentNodeId = resolveCurrentNodeId(input, branch);
  const state = resolveProcessFlowState(branch, requestedCurrentNodeId);

  return {
    branch,
    currentNodeId: state.currentNodeId,
    nodes: state.nodes
  };
}
