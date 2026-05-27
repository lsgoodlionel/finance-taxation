import React, { type ReactNode } from "react";

type PayrollShellProps = {
  header: ReactNode;
  content: ReactNode;
};

export function PayrollShell({ header, content }: PayrollShellProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      {content}
    </div>
  );
}
