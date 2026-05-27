import React from "react";
import type { BalanceSheetReport } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../../components/ui/DataTableShell";
import { EmptyState } from "../../../components/ui/EmptyState";

type BalanceSheetPanelProps = {
  report: BalanceSheetReport | null;
};

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function BalanceSheetPanel({ report }: BalanceSheetPanelProps) {
  if (!report) {
    return <EmptyState title="暂无资产负债表" description="请先在左侧更新报表，加载当前期间结果。" />;
  }

  const liabilitiesAndEquity = [...report.liabilities, ...report.equity];

  return (
    <DataTableShell title="资产负债表" actions={<span style={{ fontSize: "12px", color: "#6c7a89" }}>期末：{report.asOfDate}</span>}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellStyle()}>资产</th>
            <th style={cellStyle()}>金额</th>
            <th style={cellStyle()}>负债和权益</th>
            <th style={cellStyle()}>金额</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(report.assets.length, liabilitiesAndEquity.length) }).map((_, index) => {
            const asset = report.assets[index];
            const line = liabilitiesAndEquity[index];
            return (
              <tr key={index}>
                <td style={cellStyle()}>{asset ? `${asset.code} ${asset.label}` : ""}</td>
                <td style={cellStyle()}>{asset?.amount || ""}</td>
                <td style={cellStyle()}>{line ? `${line.code} ${line.label}` : ""}</td>
                <td style={cellStyle()}>{line?.amount || ""}</td>
              </tr>
            );
          })}
          <tr>
            <td style={cellStyle()}>资产合计</td>
            <td style={cellStyle()}>{report.totals.assets}</td>
            <td style={cellStyle()}>负债和权益合计</td>
            <td style={cellStyle()}>{report.totals.liabilitiesAndEquity}</td>
          </tr>
        </tbody>
      </table>
    </DataTableShell>
  );
}
