import React from "react";

type EventListPanelProps = {
  count: number;
  emptyText?: string;
  events: Array<{
    id: string;
    title: string;
    typeLabel: string;
    department: string;
    status: string;
    statusLabel: string;
  }>;
  selectedEventId: string | null;
  onSelect(eventId: string, status: string): void;
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "badge badge-gray",
    awaiting_documents: "badge badge-yellow",
    awaiting_approval: "badge badge-blue",
    analyzed: "badge badge-green",
    blocked: "badge badge-red"
  };
  return map[status] ?? "badge badge-gray";
}

export function EventListPanel({ count, emptyText = "暂无事项", events, selectedEventId, onSelect }: EventListPanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">经营事项列表</span>
        <span className="badge badge-gray">{count}</span>
      </div>
      <div className="card-body" style={{ padding: "8px 12px", maxHeight: 480, overflowY: "auto" }}>
        {events.length === 0 ? (
          <div className="state-empty">{emptyText}</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => onSelect(event.id, event.status)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: "var(--r-lg)",
                  border: event.id === selectedEventId
                    ? "1px solid var(--c-primary)"
                    : "1px solid var(--c-border)",
                  background: event.id === selectedEventId
                    ? "var(--c-primary-light)"
                    : "var(--c-surface)",
                  cursor: "pointer",
                  width: "100%"
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{event.title}</div>
                <div className="flex-row mt-4">
                  <span className={statusBadge(event.status)}>{event.statusLabel}</span>
                  <span className="text-muted text-sm">{event.typeLabel} · {event.department}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
