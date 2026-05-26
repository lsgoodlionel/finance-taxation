import React, { type ReactNode } from "react";

type EventCreatePanelProps = {
  children: ReactNode;
};

export function EventCreatePanel({ children }: EventCreatePanelProps) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">新建经营事项</span>
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}
