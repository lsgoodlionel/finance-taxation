/**
 * /knowledge 的页面骨架。
 *
 * 改造前这里排着 7 个平级槽位（页头 / 概览 / 筛选 / 解析面板 / 表单 / 列表 / 说明），
 * 骨架本身就在鼓励「把这一页能干的事全摊开」。现在只剩两块：页头，以及一个
 * 由 TaskFocusShell 填充的任务工作区——概览、筛选、表单、解析面板、说明都归到
 * 「当前这件事」里面去了（见 knowledge-tasks.ts）。
 */
import React, { type ReactNode } from "react";

type KnowledgeShellProps = {
  header: ReactNode;
  /** 当前任务的工作区（由 TaskFocusShell 渲染）。 */
  children: ReactNode;
};

export function KnowledgeShell({ header, children }: KnowledgeShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <header className="v3-hero-shell">{header}</header>
      {children}
    </div>
  );
}
