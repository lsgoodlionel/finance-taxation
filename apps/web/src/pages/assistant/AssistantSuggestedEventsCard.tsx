import React from "react";

type SuggestedEvent = {
  type: string;
  title: string;
  amount: number | null;
  occurredOn: string | null;
};

type AssistantSuggestedEventsCardProps = {
  approverRoleLabel: string;
  creating: boolean;
  eventTypeLabels: Record<string, string>;
  events: SuggestedEvent[];
  onConfirm(): void;
  onDismiss(): void;
};

export function AssistantSuggestedEventsCard({
  approverRoleLabel,
  creating,
  eventTypeLabels,
  events,
  onConfirm,
  onDismiss
}: AssistantSuggestedEventsCardProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: "rgba(232,244,239,0.95)",
      borderRadius: "24px",
      border: "1px solid rgba(26,127,90,0.2)",
      padding: "16px",
      display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px"
    }}>
      <div style={{ fontSize: "13px", flex: 1 }}>
        <span style={{ fontWeight: 600, color: "#1a7f5a" }}>
          📋 建议创建经营事项{events.length > 1 ? `（共 ${events.length} 条，按月分拆）` : ""}：
        </span>
        {events.length === 1 ? (
          <span style={{ marginLeft: "8px" }}>
            [{eventTypeLabels[events[0]!.type] ?? events[0]!.type}] {events[0]!.title}
            {events[0]!.amount !== null && ` · ¥${events[0]!.amount.toLocaleString()}`}
            {events[0]!.occurredOn && ` · ${events[0]!.occurredOn}`}
          </span>
        ) : (
          <ul style={{ margin: "6px 0 0 0", paddingLeft: "20px", lineHeight: 1.8 }}>
            {events.map((event, index) => (
              <li key={index} style={{ fontSize: "12.5px" }}>
                [{eventTypeLabels[event.type] ?? event.type}] {event.title}
                {event.amount !== null && ` · ¥${event.amount.toLocaleString()}`}
                {event.occurredOn && ` · ${event.occurredOn}`}
              </li>
            ))}
          </ul>
        )}
        <div style={{ fontSize: "12px", color: "#6c7a89", marginTop: "6px" }}>
          确认后将分别自动生成执行任务和凭证草稿，由 <strong>{approverRoleLabel}</strong> 审核过账
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexShrink: 0, paddingTop: "2px" }}>
        <button
          onClick={onConfirm}
          disabled={creating}
          style={{
            background: "#1a7f5a", color: "#fff", border: "none",
            borderRadius: "8px", padding: "6px 16px", cursor: "pointer",
            fontSize: "13px", opacity: creating ? 0.6 : 1
          }}
        >
          {creating ? "处理中..." : events.length > 1 ? `批量创建 ${events.length} 条` : "一键处理"}
        </button>
        <button
          onClick={onDismiss}
          style={{
            background: "none", color: "#6c7a89", border: "1px solid rgba(20,40,60,0.15)",
            borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontSize: "13px"
          }}
        >
          忽略
        </button>
      </div>
    </div>
  );
}
