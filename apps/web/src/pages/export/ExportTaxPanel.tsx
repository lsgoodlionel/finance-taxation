import React from "react";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportTaxPanelProps = {
  vatFilingPeriod: string;
  citFilingPeriod: string;
  onVatPeriodChange: (value: string) => void;
  onCitPeriodChange: (value: string) => void;
  onOpenVat: () => void;
  onOpenCit: () => void;
  renderActionButton: (onClick: () => void, label?: string) => React.ReactNode;
};

export function ExportTaxPanel({
  vatFilingPeriod,
  citFilingPeriod,
  onVatPeriodChange,
  onCitPeriodChange,
  onOpenVat,
  onOpenCit,
  renderActionButton
}: ExportTaxPanelProps) {
  return (
    <DataTableShell title="税务底稿与申报准备导出">
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            <span style={{ color: "#6c7a89" }}>增值税底稿期间</span>
            <input
              type="month"
              value={vatFilingPeriod}
              onChange={(event) => onVatPeriodChange(event.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
            />
          </label>
          {renderActionButton(onOpenVat, "打开增值税底稿")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            <span style={{ color: "#6c7a89" }}>企业所得税准备期间</span>
            <input
              value={citFilingPeriod}
              onChange={(event) => onCitPeriodChange(event.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
              placeholder="例如 2026-Q2"
            />
          </label>
          {renderActionButton(onOpenCit, "打开企业所得税准备稿")}
        </div>
      </div>
    </DataTableShell>
  );
}
