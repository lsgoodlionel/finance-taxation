import React from "react";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import { cellStyle, numCellStyle, tableStyle } from "./ledgerTableStyles";
import type { LedgerEntry, LedgerPostingBatch } from "@finance-taxation/domain-model";

type LedgerEntriesPanelProps = {
  entries: LedgerEntry[];
  batches: LedgerPostingBatch[];
  selectedVoucherId: string;
  selectedEventId: string;
  onVoucherIdChange: (value: string) => void;
  onEventIdChange: (value: string) => void;
  onFilter: () => void;
  onClear: () => void;
};

export function LedgerEntriesPanel(props: LedgerEntriesPanelProps) {
  const {
    entries,
    batches,
    selectedVoucherId,
    selectedEventId,
    onVoucherIdChange,
    onEventIdChange,
    onFilter,
    onClear
  } = props;

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <DataTableShell title="过滤条件">
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            value={selectedVoucherId}
            onChange={(event) => onVoucherIdChange(event.target.value)}
            placeholder="输入凭证编号过滤"
            style={{ flex: 1, minWidth: "220px" }}
          />
          <input
            value={selectedEventId}
            onChange={(event) => onEventIdChange(event.target.value)}
            placeholder="输入事项编号过滤"
            style={{ flex: 1, minWidth: "220px" }}
          />
          <button onClick={onFilter}>过滤</button>
          <button onClick={onClear}>清空</button>
        </div>
      </DataTableShell>

      <DataTableShell title="过账批次">
        {batches.length === 0 ? (
          <EmptyState title="暂无过账批次" description="当前过滤条件下没有匹配的批次，可调整凭证或事项编号后重试。" />
        ) : (
          <table style={tableStyle()}>
            <thead>
              <tr>
                <th style={cellStyle()}>批次编号</th>
                <th style={cellStyle()}>凭证</th>
                <th style={cellStyle()}>事项</th>
                <th style={cellStyle()}>分录数</th>
                <th style={cellStyle()}>过账时间</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((item) => (
                <tr key={item.id}>
                  <td style={cellStyle()}>{item.id}</td>
                  <td style={cellStyle()}>{item.voucherId}</td>
                  <td style={cellStyle()}>{item.businessEventId}</td>
                  <td style={cellStyle()}>{item.entryIds.length}</td>
                  <td style={cellStyle()}>{item.postedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataTableShell>

      <DataTableShell title="总账分录">
        {entries.length === 0 ? (
          <EmptyState title="暂无总账分录" description="当前过滤条件下没有匹配分录，可恢复全部总账数据后继续查看。" />
        ) : (
          <table style={tableStyle()}>
            <thead>
              <tr>
                <th style={cellStyle()}>日期</th>
                <th style={cellStyle()}>摘要</th>
                <th style={cellStyle()}>科目</th>
                <th style={numCellStyle()}>借方</th>
                <th style={numCellStyle()}>贷方</th>
                <th style={cellStyle()}>来源凭证</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((item) => (
                <tr key={item.id}>
                  <td style={cellStyle()}>{item.entryDate}</td>
                  <td style={cellStyle()}>{item.summary}</td>
                  <td style={cellStyle()}>
                    {item.accountCode} / {item.accountName}
                  </td>
                  <td style={numCellStyle()}>{item.debit}</td>
                  <td style={numCellStyle()}>{item.credit}</td>
                  <td style={cellStyle()}>{item.voucherId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataTableShell>
    </div>
  );
}
