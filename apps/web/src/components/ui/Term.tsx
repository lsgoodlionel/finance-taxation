import React, { type CSSProperties, type ReactNode } from "react";
import { Tooltip } from "antd";
import { getTermEntry } from "../../lib/terminology";
import { useWorkspaceMode } from "../../lib/workspace-mode";

/**
 * V7 J3 术语组件：为财税黑话提供随处可用的 hover 释义。
 * - pro 模式：渲染专业原词（或包裹的子内容）+ Tooltip 一句话解释
 * - guided 模式：渲染白话短语（原词括注小字）+ Tooltip 解释（含详细说明）
 * - 未命中词条：原样渲染子内容，不报错
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

export function Term({ k, children }: TermProps) {
  const { mode } = useWorkspaceMode();
  const entry = getTermEntry(k);

  if (!entry) {
    return <>{children ?? null}</>;
  }

  if (mode === "guided") {
    const tooltip = entry.detail ? (
      <span>
        {entry.brief}
        <br />
        {entry.detail}
      </span>
    ) : (
      entry.brief
    );
    return (
      <Tooltip title={tooltip}>
        <span style={TERM_STYLE}>
          {entry.plain}
          <span style={PLAIN_ANNOTATION_STYLE}>（{entry.term}）</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={entry.brief}>
      <span style={TERM_STYLE}>{children ?? entry.term}</span>
    </Tooltip>
  );
}
