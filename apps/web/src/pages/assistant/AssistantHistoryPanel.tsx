import React, { type ReactNode } from "react";

type AssistantHistoryPanelProps = {
  visible: boolean;
  children: ReactNode;
};

export function AssistantHistoryPanel({ visible, children }: AssistantHistoryPanelProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="v3-section-shell"
      data-tone="muted"
      style={{ maxHeight: "240px", overflowY: "auto" }}
    >
      {children}
    </div>
  );
}
