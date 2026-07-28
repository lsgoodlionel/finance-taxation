import React, { type ReactNode } from "react";

/**
 * V10 车道 G2：总账页的外壳只剩「页头 + 当前这件事」两段。
 *
 * 改造前它有五个插槽（header / summary / sceneSelector / content / context），
 * 摊在首屏就是五块平级内容——场景摘要与右侧上下文讲同一批数字，场景卡又是
 * 第三处「这页能干什么」的罗列。现在场景切换与上下文都交给 TaskFocusShell
 * （切换器 + 工作区 + aside），外壳不再替页面决定这些块怎么排。
 */
type LedgerShellProps = {
  header: ReactNode;
  /** 当前这件事：由页面传入 TaskFocusShell。 */
  children: ReactNode;
};

export function LedgerShell({ header, children }: LedgerShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      <div className="v3-workbench-card">
        <section className="v3-section-shell">{children}</section>
      </div>
    </div>
  );
}
