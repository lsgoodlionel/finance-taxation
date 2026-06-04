import React, { type ReactNode } from "react";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";

type ReportsShellProps = {
  header: ReactNode;
  sidebar: ReactNode;
  workbench: ReactNode;
};

export function ReportsShell({ header, sidebar, workbench }: ReportsShellProps) {
  return (
    <div className="v3-result-shell">
      {header}
      <FinanceFlowBar current="reports" />
      <div className="v3-result-grid">
        {sidebar}
        {workbench}
      </div>
    </div>
  );
}
