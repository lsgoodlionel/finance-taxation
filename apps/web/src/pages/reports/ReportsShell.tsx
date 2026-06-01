import React, { type ReactNode } from "react";

type ReportsShellProps = {
  header: ReactNode;
  sidebar: ReactNode;
  workbench: ReactNode;
};

export function ReportsShell({ header, sidebar, workbench }: ReportsShellProps) {
  return (
    <div className="v3-result-shell">
      {header}
      <div className="v3-result-grid">
        {sidebar}
        {workbench}
      </div>
    </div>
  );
}
