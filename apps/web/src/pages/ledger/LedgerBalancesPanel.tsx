import React from "react";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import { cellStyle, numCellStyle, tableStyle } from "./ledgerTableStyles";
import type { LedgerBalanceItem } from "./types";

type LedgerBalancesPanelProps = {
  items: LedgerBalanceItem[];
};

export function LedgerBalancesPanel({ items }: LedgerBalancesPanelProps) {
  return (
    <DataTableShell title="科目余额">
      {items.length === 0 ? (
        <EmptyState title="暂无科目余额" description="当前没有余额数据，请先检查总账汇总是否已生成。" />
      ) : (
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={cellStyle()}>科目编码</th>
              <th style={cellStyle()}>科目名称</th>
              <th style={numCellStyle()}>借方累计</th>
              <th style={numCellStyle()}>贷方累计</th>
              <th style={numCellStyle()}>余额</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.accountCode}-${item.accountName}-balance`}>
                <td style={cellStyle()}>{item.accountCode}</td>
                <td style={cellStyle()}>{item.accountName}</td>
                <td style={numCellStyle()}>{item.debit}</td>
                <td style={numCellStyle()}>{item.credit}</td>
                <td style={{ ...numCellStyle(), fontWeight: 600 }}>{item.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
