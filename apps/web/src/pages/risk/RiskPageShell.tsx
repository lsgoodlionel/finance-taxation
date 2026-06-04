import React, { type ReactNode } from "react";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";

type RiskPageShellProps = {
  header: ReactNode;
  kpiCards?: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  timeline: ReactNode;
};

export function RiskPageShell({ header, kpiCards, list, detail, timeline }: RiskPageShellProps) {
  return (
    <div className="v3-result-shell">
      {header}
      <FinanceFlowBar current="risk" />
      {kpiCards}
      <div className="v3-result-grid v3-result-grid--wide">
        {list}
        <div className="v3-result-stack">
          {detail}
          {timeline}
        </div>
      </div>
    </div>
  );
}
