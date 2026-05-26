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
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {header}
      {createForm}
      {filters}
      {list}
      {detail}
    </div>
  );
}
