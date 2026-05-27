import React from "react";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import { cellStyle, tableStyle } from "./ledgerTableStyles";
import type { AccountingPeriod } from "../../lib/api";

type LedgerPeriodsPanelProps = {
  periods: AccountingPeriod[];
  newPeriod: string;
  periodOp: string | null;
  onNewPeriodChange: (value: string) => void;
  onLockNew: () => void;
  onLock: (period: string) => void;
  onUnlock: (period: string) => void;
};

export function LedgerPeriodsPanel(props: LedgerPeriodsPanelProps) {
  const {
    periods,
    newPeriod,
    periodOp,
    onNewPeriodChange,
    onLockNew,
    onLock,
    onUnlock
  } = props;

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <DataTableShell title="会计期间锁账管理">
        <div style={{ display: "grid", gap: "16px" }}>
          <p style={{ color: "#4d5d6c", fontSize: "13px", margin: 0, lineHeight: 1.7 }}>
            锁账后，该会计期间内的凭证将无法过账，防止账期关闭后的数据篡改。
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={newPeriod}
              onChange={(event) => onNewPeriodChange(event.target.value)}
              placeholder="输入期间 YYYY-MM，如 2026-05"
              style={{ width: "220px" }}
            />
            <button
              onClick={onLockNew}
              disabled={!newPeriod || periodOp !== null}
              style={{
                background: "#c0392b",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer"
              }}
            >
              锁定该期间
            </button>
          </div>
        </div>
      </DataTableShell>

      <DataTableShell title="期间列表">
        {periods.length === 0 ? (
          <EmptyState title="暂无已锁定期间" description="进入该场景后会加载已存在的期间记录，当前可先新增一个待锁账期间。" />
        ) : (
          <table style={tableStyle()}>
            <thead>
              <tr>
                <th style={cellStyle()}>会计期间</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>锁定时间</th>
                <th style={cellStyle()}>操作人</th>
                <th style={cellStyle()}>操作</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id}>
                  <td style={{ ...cellStyle(), fontWeight: 600 }}>{period.period}</td>
                  <td style={cellStyle()}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        background: period.isLocked ? "rgba(192,57,43,0.12)" : "rgba(39,174,96,0.12)",
                        color: period.isLocked ? "#c0392b" : "#27ae60",
                        fontWeight: 600
                      }}
                    >
                      {period.isLocked ? "🔒 已锁账" : "🔓 未锁账"}
                    </span>
                  </td>
                  <td style={cellStyle()}>{period.lockedAt ? period.lockedAt.slice(0, 16).replace("T", " ") : "—"}</td>
                  <td style={cellStyle()}>{period.lockedBy ?? "—"}</td>
                  <td style={cellStyle()}>
                    {period.isLocked ? (
                      <button
                        onClick={() => onUnlock(period.period)}
                        disabled={periodOp === period.period}
                        style={{
                          background: "transparent",
                          border: "1px solid #27ae60",
                          color: "#27ae60",
                          padding: "4px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "12px"
                        }}
                      >
                        {periodOp === period.period ? "处理中…" : "解锁"}
                      </button>
                    ) : (
                      <button
                        onClick={() => onLock(period.period)}
                        disabled={periodOp === period.period}
                        style={{
                          background: "transparent",
                          border: "1px solid #c0392b",
                          color: "#c0392b",
                          padding: "4px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "12px"
                        }}
                      >
                        {periodOp === period.period ? "处理中…" : "锁账"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataTableShell>
    </div>
  );
}
