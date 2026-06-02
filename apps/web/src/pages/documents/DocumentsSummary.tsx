import { useI18n, DOC_STATUS_LABELS } from "../../lib/i18n";
import { STATUS_COLOR, type DocumentsSummary as DocumentsSummaryData } from "./documents-helpers";

type DocumentsSummaryProps = {
  summary: DocumentsSummaryData;
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

export function DocumentsSummary({ summary, message }: DocumentsSummaryProps) {
  const { t } = useI18n();
  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "15px" }}>单据概览</h3>
        <span style={{ fontSize: "13px", color: "#6c7a89" }}>{message}</span>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <StatCard label="单据总数" value={summary.total} />
        <StatCard label="待上传附件" value={summary.pendingUploadCount} tone={summary.pendingUploadCount > 0 ? "#d97706" : "#1a7f5a"} />
        <StatCard label="已归档" value={summary.archivedCount} tone="#6b7280" />
      </div>

      {summary.statusBreakdown.length > 0 && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {summary.statusBreakdown.map((bucket) => (
            <div key={bucket.status} style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "6px 14px", borderRadius: "999px",
              background: "rgba(20,40,60,0.04)", fontSize: "13px"
            }}>
              <span style={{
                width: "10px", height: "10px", borderRadius: "50%",
                background: STATUS_COLOR[bucket.status] ?? "#8a9bb0", display: "inline-block"
              }} />
              <span style={{ color: "#4d5d6c" }}>{t(DOC_STATUS_LABELS, bucket.status)}</span>
              <strong style={{ color: "#1e2a37" }}>{bucket.count}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
