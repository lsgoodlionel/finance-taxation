import React from "react";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import { cellStyle, numCellStyle, tableStyle } from "./ledgerTableStyles";
import type { LedgerSummaryItem } from "./types";

type LedgerSummaryPanelProps = {
  items: LedgerSummaryItem[];
};

export function LedgerSummaryPanel({ items }: LedgerSummaryPanelProps) {
  return (
    <DataTableShell title="科目汇总">
      {items.length === 0 ? (
        <EmptyState title="暂无科目汇总" description="当前没有可展示的借贷累计，请先确认是否已有过账数据。" />
      ) : (
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={cellStyle()}>科目编码</th>
              <th style={cellStyle()}>科目名称</th>
              <th style={numCellStyle()}>借方累计</th>
              <th style={numCellStyle()}>贷方累计</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.accountCode}-${item.accountName}`}>
                <td style={cellStyle()}>{item.accountCode}</td>
                <td style={cellStyle()}>{item.accountName}</td>
                <td style={numCellStyle()}>{item.debit}</td>
                <td style={numCellStyle()}>{item.credit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
