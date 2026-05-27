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
    <div className="v3-hero-shell" style={{ padding: "18px 20px", gap: "12px" }}>
      <div className="v3-section-heading">
        <span className="v3-section-kicker" style={{ color: "#2563eb" }}>工资工作流摘要</span>
        <h2 className="v3-section-title" style={{ fontSize: "17px" }}>{summary}</h2>
      </div>
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
