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
      <section className="v3-hero-shell">{header}</section>
      <section className="v3-section-shell" data-tone="accent">{summary}</section>
      <section className="v3-section-shell" data-tone="muted">{sceneSelector}</section>
      <div
        className="v3-workbench-grid"
        style={{
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
          alignItems: "start"
        }}
      >
        <div className="v3-workbench-card">
          <section className="v3-section-shell">{content}</section>
        </div>
        <div className="v3-workbench-card">{context}</div>
      </div>
    </div>
  );
}
