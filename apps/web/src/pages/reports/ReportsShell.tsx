import React, { type ReactNode } from "react";

type ReportsShellProps = {
  header: ReactNode;
  sidebar: ReactNode;
  workbench: ReactNode;
};

export function ReportsShell({ header, sidebar, workbench }: ReportsShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
          alignItems: "start"
        }}
      >
        {sidebar}
        {workbench}
      </div>
    </div>
  );
}
