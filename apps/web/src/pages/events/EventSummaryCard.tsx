/**
 * 「这一笔是什么」——事项详情里唯一的事实陈述块。
 *
 * 合并了改造前分散的三块：事项描述、下游对象计数条、异常摘要卡。三者回答的是
 * 同一个问题（这笔业务是什么、产生了什么、哪里看着不对），拆成三张卡只是让用户
 * 多滚两屏。异常摘要是判断依据，按要求保留，但归到这块里而不是自成一节。
 */
import React from "react";
import { Term } from "../../components/ui/Term";

export interface EventExceptionSummary {
  tone: "error" | "warning";
  title: string;
  summary: string;
  bullets: string[];
}

export interface EventSummaryCardProps {
  description: string;
  counts: {
    tasks: number;
    documents: number;
    vouchers: number;
    taxItems: number;
  };
  exception: EventExceptionSummary | null;
  /** 「按这条事项筛选后打开单据/凭证中心」这类整批入口，排在计数之后。 */
  bulkLinks?: React.ReactNode;
}

const SHELL_STYLE: React.CSSProperties = { display: "grid", gap: 12 };

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--c-text-muted)",
  letterSpacing: "0.05em"
};

const DESCRIPTION_STYLE: React.CSSProperties = { margin: 0, lineHeight: 1.8, fontSize: 13.5 };

const COUNT_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 16px",
  fontSize: 12.5,
  color: "var(--c-text-muted)"
};

function exceptionStyle(tone: EventExceptionSummary["tone"]): React.CSSProperties {
  return {
    borderRadius: 16,
    border: tone === "error" ? "1px solid rgba(185,28,28,0.18)" : "1px solid rgba(217,119,6,0.18)",
    background: tone === "error" ? "rgba(254,242,242,0.92)" : "rgba(255,251,235,0.96)",
    padding: "14px 16px",
    display: "grid",
    gap: 8
  };
}

export function EventSummaryCard({ description, counts, exception, bulkLinks }: EventSummaryCardProps) {
  return (
    <section className="v3-section-shell" data-tone="muted" style={{ padding: "12px 16px" }}>
      <div style={SHELL_STYLE}>
        <div style={LABEL_STYLE}>这一笔是什么</div>
        <p style={DESCRIPTION_STYLE}>{description || "这笔事项还没有填写描述。"}</p>
        <div style={COUNT_ROW_STYLE}>
          <span>已拆出任务 {counts.tasks} 项</span>
          <span>已生成单据 {counts.documents} 份</span>
          <span>
            已生成<Term k="voucher">凭证</Term> {counts.vouchers} 张
          </span>
          <span>税务事项 {counts.taxItems} 条</span>
        </div>
        {bulkLinks ? <div style={COUNT_ROW_STYLE}>{bulkLinks}</div> : null}
        {exception ? (
          <div style={exceptionStyle(exception.tone)} role="note" aria-label="这一笔的异常提示">
            <div style={{ fontSize: 13, fontWeight: 700 }}>{exception.title}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>{exception.summary}</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
              {exception.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
