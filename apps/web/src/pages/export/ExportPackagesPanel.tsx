import React from "react";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportPackagesPanelProps = {
  closingPeriod: string;
  inspectionPeriod: string;
  onClosingPeriodChange: (value: string) => void;
  onInspectionPeriodChange: (value: string) => void;
  onOpenMonthEnd: () => void;
  onOpenAudit: () => void;
  onOpenInspection: () => void;
  renderActionButton: (onClick: () => void, label?: string) => React.ReactNode;
};

export function ExportPackagesPanel({
  closingPeriod,
  inspectionPeriod,
  onClosingPeriodChange,
  onInspectionPeriodChange,
  onOpenMonthEnd,
  onOpenAudit,
  onOpenInspection,
  renderActionButton
}: ExportPackagesPanelProps) {
  return (
    <DataTableShell title="月结 / 审计 / 稽核资料包导出">
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            <span style={{ color: "#6c7a89" }}>月结期间</span>
            <input
              type="month"
              value={closingPeriod}
              onChange={(event) => onClosingPeriodChange(event.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
            />
          </label>
          {renderActionButton(onOpenMonthEnd, "打开月结资料包")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            <span style={{ color: "#6c7a89" }}>审计 / 稽核期间</span>
            <input
              value={inspectionPeriod}
              onChange={(event) => onInspectionPeriodChange(event.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
              placeholder="例如 2026-Q2"
            />
          </label>
          {renderActionButton(onOpenAudit, "打开审计资料包")}
          {renderActionButton(onOpenInspection, "打开稽核资料包")}
        </div>
      </div>
    </DataTableShell>
  );
}
