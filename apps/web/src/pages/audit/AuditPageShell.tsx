import React, { type ReactNode } from "react";

type AuditPageShellProps = {
  header: ReactNode;
  filters: ReactNode;
  list: ReactNode;
  detail: ReactNode;
};

export function AuditPageShell({ header, filters, list, detail }: AuditPageShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      {filters}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: "24px", alignItems: "start" }}>
        {list}
        {detail}
      </div>
    </div>
  );
}
