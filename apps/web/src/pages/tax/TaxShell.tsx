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
    <div className="v3-result-shell">
      {header}
      {guidance}
      {summary}
      <div className="v3-result-grid v3-result-grid--wide">
        {taxItems}
        {batches}
      </div>
      {materials}
    </div>
  );
}
