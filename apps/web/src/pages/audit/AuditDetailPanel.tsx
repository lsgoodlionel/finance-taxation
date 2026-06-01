import type { AuditLog } from "@finance-taxation/domain-model";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

type AuditDetailPanelProps = {
  log: AuditLog | null;
  renderChanges: (changes: Record<string, unknown> | null) => React.ReactNode;
};

export function AuditDetailPanel({ log, renderChanges }: AuditDetailPanelProps) {
  return (
    <article style={panelStyle()}>
      <h3 style={{ marginTop: 0 }}>日志详情</h3>
      {log ? (
        <div style={{ display: "grid", gap: "12px", fontSize: "13px" }}>
          <div>
            <strong>对象：</strong>{log.resourceLabel ?? log.resourceId ?? "-"}
          </div>
          <div>
            <strong>对象类型：</strong>{log.resourceType}
          </div>
          <div>
            <strong>操作：</strong>{log.action}
          </div>
          <div>
            <strong>时间：</strong>{log.createdAt}
          </div>
          <div>
            <strong>变更：</strong>
            <div style={{ marginTop: "8px", padding: "10px 12px", borderRadius: "12px", background: "rgba(20,40,60,0.04)" }}>
              {renderChanges(log.changes)}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ color: "#aab5c0" }}>请选择一条日志，查看完整变更详情。</div>
      )}
    </article>
  );
}
