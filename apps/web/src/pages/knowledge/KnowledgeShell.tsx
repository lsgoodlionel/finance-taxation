import React, { type ReactNode } from "react";

type KnowledgeShellProps = {
  header: ReactNode;
  summary: ReactNode;
  filters: ReactNode;
  parsePanel?: ReactNode;
  form?: ReactNode;
  list: ReactNode;
  aside: ReactNode;
};

export function KnowledgeShell({ header, summary, filters, parsePanel, form, list, aside }: KnowledgeShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      <section className="v3-section-shell" data-tone="accent">{summary}</section>
      <section className="v3-section-shell" data-tone="muted">{filters}</section>
      {parsePanel ? <section className="v3-section-shell" data-tone="info">{parsePanel}</section> : null}
      {form ? <section className="v3-section-shell">{form}</section> : null}
      <div className="v3-result-grid v3-result-grid--wide">
        <div className="v3-workbench-card">
          <section className="v3-section-shell">{list}</section>
        </div>
        <div className="v3-workbench-card">{aside}</div>
      </div>
    </div>
  );
}
