import React, { type ReactNode } from "react";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";

type DocumentsShellProps = {
  header: ReactNode;
  summary: ReactNode;
  list: ReactNode;
  detail: ReactNode;
};

export function DocumentsShell({ header, summary, list, detail }: DocumentsShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      <FinanceFlowBar current="documents" />
      <section className="v3-section-shell" data-tone="accent">{summary}</section>
      <div className="v3-result-grid v3-result-grid--wide">
        <div className="v3-workbench-card">
          <section className="v3-section-shell">{list}</section>
        </div>
        <div className="v3-workbench-card">
          <section className="v3-section-shell">{detail}</section>
        </div>
      </div>
    </div>
  );
}
