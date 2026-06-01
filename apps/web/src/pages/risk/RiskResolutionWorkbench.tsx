import type { BusinessEvent, RiskFinding } from "@finance-taxation/domain-model";
import type { DrilldownTarget } from "../drilldown";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

type RiskResolutionWorkbenchProps = {
  finding: RiskFinding | null;
  event: BusinessEvent | null;
  closureTargets: DrilldownTarget[];
  resolution: string;
  onResolutionChange: (value: string) => void;
  onNavigate: (path: string, state?: Record<string, string>) => void;
  onOpenAudit: () => void;
  onCloseFinding: () => void;
};

export function RiskResolutionWorkbench({
  finding,
  event,
  closureTargets,
  resolution,
  onResolutionChange,
  onNavigate,
  onOpenAudit,
  onCloseFinding
}: RiskResolutionWorkbenchProps) {
  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0 }}>整改工作台</h3>
      {finding ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <div style={{ padding: "14px 16px", borderRadius: "16px", background: "rgba(79,142,247,0.08)" }}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前风险</div>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>{finding.title}</div>
            <div style={{ marginTop: "6px", color: "#4b5563", fontSize: "13px" }}>{finding.detail}</div>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "13px", color: "#6c7a89" }}>关联对象链</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {closureTargets.map((target) => (
                <button key={`closure-${target.path}-${target.label}`} style={{ fontSize: "12px", padding: "4px 10px" }} onClick={() => onNavigate(target.path, target.state)}>
                  {target.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "13px", color: "#6c7a89" }}>整改建议</div>
            <div style={{ color: "#1f2937", fontSize: "13px", lineHeight: 1.7 }}>
              {event ? `优先回到事项 ${event.title} 的上游对象链核对资料、凭证和税务结果，再回本页关闭。` : "优先回到相关业务页完成整改，再回本页关闭。"}
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>关闭说明</label>
            <textarea value={resolution} onChange={(event) => onResolutionChange(event.target.value)} rows={4} style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(20,40,60,0.2)", boxSizing: "border-box", resize: "vertical", fontSize: "13px" }} />
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={onOpenAudit} style={{ fontSize: "12px", padding: "6px 12px" }}>查看审计</button>
            {finding.status !== "resolved" ? (
              <button onClick={onCloseFinding} style={{ fontSize: "12px", padding: "6px 12px" }}>标记已关闭</button>
            ) : null}
          </div>
        </div>
      ) : (
        <div style={{ color: "#9aa5b4", fontSize: "13px" }}>请选择一条风险，查看整改链和关闭动作。</div>
      )}
    </article>
  );
}
