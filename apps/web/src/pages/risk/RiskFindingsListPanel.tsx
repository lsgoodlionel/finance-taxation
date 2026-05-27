import type { BusinessEvent, RiskFinding } from "@finance-taxation/domain-model";
import { buildRiskDrilldownTargets } from "../drilldown";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

type RiskFindingsListPanelProps = {
  findings: RiskFinding[];
  eventMap: Map<string, BusinessEvent>;
  navEventId: string | null;
  selectedFindingId: string;
  severityLabel: (severity: RiskFinding["severity"]) => string;
  priorityLabel: (priority: NonNullable<RiskFinding["priority"]>) => string;
  statusLabel: (status: RiskFinding["status"]) => string;
  onSelectFinding: (findingId: string) => void;
  onNavigate: (path: string, state?: Record<string, string>) => void;
};

export function RiskFindingsListPanel({
  findings,
  eventMap,
  navEventId,
  selectedFindingId,
  severityLabel,
  priorityLabel,
  statusLabel,
  onSelectFinding,
  onNavigate
}: RiskFindingsListPanelProps) {
  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0 }}>
        风险发现{navEventId ? `（当前事项 ${navEventId}）` : ""}
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellStyle()}>规则</th>
            <th style={cellStyle()}>严重级别</th>
            <th style={cellStyle()}>状态</th>
            <th style={cellStyle()}>评分</th>
            <th style={cellStyle()}>优先级</th>
            <th style={cellStyle()}>事项</th>
            <th style={cellStyle()}>标题</th>
            <th style={cellStyle()}>说明</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => {
            const linkedEvent = finding.businessEventId ? eventMap.get(finding.businessEventId) ?? null : null;
            const targets = buildRiskDrilldownTargets(linkedEvent);
            const isSelected = selectedFindingId === finding.id;
            return (
              <tr key={finding.id} style={{ background: isSelected ? "rgba(79,142,247,0.06)" : "transparent" }}>
                <td style={cellStyle()}>{finding.ruleCode}</td>
                <td style={cellStyle()}>{severityLabel(finding.severity)}</td>
                <td style={cellStyle()}>{statusLabel(finding.status)}</td>
                <td style={cellStyle()}>{finding.score ?? "—"}</td>
                <td style={cellStyle()}>{finding.priority ? priorityLabel(finding.priority) : "—"}</td>
                <td style={cellStyle()}>{finding.businessEventId || "—"}</td>
                <td style={cellStyle()}>{finding.title}</td>
                <td style={cellStyle()}>
                  <div>{finding.detail}</div>
                  {targets.length ? (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                      {targets.map((target) => (
                        <button key={`${finding.id}-${target.path}-${target.label}`} style={{ fontSize: "11px", padding: "3px 10px" }} onClick={() => onNavigate(target.path, target.state)}>
                          {target.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                    <button style={{ fontSize: "12px", padding: "4px 10px" }} onClick={() => onSelectFinding(finding.id)}>
                      {isSelected ? "当前复盘" : "查看复盘"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {findings.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ ...cellStyle(), textAlign: "center", color: "#9aa5b4", padding: "24px" }}>
                当前筛选范围内暂无风险发现
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </article>
  );
}
