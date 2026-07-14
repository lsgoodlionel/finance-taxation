import { buildProcessFlowPageContext } from "../../features/process-flow/page-context";
import { resolveProcessFlowContext } from "../../features/process-flow/resolve";
import { FLOW_CONTEXT_STORAGE_KEY } from "./constants";
import type { AssistantFlowContext } from "./types";

export function buildAssistantFlowContext(input: {
  id?: string;
  type: string;
  title: string;
  description?: string;
  detail?: {
    tasks?: Array<{ id: string }>;
    generatedDocuments?: Array<{ id: string }>;
    vouchers?: Array<{ id: string }>;
    taxItems?: Array<{ id: string }>;
  };
}): AssistantFlowContext {
  const context = resolveProcessFlowContext({
    event: {
      id: input.id ?? "assistant-preview",
      type: input.type,
      title: input.title,
      description: input.description ?? "",
      status: "analyzed"
    },
    detail: {
      tasks: input.detail?.tasks ?? [],
      generatedDocuments: input.detail?.generatedDocuments ?? [],
      vouchers: input.detail?.vouchers ?? [],
      taxItems: input.detail?.taxItems ?? []
    }
  });

  const pageContext = context.branch === "common"
    ? buildProcessFlowPageContext({
      currentNodeId: context.currentNodeId,
      businessEventId: input.id
    })
    : null;

  return {
    ...context,
    nodes: pageContext?.nodes ?? context.nodes,
    businessEventId: input.id,
    eventTitle: input.title
  };
}

export function readStoredFlowContexts(): Record<string, AssistantFlowContext> {
  try {
    const raw = localStorage.getItem(FLOW_CONTEXT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AssistantFlowContext>) : {};
  } catch {
    return {};
  }
}

export function writeStoredFlowContexts(contexts: Record<string, AssistantFlowContext>): void {
  try {
    localStorage.setItem(FLOW_CONTEXT_STORAGE_KEY, JSON.stringify(contexts));
  } catch {
    // ignore storage quota errors for assistant flow snapshots
  }
}
