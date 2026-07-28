/**
 * 驾驶舱的一段 = 一个问题 + 一句结论 + 展开这句结论的图表。
 *
 * 改造前这一页是 6 个只有名词标题的区块（「近 6 月收支趋势」「本月费用构成」
 * 「利润与费用概览」…），读者得自己把图看懂再总结出结论。现在段首先把结论说了，
 * 图表退回它该在的位置：给这句结论提供依据的展开。
 */
import React from "react";
import type { ChairmanAnswerTone, ChairmanQuestion } from "./chairman-questions";

const TONE_COLORS: Record<ChairmanAnswerTone, string> = {
  good: "#15803d",
  warn: "#b45309",
  // 「算不出」不是「没问题」，用中性灰，不给绿色的安心暗示。
  unknown: "#64748b"
};

const HEADING_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  color: "#64748b",
  letterSpacing: "0.02em"
};

const ANSWER_STYLE: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 20,
  lineHeight: 1.5,
  fontWeight: 700
};

export interface DashboardQuestionSectionProps {
  question: ChairmanQuestion;
  tone?: "accent" | "muted";
  children: React.ReactNode;
}

export function DashboardQuestionSection({ question, tone, children }: DashboardQuestionSectionProps) {
  return (
    <section className="v3-section-shell" data-tone={tone} aria-labelledby={`chairman-q-${question.key}`}>
      <header style={{ marginBottom: 16 }}>
        <h2 id={`chairman-q-${question.key}`} style={HEADING_STYLE}>{question.heading}</h2>
        <p style={{ ...ANSWER_STYLE, color: TONE_COLORS[question.tone] }}>{question.answer}</p>
      </header>
      {children}
    </section>
  );
}
