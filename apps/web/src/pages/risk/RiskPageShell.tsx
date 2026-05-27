import React, { type ReactNode } from "react";

type RiskPageShellProps = {
  header: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  timeline: ReactNode;
};

export function RiskPageShell({ header, list, detail, timeline }: RiskPageShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(360px, 0.95fr)", gap: "24px", alignItems: "start" }}>
        {list}
        <div style={{ display: "grid", gap: "24px" }}>
          {detail}
          {timeline}
        </div>
      </div>
    </div>
  );
}
