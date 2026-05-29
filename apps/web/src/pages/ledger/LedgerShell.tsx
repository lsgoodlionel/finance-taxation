import React, { type ReactNode } from "react";

type LedgerShellProps = {
  header: ReactNode;
  summary: ReactNode;
  sceneSelector: ReactNode;
  content: ReactNode;
  context: ReactNode;
};

export function LedgerShell({ header, summary, sceneSelector, content, context }: LedgerShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      {summary}
      {sceneSelector}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
          gap: "24px",
          alignItems: "start"
        }}
      >
        {content}
        {context}
      </div>
    </div>
  );
}
