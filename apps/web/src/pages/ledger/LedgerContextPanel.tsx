import React from "react";
import { ResultBanner } from "../../components/ui/ResultBanner";
import type { LedgerSceneKey } from "./types";

type LedgerContextPanelProps = {
  scene: LedgerSceneKey;
  message: string;
  entryCount: number;
  batchCount: number;
  summaryCount: number;
  balanceCount: number;
  journalCount: number;
  lockedPeriodCount: number;
  voucherFilter: string;
  eventFilter: string;
  journalType: "cash" | "bank";
  journalFrom: string;
  journalTo: string;
};

function metricCard(label: string, value: string) {
  return (
    <div
      key={label}
      style={{
        padding: "14px 16px",
        borderRadius: "16px",
        border: "1px solid rgba(20,40,60,0.08)",
        background: "rgba(255,255,255,0.72)"
      }}
    >
      <div style={{ fontSize: "12px", color: "#6c7a89", marginBottom: "6px" }}>{label}</div>
      <strong style={{ fontSize: "20px", color: "#1e2a37" }}>{value}</strong>
    </div>
  );
}

export function LedgerContextPanel(props: LedgerContextPanelProps) {
  const {
    scene,
    message,
    entryCount,
    batchCount,
    summaryCount,
    balanceCount,
    journalCount,
    lockedPeriodCount,
    voucherFilter,
    eventFilter,
    journalType,
    journalFrom,
    journalTo
  } = props;

  return (
    <aside style={{ display: "grid", gap: "16px" }}>
      <section className="v3-section-shell" data-tone="muted">
        <div className="v3-section-heading">
          <span className="v3-section-kicker">当前提示</span>
          <h2 className="v3-section-title" style={{ fontSize: "17px" }}>先看范围和数量，再决定是否继续钻取。</h2>
        </div>
        <div>
          <ResultBanner tone="info" message={message} />
        </div>
        <div style={{ display: "grid", gap: "10px" }}>
          {metricCard("总账分录", String(entryCount))}
          {metricCard("过账批次", String(batchCount))}
          {metricCard("科目汇总", String(summaryCount))}
          {metricCard("科目余额", String(balanceCount))}
          {metricCard("日记账记录", String(journalCount))}
          {metricCard("锁账期间", String(lockedPeriodCount))}
        </div>
      </section>

      <section className="v3-section-shell" data-tone="accent">
        <div className="v3-section-heading">
          <span className="v3-section-kicker">当前上下文</span>
          <h2 className="v3-section-title" style={{ fontSize: "17px" }}>过滤条件和账本口径都在这里确认。</h2>
        </div>
        <div style={{ fontSize: "13px", color: "#4d5d6c", lineHeight: 1.7 }}>
          <div>场景：{scene}</div>
          <div>凭证过滤：{voucherFilter || "全部"}</div>
          <div>事项过滤：{eventFilter || "全部"}</div>
          <div>资金账：{journalType === "cash" ? "现金（1001）" : "银行存款（1002）"}</div>
          <div>开始日期：{journalFrom || "未设置"}</div>
          <div>结束日期：{journalTo || "未设置"}</div>
        </div>
      </section>
    </aside>
  );
}
