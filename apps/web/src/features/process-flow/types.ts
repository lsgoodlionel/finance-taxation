export type ProcessFlowBranch = "common" | "purchase" | "entertainment";

export type ProcessFlowNodeStatus = "pending" | "current" | "done" | "blocked";

export interface ProcessFlowNode {
  id: string;
  title: string;
  branch: ProcessFlowBranch;
  description: string;
  departments: string[];
  documents: string[];
  taxes: string[];
  vouchers: string[];
  routes: string[];
}

export interface ProcessFlowResolvedNode extends ProcessFlowNode {
  status: ProcessFlowNodeStatus;
}

export interface ProcessFlowResolverEvent {
  id: string;
  type: string;
  title?: string;
  description?: string | null;
  status?: string;
}

export interface ProcessFlowResolverDetail {
  tasks: Array<{ id: string }>;
  generatedDocuments: Array<{ id: string }>;
  vouchers: Array<{ id: string }>;
  taxItems: Array<{ id: string }>;
  taxFilingBatches?: Array<{ id: string }>;
  hasArchivedArtifacts?: boolean;
}

export interface ProcessFlowResolverInput {
  event: ProcessFlowResolverEvent;
  detail: ProcessFlowResolverDetail;
}

export interface ProcessFlowContext {
  branch: ProcessFlowBranch;
  currentNodeId: string;
  nodes: ProcessFlowResolvedNode[];
}
