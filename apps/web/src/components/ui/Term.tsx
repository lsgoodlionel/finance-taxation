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
 * V9 非交互变体（interactive={false}）：术语本身已经处在可聚焦容器内时使用
 * （典型场景：antd Tabs 的 label，容器是 role="tab" 的可聚焦元素）。
 * - 不加 tabIndex / role="button"，避免可聚焦元素嵌套（nested interactive）
 * - 释义改走「视觉隐藏文本」：隐藏文本参与外层容器的无障碍名称计算
 *   （accessible name from content），读屏用户聚焦该 tab 时即可听到释义
 * - 之所以不用 title / aria-describedby：二者在「不可聚焦的 generic 元素」上
 *   都不会被主流读屏稳定播报，键盘用户更是完全够不到，等于没有释义通道
 *
 * 用法：<Term k="posting">过账</Term> 或 <Term k="posting" />
 */

interface TermProps {
  /** 术语字典 key，见 lib/terminology.ts */
  k: string;
  /**
   * 是否渲染成自带焦点的触发器，默认 true。
   * 当术语文案已经位于可聚焦容器内（Tabs 标签等）时传 false，改用非交互渲染，
   * 避免 nested interactive。
   */
  interactive?: boolean;
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

/**
 * 非交互变体的样式：保留虚线下划线这一「此处有释义」的视觉提示，
 * 但不改光标——外层容器（tab / 按钮）本身可点击，局部改成 help 反而误导。
 */
const STATIC_TERM_STYLE: CSSProperties = { ...TERM_STYLE, cursor: "inherit" };

/**
 * 视觉隐藏但仍进入无障碍树的文本。
 * 不能用 display:none / visibility:hidden——那样读屏也会跳过，释义就丢了。
 */
const SCREEN_READER_ONLY_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  border: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  clip: "rect(0, 0, 0, 0)",
  clipPath: "inset(50%)"
};

/** hover 之外补齐 focus（键盘）与 click（触屏），保证释义在三种输入方式下都可达。 */
const TERM_TRIGGERS = ["hover", "focus", "click"] as const;

/**
 * 非交互变体只留 hover：元素不可聚焦故 focus 永远不会触发；
 * click 会连带触发外层容器的行为（切换 tab），不适合当作查看释义的手势。
 */
const STATIC_TERM_TRIGGERS = ["hover"] as const;

export function Term({ k, interactive = true, children }: TermProps) {
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

  const label = isGuided ? (
    <>
      {entry.plain}
      <span style={PLAIN_ANNOTATION_STYLE}>（{entry.term}）</span>
    </>
  ) : (
    children ?? entry.term
  );

  if (!interactive) {
    return (
      <Tooltip title={tooltip} trigger={[...STATIC_TERM_TRIGGERS]}>
        <span style={STATIC_TERM_STYLE}>
          {label}
          <span style={SCREEN_READER_ONLY_STYLE}>：{entry.brief}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={tooltip} trigger={[...TERM_TRIGGERS]}>
      <span style={TERM_STYLE} tabIndex={0} role="button" aria-label={ariaLabel}>
        {label}
      </span>
    </Tooltip>
  );
}
