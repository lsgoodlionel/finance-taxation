import React, { type ReactNode } from "react";

type TaxShellProps = {
  header: ReactNode;
  guidance?: ReactNode;
  summary: ReactNode;
  taxItems: ReactNode;
  batches: ReactNode;
  materials: ReactNode;
};

export function TaxShell({ header, guidance, summary, taxItems, batches, materials }: TaxShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      {guidance}
      {summary}
      {taxItems}
      {batches}
      {materials}
    </div>
  );
}
