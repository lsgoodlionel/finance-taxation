import React from "react";
import type { CashFlowReport } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../../components/ui/DataTableShell";
import { EmptyState } from "../../../components/ui/EmptyState";

type CashFlowPanelProps = {
  report: CashFlowReport | null;
};

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const
  };
}

export function CashFlowPanel({ report }: CashFlowPanelProps) {
  if (!report) {
    return <EmptyState title="暂无现金流量表" description="请先在左侧更新报表，加载当前期间结果。" />;
  }

  return (
    <DataTableShell title="现金流量表" actions={<span style={{ fontSize: "12px", color: "#6c7a89" }}>期间：{report.periodLabel}</span>}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellStyle()}>项目</th>
            <th style={cellStyle()}>金额</th>
          </tr>
        </thead>
        <tbody>
          {[...report.sections.operating, ...report.sections.investing, ...report.sections.financing].map((line) => (
            <tr key={line.code}>
              <td style={cellStyle()}>{line.label}</td>
              <td style={cellStyle()}>{line.amount}</td>
            </tr>
          ))}
          <tr><td style={cellStyle()}>经营净现金流</td><td style={cellStyle()}>{report.totals.operatingNetCash}</td></tr>
          <tr><td style={cellStyle()}>投资净现金流</td><td style={cellStyle()}>{report.totals.investingNetCash}</td></tr>
          <tr><td style={cellStyle()}>筹资净现金流</td><td style={cellStyle()}>{report.totals.financingNetCash}</td></tr>
          <tr><td style={cellStyle()}>现金净增加额</td><td style={cellStyle()}>{report.totals.netCashChange}</td></tr>
        </tbody>
      </table>
    </DataTableShell>
  );
}
