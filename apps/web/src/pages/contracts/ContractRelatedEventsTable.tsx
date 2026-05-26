interface RelatedEventView {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface ContractRelatedEventsTableProps {
  title: string;
  events: RelatedEventView[];
  statusLabel: (status: string) => string;
  onOpenEvent: (eventId: string) => void;
  onOpenTasks: (eventId: string) => void;
  onOpenTax: (eventId: string) => void;
  onOpenVouchers: (eventId: string) => void;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function ContractRelatedEventsTable({
  title,
  events,
  statusLabel,
  onOpenEvent,
  onOpenTasks,
  onOpenTax,
  onOpenVouchers
}: ContractRelatedEventsTableProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <>
      <h4 style={{ margin: "0 0 8px", fontSize: "14px" }}>{title}（{events.length}）</h4>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ color: "#6c7a89" }}>
            {["事项名称", "状态", "创建时间", "流转"].map((header) => (
              <th key={header} style={{ ...cellStyle(), fontWeight: 400 }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td style={cellStyle()}>
                <button
                  onClick={() => onOpenEvent(event.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: "12px", padding: 0 }}
                >
                  {event.title}
                </button>
              </td>
              <td style={cellStyle()}>{statusLabel(event.status)}</td>
              <td style={cellStyle()}>{event.createdAt ? new Date(event.createdAt).toLocaleDateString("zh-CN") : "—"}</td>
              <td style={cellStyle()}>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => onOpenTasks(event.id)}
                    style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "999px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}
                  >
                    任务
                  </button>
                  <button
                    onClick={() => onOpenTax(event.id)}
                    style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "999px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}
                  >
                    税务
                  </button>
                  <button
                    onClick={() => onOpenVouchers(event.id)}
                    style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "999px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}
                  >
                    凭证
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
