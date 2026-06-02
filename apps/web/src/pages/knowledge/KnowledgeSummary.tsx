import { CATEGORY_COLORS } from "./types";
import type { KnowledgeSummary as KnowledgeSummaryData } from "./knowledge-helpers";

type KnowledgeSummaryProps = {
  summary: KnowledgeSummaryData;
  message: string;
};

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{
      flex: "1 1 120px", minWidth: "120px",
      borderRadius: "16px", border: "1px solid rgba(20,40,60,0.08)",
      padding: "14px 18px", background: "rgba(255,255,255,0.7)"
    }}>
      <div style={{ fontSize: "12px", color: "#6c7a89", marginBottom: "4px" }}>{label}</div>
      <strong style={{ fontSize: "24px", color: tone ?? "#1e2a37" }}>{value}</strong>
    </div>
  );
}

export function KnowledgeSummary({ summary, message }: KnowledgeSummaryProps) {
  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "15px" }}>制度库概览</h3>
        <span style={{ fontSize: "13px", color: "#6c7a89" }}>{message}</span>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <StatCard label="条目总数" value={summary.total} />
        <StatCard label="启用中" value={summary.activeCount} tone="#15803d" />
        <StatCard label="已停用" value={summary.inactiveCount} tone="#b45309" />
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {summary.breakdown.map((b) => (
          <div key={b.category} style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "6px 14px", borderRadius: "999px",
            background: "rgba(20,40,60,0.04)", fontSize: "13px"
          }}>
            <span style={{
              width: "10px", height: "10px", borderRadius: "50%",
              background: CATEGORY_COLORS[b.category] ?? "#6c7a89", display: "inline-block"
            }} />
            <span style={{ color: "#4d5d6c" }}>{b.label}</span>
            <strong style={{ color: "#1e2a37" }}>{b.count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
