import React, { type CSSProperties, type ReactNode } from "react";
import { Tooltip } from "antd";
import { getTermEntry } from "../../lib/terminology";
import { useWorkspaceMode } from "../../lib/workspace-mode";

/**
 * V7 J3 术语组件：为财税黑话提供随处可用的释义。
 * - pro 模式：渲染专业原词（或包裹的子内容）+ Tooltip 一句话解释
 * - guided 模式：渲染白话短语（原词括注小字）+ Tooltip 解释（含详细说明）
 * - 未命中词条：原样渲染子内容，不报错
 *
 * V8 D1 可达性：术语不再是纯 hover 交互。
 * - tabIndex={0} + role="button"：键盘可聚焦，读屏可识别为可操作元素
 * - trigger 含 focus / click：键盘聚焦即出释义，移动端（PWA 审批场景）点按即出释义
 * - aria-label 直接携带完整释义：即使 Tooltip 浮层未渲染，读屏用户也能拿到解释
 *
 * 用法：<Term k="posting">过账</Term> 或 <Term k="posting" />
 */

interface TermProps {
  /** 术语字典 key，见 lib/terminology.ts */
  k: string;
  children?: ReactNode;
}

const TERM_STYLE: CSSProperties = {
  textDecorationLine: "underline",
  textDecorationStyle: "dashed",
  textDecorationColor: "currentColor",
  textDecorationThickness: "1px",
  textUnderlineOffset: "3px",
  cursor: "help"
};

const PLAIN_ANNOTATION_STYLE: CSSProperties = {
  fontSize: "0.82em",
  opacity: 0.72,
  marginLeft: 1
};

/** hover 之外补齐 focus（键盘）与 click（触屏），保证释义在三种输入方式下都可达。 */
const TERM_TRIGGERS = ["hover", "focus", "click"] as const;

export function Term({ k, children }: TermProps) {
  const { mode } = useWorkspaceMode();
  const entry = getTermEntry(k);

  if (!entry) {
    return <>{children ?? null}</>;
  }

  const isGuided = mode === "guided";

  const tooltip =
    isGuided && entry.detail ? (
      <span>
        {entry.brief}
        <br />
        {entry.detail}
      </span>
    ) : (
      entry.brief
    );

  const ariaLabel = isGuided
    ? `${entry.plain}（${entry.term}）：${entry.brief}`
    : `${entry.term}：${entry.brief}`;

  return (
    <Tooltip title={tooltip} trigger={[...TERM_TRIGGERS]}>
      <span style={TERM_STYLE} tabIndex={0} role="button" aria-label={ariaLabel}>
        {isGuided ? (
          <>
            {entry.plain}
            <span style={PLAIN_ANNOTATION_STYLE}>（{entry.term}）</span>
          </>
        ) : (
          children ?? entry.term
        )}
      </span>
    </Tooltip>
  );
}
