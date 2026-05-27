interface PayrollWorkflowSummaryProps {
  summary: string;
  highlights: string[];
  readinessText?: string;
  pendingActions?: string[];
}

export function PayrollWorkflowSummary({
  summary,
  highlights,
  readinessText,
  pendingActions
}: PayrollWorkflowSummaryProps) {
  return (
    <div
      style={{
        border: "1px solid rgba(37,99,235,0.12)",
        borderRadius: "16px",
        background: "rgba(37,99,235,0.06)",
        padding: "16px 18px",
        display: "grid",
        gap: "10px"
      }}
    >
      <div style={{ fontSize: "12px", color: "#2563eb", fontWeight: 700, letterSpacing: "0.04em" }}>
        工资工作流摘要
      </div>
      <div style={{ fontSize: "14px", color: "#1e2a37", fontWeight: 600 }}>{summary}</div>
      {highlights.length ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {highlights.map((item) => (
            <span
              key={item}
              style={{
                fontSize: "12px",
                padding: "6px 10px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.72)",
                color: "#1e2a37"
              }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
      {readinessText ? <div style={{ fontSize: "12px", color: "#5b6b7b" }}>{readinessText}</div> : null}
      {pendingActions?.length ? (
        <div style={{ fontSize: "12px", color: "#8a6200" }}>待补动作：{pendingActions.join("；")}</div>
      ) : null}
    </div>
  );
}
