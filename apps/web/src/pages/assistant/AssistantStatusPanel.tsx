import React, { type ReactNode } from "react";

type AssistantStatusPanelProps = {
  children: ReactNode;
};

export function AssistantStatusPanel({ children }: AssistantStatusPanelProps) {
  return (
    <section className="v3-section-shell" data-tone="muted">
      <div className="v3-section-heading">
        <span className="v3-section-kicker">当前状态</span>
        <h2 className="v3-section-title">先确认本轮上下文，再决定是继续提问还是生成事项。</h2>
      </div>
      {children}
    </section>
  );
}
