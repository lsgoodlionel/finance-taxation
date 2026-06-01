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
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      {kpiCards}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
          alignItems: "start"
        }}
      >
        {list}
        <div style={{ display: "grid", gap: "24px" }}>
          {detail}
          {timeline}
        </div>
      </div>
    </div>
  );
}
