import React from "react";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import { cellStyle, numCellStyle, tableStyle } from "./ledgerTableStyles";
import type { JournalItem } from "./types";

type LedgerJournalPanelProps = {
  items: JournalItem[];
  journalType: "cash" | "bank";
  journalFrom: string;
  journalTo: string;
  onJournalTypeChange: (value: "cash" | "bank") => void;
  onJournalFromChange: (value: string) => void;
  onJournalToChange: (value: string) => void;
  onLoadJournal: () => void;
};

function journalButton(active: boolean) {
  return {
    padding: "4px 14px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    background: active ? "#1e2a37" : "transparent",
    color: active ? "#fff" : "#4d5d6c"
  } as const;
}

export function LedgerJournalPanel(props: LedgerJournalPanelProps) {
  const {
    items,
    journalType,
    journalFrom,
    journalTo,
    onJournalTypeChange,
    onJournalFromChange,
    onJournalToChange,
    onLoadJournal
  } = props;

  return (
    <DataTableShell
      title="现金 / 银行日记账"
      actions={(
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", background: "rgba(20,40,60,0.06)", borderRadius: "12px", padding: "4px" }}>
            <button onClick={() => onJournalTypeChange("cash")} style={journalButton(journalType === "cash")}>
              现金（1001）
            </button>
            <button onClick={() => onJournalTypeChange("bank")} style={journalButton(journalType === "bank")}>
              银行存款（1002）
            </button>
          </div>
          <input
            value={journalFrom}
            onChange={(event) => onJournalFromChange(event.target.value)}
            placeholder="开始日期 2026-01-01"
            style={{ width: "150px" }}
          />
          <input
            value={journalTo}
            onChange={(event) => onJournalToChange(event.target.value)}
            placeholder="结束日期 2026-12-31"
            style={{ width: "150px" }}
          />
          <button onClick={onLoadJournal}>查询</button>
        </div>
      )}
    >
      {items.length === 0 ? (
        <EmptyState title="暂无日记账记录" description="请先确认资金账类型和日期范围，再点击查询加载当前场景的数据。" />
      ) : (
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={cellStyle()}>日期</th>
              <th style={cellStyle()}>科目</th>
              <th style={cellStyle()}>摘要</th>
              <th style={numCellStyle()}>借方</th>
              <th style={numCellStyle()}>贷方</th>
              <th style={numCellStyle()}>余额</th>
              <th style={cellStyle()}>来源凭证</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const balance = Number(item.balance);
              return (
                <tr key={item.id}>
                  <td style={cellStyle()}>{item.postedAt?.slice(0, 10)}</td>
                  <td style={cellStyle()}>
                    <span style={{ fontSize: "12px", color: "#4d5d6c" }}>{item.accountCode}</span>{" "}
                    {item.accountName}
                  </td>
                  <td style={cellStyle()}>{item.summary}</td>
                  <td style={numCellStyle()}>{Number(item.debit) > 0 ? item.debit : ""}</td>
                  <td style={numCellStyle()}>{Number(item.credit) > 0 ? item.credit : ""}</td>
                  <td style={{ ...numCellStyle(), color: balance < 0 ? "#c0392b" : "inherit" }}>{item.balance}</td>
                  <td style={{ ...cellStyle(), fontSize: "11px", color: "#4d5d6c" }}>
                    {item.voucherId?.slice(-8).toUpperCase()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
