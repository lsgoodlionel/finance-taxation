import React, { type ReactNode } from "react";

type EventListPanelProps = {
  count: number;
  children: ReactNode;
};

export function EventListPanel({ count, children }: EventListPanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">经营事项列表</span>
        <span className="badge badge-gray">{count}</span>
      </div>
      <div className="card-body" style={{ padding: "8px 12px", maxHeight: 480, overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}
