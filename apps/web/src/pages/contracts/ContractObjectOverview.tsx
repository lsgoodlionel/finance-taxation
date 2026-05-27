interface ContractObjectOverviewProps {
  relatedTasksCount: number;
  relatedDocumentsCount: number;
  relatedTaxItemsCount: number;
  relatedVouchersCount: number;
}

export function ContractObjectOverview({
  relatedTasksCount,
  relatedDocumentsCount,
  relatedTaxItemsCount,
  relatedVouchersCount
}: ContractObjectOverviewProps) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ color: "#6c7a89", fontSize: "12px", marginBottom: "8px" }}>合同关联对象概览</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
        {[
          ["关联任务", relatedTasksCount, "#1e2a37"],
          ["关联单据", relatedDocumentsCount, "#2563eb"],
          ["税务事项", relatedTaxItemsCount, "#1a7f5a"],
          ["关联凭证", relatedVouchersCount, "#8e44ad"]
        ].map(([label, count, color]) => (
          <div
            key={String(label)}
            style={{
              border: "1px solid rgba(20,40,60,0.08)",
              borderRadius: "12px",
              padding: "12px 14px",
              background: "rgba(255,255,255,0.8)"
            }}
          >
            <div style={{ color: "#6c7a89", fontSize: "12px", marginBottom: "6px" }}>{label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: String(color) }}>{count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ContractWorkbenchActionsProps {
  creating: boolean;
  createActionLabel: string;
  hasEvent: boolean;
  hasTask: boolean;
  hasTax: boolean;
  hasVoucher: boolean;
  onCreateRelatedEvent: () => void;
  onOpenEvents: () => void;
  onOpenTasks: () => void;
  onOpenTax: () => void;
  onOpenVouchers: () => void;
  onOpenRisk: () => void;
  onOpenAudit: () => void;
}

export function ContractWorkbenchActions({
  creating,
  createActionLabel,
  hasEvent,
  hasTask,
  hasTax,
  hasVoucher,
  onCreateRelatedEvent,
  onOpenEvents,
  onOpenTasks,
  onOpenTax,
  onOpenVouchers,
  onOpenRisk,
  onOpenAudit
}: ContractWorkbenchActionsProps) {
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: hasEvent ? "16px" : 0 }}>
      <button
        onClick={onCreateRelatedEvent}
        disabled={creating}
        style={{
          fontSize: "12px",
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid #2563eb",
          color: "#2563eb",
          background: "none",
          cursor: "pointer",
          opacity: creating ? 0.6 : 1
        }}
      >
        {createActionLabel}
      </button>
      {hasEvent ? (
        <button
          onClick={onOpenEvents}
          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", border: "1px solid #1e2a37", color: "#1e2a37", background: "none", cursor: "pointer" }}
        >
          查看事项总线
        </button>
      ) : null}
      {hasTask ? (
        <button
          onClick={onOpenTasks}
          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", border: "1px solid #1e2a37", color: "#1e2a37", background: "none", cursor: "pointer" }}
        >
          查看任务链
        </button>
      ) : null}
      {hasTax ? (
        <button
          onClick={onOpenTax}
          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", border: "1px solid #1a7f5a", color: "#1a7f5a", background: "none", cursor: "pointer" }}
        >
          查看税务事项
        </button>
      ) : null}
      {hasVoucher ? (
        <button
          onClick={onOpenVouchers}
          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", border: "1px solid #8e44ad", color: "#8e44ad", background: "none", cursor: "pointer" }}
        >
          查看凭证
        </button>
      ) : null}
      <button
        onClick={onOpenRisk}
        style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", border: "1px solid #c0392b", color: "#c0392b", background: "none", cursor: "pointer" }}
      >
        查看合同风险
      </button>
      <button
        onClick={onOpenAudit}
        style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", border: "1px solid #4a5568", color: "#4a5568", background: "none", cursor: "pointer" }}
      >
        查看合同审计
      </button>
    </div>
  );
}
