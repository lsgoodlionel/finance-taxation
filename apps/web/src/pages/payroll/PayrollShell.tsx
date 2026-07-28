import React, { type ReactNode } from "react";

/**
 * V10 车道 B1：工资页的外壳只剩「页头 + 当前这件事」两段。
 *
 * 改造前 content 里还得自己排一遍页内 Tab 条、状态横幅和运行态面板；
 * 现在任务切换由 TaskFocusShell 负责，外壳不替页面决定块怎么排。
 */
type PayrollShellProps = {
  header: ReactNode;
  /** 当前这件事：由 PayrollDomainPage 传入 TaskFocusShell。 */
  content: ReactNode;
};

export function PayrollShell({ header, content }: PayrollShellProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      {content}
    </div>
  );
}
