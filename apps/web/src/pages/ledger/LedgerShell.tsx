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
    <div className="v3-result-shell">
      {header}
      {summary}
      {sceneSelector}
      <div className="v3-result-grid v3-result-grid--wide">
        {content}
        {context}
      </div>
    </div>
  );
}
