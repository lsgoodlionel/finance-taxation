import React from "react";
import type { PayrollPeriodSummary } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportPayrollPanelProps = {
  periods: PayrollPeriodSummary[];
  onOpenPayrollSummary: (period: PayrollPeriodSummary) => void;
  onOpenPayrollSlips: (period: PayrollPeriodSummary) => void;
  renderActionButton: (onClick: () => void, label?: string) => React.ReactNode;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
};

export function ExportPayrollPanel({ periods, onOpenPayrollSummary, onOpenPayrollSlips, renderActionButton, cellStyle }: ExportPayrollPanelProps) {
  return (
    <DataTableShell title="工资汇总表 & 工资条">
      {periods.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无工资数据</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["工资期间", "人数", "实发合计", "状态", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.period}>
                <td style={cellStyle()}>{period.period}</td>
                <td style={cellStyle()}>{period.headcount} 人</td>
                <td style={cellStyle()}>¥ {period.totalNetPay.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                <td style={cellStyle()}>
                  <span style={{ fontSize: "12px", color: period.status === "confirmed" ? "#1a7f5a" : "#8a9bb0" }}>
                    {period.status === "confirmed" ? "已确认" : period.status === "draft" ? "草稿" : "部分确认"}
                  </span>
                </td>
                <td style={{ ...cellStyle(), display: "flex", gap: "6px" }}>
                  {renderActionButton(() => onOpenPayrollSummary(period), "工资汇总")}
                  {renderActionButton(() => onOpenPayrollSlips(period), "全员工资条")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
