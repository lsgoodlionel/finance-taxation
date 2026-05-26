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
      style={{
        background: "rgba(248,249,250,0.95)",
        borderRadius: "24px",
        border: "1px solid rgba(20,40,60,0.08)",
        padding: "16px",
        maxHeight: "240px",
        overflowY: "auto"
      }}
    >
      {children}
    </div>
  );
}
