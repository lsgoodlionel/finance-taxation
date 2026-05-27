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
      {header}
      {createForm}
      {filters}
      <div style={{ display: "grid", gridTemplateColumns: detail ? "minmax(0, 1.05fr) minmax(340px, 0.95fr)" : "1fr", gap: "24px", alignItems: "start" }}>
        {list}
        {detail}
      </div>
    </div>
  );
}
