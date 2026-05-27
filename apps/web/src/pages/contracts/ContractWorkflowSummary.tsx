interface WorkflowStateStyle {
  border: string;
  bg: string;
  tagBg: string;
  color: string;
}

interface ContractWorkflowSummaryProps {
  contractStatusLabel: string;
  summary: string;
  recommendedActionsLabel?: string;
  autoCreateCount: number;
}

export function ContractWorkflowSummary({
  contractStatusLabel,
  summary,
  recommendedActionsLabel,
  autoCreateCount
}: ContractWorkflowSummaryProps) {
  return (
    <div
      style={{
        marginBottom: "20px",
        padding: "16px 18px",
        borderRadius: "16px",
        border: "1px solid rgba(37,99,235,0.12)",
        background: "rgba(37,99,235,0.06)",
        display: "grid",
        gap: "8px"
      }}
    >
      <div style={{ fontSize: "12px", color: "#2563eb", fontWeight: 700, letterSpacing: "0.04em" }}>
        履约流程摘要
      </div>
      <div style={{ fontSize: "14px", color: "#1e2a37", fontWeight: 600 }}>{summary}</div>
      <div style={{ fontSize: "12px", color: "#5b6b7b", lineHeight: 1.7 }}>
        当前状态：{contractStatusLabel}
        {recommendedActionsLabel ? ` · 建议优先补 ${recommendedActionsLabel}` : ""}
        {autoCreateCount > 0 ? ` · 可自动补齐 ${autoCreateCount} 项履约动作` : ""}
      </div>
    </div>
  );
}

interface WorkflowStepView {
  title: string;
  state: "done" | "in_progress" | "blocked" | "pending";
  relatedEventId?: string | null;
}

interface ContractFollowupActionsProps {
  creating: boolean;
  workflow?: {
    summary: string;
    steps: WorkflowStepView[];
    recommendedActions: string[];
  } | null;
  availableActions: string[];
  autoCreateActionsCount: number;
  actionLabels: Record<string, string>;
  stateLabels: Record<WorkflowStepView["state"], string>;
  stateStyles: Record<WorkflowStepView["state"], WorkflowStateStyle>;
  onCreateAction: (action: string) => void;
  onAutoCreate: () => void;
  onOpenEvent: (eventId: string) => void;
}

export function ContractFollowupActions({
  creating,
  workflow,
  availableActions,
  autoCreateActionsCount,
  actionLabels,
  stateLabels,
  stateStyles,
  onCreateAction,
  onAutoCreate,
  onOpenEvent
}: ContractFollowupActionsProps) {
  return (
    <>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ color: "#6c7a89", fontSize: "12px", marginBottom: "8px" }}>合同履约链动作</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {availableActions.map((action) => (
            <button
              key={action}
              onClick={() => onCreateAction(action)}
              disabled={creating}
              style={{
                fontSize: "12px",
                padding: "6px 12px",
                borderRadius: "999px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                cursor: "pointer",
                opacity: creating ? 0.6 : 1
              }}
            >
              {actionLabels[action]}
            </button>
          ))}
        </div>
      </div>
      {workflow ? (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ color: "#6c7a89", fontSize: "12px", marginBottom: "8px" }}>履约步骤清单</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {workflow.steps.map((step) => {
              const style = stateStyles[step.state];
              return (
                <div
                  key={step.title}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: "12px",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    border: `1px solid ${style.border}`,
                    background: style.bg
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      background: style.tagBg,
                      color: style.color
                    }}
                  >
                    {stateLabels[step.state]}
                  </span>
                  <span style={{ fontSize: "13px", color: "#1e2a37" }}>{step.title}</span>
                  {step.relatedEventId ? (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          color: style.color,
                          background: style.tagBg,
                          padding: "4px 10px",
                          borderRadius: "999px"
                        }}
                      >
                        {stateLabels[step.state]}
                      </span>
                      <button
                        onClick={() => onOpenEvent(step.relatedEventId!)}
                        style={{
                          fontSize: "11px",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          border: "1px solid #cbd5e1",
                          background: "#fff",
                          cursor: "pointer"
                        }}
                      >
                        查看事项
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#6c7a89" }}>{workflow.summary}</div>
          {(workflow.recommendedActions.length > 0 || autoCreateActionsCount > 0) ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px", alignItems: "center" }}>
              {autoCreateActionsCount > 0 ? (
                <button
                  onClick={onAutoCreate}
                  disabled={creating}
                  style={{
                    fontSize: "12px",
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: "1px solid #2563eb",
                    color: "#2563eb",
                    background: "#eff6ff",
                    cursor: "pointer"
                  }}
                >
                  规则自动补齐履约链
                </button>
              ) : null}
              {workflow.recommendedActions.map((action) => (
                <button
                  key={action}
                  onClick={() => onCreateAction(action)}
                  disabled={creating}
                  style={{
                    fontSize: "12px",
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: "1px solid #f59e0b",
                    color: "#b45309",
                    background: "#fff7ed",
                    cursor: "pointer"
                  }}
                >
                  补 {actionLabels[action]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
