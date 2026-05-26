interface TimelineItem {
  id: string;
  date: string;
  title: string;
  kind: "contract" | "event";
  status: "done" | "in_progress" | "blocked" | "pending";
  relatedEventId?: string | null;
}

interface TimelineStateStyle {
  tagBg: string;
  color: string;
}

interface ContractTimelinePanelProps {
  items: TimelineItem[];
  stateLabels: Record<TimelineItem["status"], string>;
  stateStyles: Record<TimelineItem["status"], TimelineStateStyle>;
  onOpenEvent: (eventId: string) => void;
}

export function ContractTimelinePanel({
  items,
  stateLabels,
  stateStyles,
  onOpenEvent
}: ContractTimelinePanelProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ color: "#6c7a89", fontSize: "12px", marginBottom: "8px" }}>合同履约时间轴</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "grid",
              gridTemplateColumns: "96px 1fr auto",
              gap: "12px",
              alignItems: "center",
              padding: "8px 12px",
              borderRadius: "10px",
              background: item.kind === "contract" ? "rgba(37,99,235,0.06)" : "rgba(20,40,60,0.04)",
              border: "1px solid rgba(20,40,60,0.08)"
            }}
          >
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>{item.date}</div>
            <div style={{ fontSize: "13px", color: "#1e2a37" }}>{item.title}</div>
            {item.relatedEventId ? (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: "11px",
                    color: stateStyles[item.status].color,
                    background: stateStyles[item.status].tagBg,
                    padding: "4px 10px",
                    borderRadius: "999px"
                  }}
                >
                  {stateLabels[item.status]}
                </span>
                <button
                  onClick={() => onOpenEvent(item.relatedEventId!)}
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
            ) : (
              <span
                style={{
                  fontSize: "11px",
                  color: stateStyles[item.status].color,
                  background: stateStyles[item.status].tagBg,
                  padding: "4px 10px",
                  borderRadius: "999px"
                }}
              >
                {stateLabels[item.status]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
