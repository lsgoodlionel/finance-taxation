import React, { type ReactNode } from "react";

/**
 * 研发辅助账页的外壳只剩「页头 + 当前这件事」两段。
 *
 * 改造前这一页在根网格下直接摊了 8 个平级区块（页头、全站导航条、KPI 卡组、
 * 空态提示、项目列表卡、项目详情卡、两个 Modal）。现在任务切换、工作区与上下文
 * 都交给 TaskFocusShell，外壳不再替页面决定这些块怎么排。
 *
 * Modal（新建项目 / 归集向导）仍由页面自己挂在外壳之外——它们是浮层，
 * 不占首屏，也不属于「当前这件事」的版面。
 */
type RndShellProps = {
  header: ReactNode;
  /** 当前这件事：由页面传入 TaskFocusShell。 */
  children: ReactNode;
};

export function RndShell({ header, children }: RndShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      <div className="v3-workbench-card">
        <section className="v3-section-shell">{children}</section>
      </div>
    </div>
  );
}
