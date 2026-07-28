import React, { type ReactNode } from "react";

type DocumentsShellProps = {
  summary: ReactNode;
  list: ReactNode;
  detail: ReactNode;
};

/**
 * 单据这件事的内容主体：概览一块、列表与详情一块。
 *
 * V10：页头（PageHeader）与全站业务链路条已上交 /bills 容器。
 * 这个组件只在 /bills?tab=documents 下渲染（/documents 已 301 到那里），
 * 自带一份标题和链路条只会和容器那份重复，用户会看到两个标题两条链路条。
 */
export function DocumentsShell({ summary, list, detail }: DocumentsShellProps) {
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <section className="v3-section-shell" data-tone="accent">{summary}</section>
      <div className="v3-result-grid v3-result-grid--wide">
        <div className="v3-workbench-card">
          <section className="v3-section-shell">{list}</section>
        </div>
        <div className="v3-workbench-card">
          <section className="v3-section-shell">{detail}</section>
        </div>
      </div>
    </div>
  );
}
