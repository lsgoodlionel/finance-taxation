import React from "react";
import { ResultBanner } from "../../components/ui/ResultBanner";
import { Term } from "../../components/ui/Term";
import type { LedgerSceneKey } from "./types";

/**
 * 当前这件事的只读上下文（TaskFocusShell 的 aside）。
 *
 * 改造前它固定列出 6 个数字（分录 / 批次 / 科目汇总 / 科目余额 / 日记账 / 锁账期间）
 * 和 6 行过滤条件，无论用户在做哪件事都全量摆出——查日记账的人不需要知道
 * 「科目余额有几个科目」，追一笔分录的人也不关心「锁了几个期间」。
 *
 * 现在按当前任务收缩：只给这件事用得上的数字和过滤条件。这样它才配当 aside，
 * 而不是又一块要用户自己筛的信息墙。
 */

type LedgerContextPanelProps = {
  scene: LedgerSceneKey;
  message: string;
  entryCount: number;
  batchCount: number;
  summaryCount: number;
  balanceCount: number;
  journalCount: number;
  lockedPeriodCount: number;
  unlockedPeriodCount: number;
  voucherFilter: string;
  eventFilter: string;
  journalType: "cash" | "bank";
  journalFrom: string;
  journalTo: string;
};

interface ContextMetric {
  label: string;
  value: string;
}

interface ContextFact {
  label: string;
  value: React.ReactNode;
}

const METRIC_CARD_STYLE: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1px solid rgba(20,40,60,0.08)",
  background: "rgba(255,255,255,0.72)"
};

const METRIC_ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
  gap: "10px"
};

const FACT_LIST_STYLE: React.CSSProperties = {
  display: "grid",
  gap: "4px",
  fontSize: "13px",
  color: "#4d5d6c",
  lineHeight: 1.7
};

const JOURNAL_ACCOUNT_LABELS: Record<"cash" | "bank", string> = {
  cash: "现金（1001）",
  bank: "银行存款（1002）"
};

/** 每件事只报它自己的数：数字要么在回答当前问题，要么就是噪音。 */
function resolveMetrics(scene: LedgerSceneKey, props: LedgerContextPanelProps): ContextMetric[] {
  switch (scene) {
    case "summary":
      return [
        { label: "已归集科目", value: String(props.summaryCount) },
        { label: "已入账分录", value: String(props.entryCount) }
      ];
    case "balances":
      return [
        { label: "有余额的科目", value: String(props.balanceCount) },
        { label: "已入账分录", value: String(props.entryCount) }
      ];
    case "journal":
      return [{ label: "本次拉到的流水", value: String(props.journalCount) }];
    case "entries":
      return [
        { label: "当前分录", value: String(props.entryCount) },
        { label: "当前过账批次", value: String(props.batchCount) }
      ];
    case "opening":
      // 期初建账只有「建了没建」这一个事实，报分录数会让人以为要对着它核。
      // 具体的借贷合计在面板自己那一屏上，这里不重复。
      return [{ label: "已入账分录", value: String(props.entryCount) }];
    case "periods":
      return [
        { label: "已锁期间", value: String(props.lockedPeriodCount) },
        { label: "未锁期间", value: String(props.unlockedPeriodCount) }
      ];
    case "revaluation":
      // 调汇的数字全部依赖「截至哪一天」，而那个日期在面板内部由用户选。
      // 外壳这里报一个与日期无关的数只会误导，不如不报——面板自己会列出
      // 每个外币科目的余额、汇率与差额。
      return [];
  }
}

/** 过滤条件同理：只有会影响当前这件事结果的条件才值得复述一遍。 */
function resolveFacts(scene: LedgerSceneKey, props: LedgerContextPanelProps): ContextFact[] {
  if (scene === "journal") {
    return [
      { label: "资金账", value: JOURNAL_ACCOUNT_LABELS[props.journalType] },
      { label: "开始日期", value: props.journalFrom || "未设置" },
      { label: "结束日期", value: props.journalTo || "未设置" }
    ];
  }
  if (scene === "entries") {
    return [
      { label: "凭证过滤", value: props.voucherFilter || "全部" },
      { label: "事项过滤", value: props.eventFilter || "全部" }
    ];
  }
  return [];
}

export function LedgerContextPanel(props: LedgerContextPanelProps) {
  const { scene, message } = props;
  const metrics = resolveMetrics(scene, props);
  const facts = resolveFacts(scene, props);

  return (
    <section className="v3-section-shell" data-tone="muted" style={{ display: "grid", gap: "12px" }}>
      <h3 style={{ margin: 0, fontSize: "14px", color: "#1e2a37" }}>这件事的当前范围</h3>
      <ResultBanner tone="info" message={message} />
      <div style={METRIC_ROW_STYLE}>
        {metrics.map((metric) => (
          <div key={metric.label} style={METRIC_CARD_STYLE}>
            <div style={{ fontSize: "12px", color: "#6c7a89", marginBottom: "6px" }}>{metric.label}</div>
            <strong style={{ fontSize: "20px", color: "#1e2a37" }}>{metric.value}</strong>
          </div>
        ))}
      </div>
      {facts.length > 0 ? (
        <div style={FACT_LIST_STYLE}>
          {facts.map((fact) => (
            <div key={fact.label}>
              {fact.label}：{fact.value}
            </div>
          ))}
        </div>
      ) : null}
      <p style={{ margin: 0, fontSize: "12px", color: "#6c7a89", lineHeight: 1.7 }}>
        <Term k="general-ledger">总账</Term>只能由<Term k="voucher">凭证</Term>
        <Term k="posting">过账</Term>形成，本页不直接改数；发现错账要回凭证中心处理。
      </p>
    </section>
  );
}
