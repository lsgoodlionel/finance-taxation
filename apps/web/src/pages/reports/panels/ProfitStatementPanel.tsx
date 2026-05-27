import React from "react";
import type { ProfitStatementReport } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../../components/ui/DataTableShell";
import { EmptyState } from "../../../components/ui/EmptyState";

type ProfitStatementPanelProps = {
  report: ProfitStatementReport | null;
};

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const
  };
}

export function ProfitStatementPanel({ report }: ProfitStatementPanelProps) {
  if (!report) {
    return <EmptyState title="暂无利润表" description="请先在左侧更新报表，加载当前期间结果。" />;
  }

  return (
    <DataTableShell title="利润表" actions={<span style={{ fontSize: "12px", color: "#6c7a89" }}>期间：{report.periodLabel}</span>}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellStyle()}>项目</th>
            <th style={cellStyle()}>金额</th>
          </tr>
        </thead>
        <tbody>
          {[...report.revenues, ...report.costsAndExpenses].map((line) => (
            <tr key={line.code}>
              <td style={cellStyle()}>{line.label}</td>
              <td style={cellStyle()}>{line.amount}</td>
            </tr>
          ))}
          <tr><td style={cellStyle()}>营业收入</td><td style={cellStyle()}>{report.totals.revenue}</td></tr>
          <tr><td style={cellStyle()}>营业成本</td><td style={cellStyle()}>{report.totals.cost}</td></tr>
          <tr><td style={cellStyle()}>毛利润</td><td style={cellStyle()}>{report.totals.grossProfit}</td></tr>
          <tr><td style={cellStyle()}>期间费用</td><td style={cellStyle()}>{report.totals.expenses}</td></tr>
          <tr><td style={cellStyle()}>净利润</td><td style={cellStyle()}>{report.totals.netProfit}</td></tr>
        </tbody>
      </table>
    </DataTableShell>
  );
}
