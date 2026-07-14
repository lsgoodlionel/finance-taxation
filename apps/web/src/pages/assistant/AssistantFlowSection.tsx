import React from "react";
import { ProcessFlowCard } from "../../features/process-flow/ProcessFlowCard";
import type { ProcessFlowResolvedNode } from "../../features/process-flow/types";
import type { AssistantFlowContext } from "./types";

interface AssistantFlowSectionProps {
  flowContext: AssistantFlowContext | null;
  flowTitle: string;
  flowSubtitle: string;
  currentFlowNode: ProcessFlowResolvedNode | undefined;
  nextFlowNode: ProcessFlowResolvedNode | undefined;
}

export function AssistantFlowSection({
  flowContext,
  flowTitle,
  flowSubtitle,
  currentFlowNode,
  nextFlowNode
}: AssistantFlowSectionProps) {
  return (
    <>
      <ProcessFlowCard
        mode="inline"
        title={flowTitle}
        subtitle={flowSubtitle}
        activeBranch={flowContext?.branch === "common" ? undefined : flowContext?.branch}
        currentNodeId={flowContext?.currentNodeId}
        nodes={flowContext?.nodes}
        businessEventId={flowContext?.businessEventId}
      />
      {flowContext && currentFlowNode && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">本次事项摘要</span>
          </div>
          <div
            className="card-body"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}
          >
            <div>
              <div className="text-muted text-sm">当前步骤</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{currentFlowNode.title}</div>
            </div>
            <div>
              <div className="text-muted text-sm">涉及部门</div>
              <div style={{ marginTop: 4 }}>{currentFlowNode.departments.join(" / ") || "无"}</div>
            </div>
            <div>
              <div className="text-muted text-sm">关键单据</div>
              <div style={{ marginTop: 4 }}>{currentFlowNode.documents.join(" / ") || "无"}</div>
            </div>
            <div>
              <div className="text-muted text-sm">税务要点</div>
              <div style={{ marginTop: 4 }}>{currentFlowNode.taxes.join(" / ") || "无"}</div>
            </div>
            <div>
              <div className="text-muted text-sm">凭证线索</div>
              <div style={{ marginTop: 4 }}>{currentFlowNode.vouchers.join(" / ") || "无"}</div>
            </div>
            <div>
              <div className="text-muted text-sm">下一步骤</div>
              <div style={{ marginTop: 4 }}>{nextFlowNode?.title ?? "当前已到流程末端"}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
