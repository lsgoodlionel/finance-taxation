import React, { type ReactNode } from "react";

type ContractsShellProps = {
  header: ReactNode;
  createForm?: ReactNode;
  filters: ReactNode;
  list: ReactNode;
  detail?: ReactNode;
};

export function ContractsShell({ header, createForm, filters, list, detail }: ContractsShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      {createForm ? <section className="v3-section-shell">{createForm}</section> : null}
      <section className="v3-section-shell" data-tone="muted">{filters}</section>
      <div className={detail ? "v3-result-grid v3-result-grid--wide" : "v3-workbench-grid"}>
        <div className="v3-workbench-card">{list}</div>
        {detail ? <div className="v3-workbench-card">{detail}</div> : null}
      </div>
    </div>
  );
}
