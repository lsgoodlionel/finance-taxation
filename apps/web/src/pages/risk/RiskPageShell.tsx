import React, { type ReactNode } from "react";

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
