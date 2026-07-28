/**
 * /risk 的页面骨架。
 *
 * 改造前首屏 10 个平级区块，其中「票税一致性比对」和「异常扫描」是两个各自带
 * 属期选择器和结果表的独立扫描任务，跟「关掉手上这条风险」没有关系。现在骨架
 * 只留三块：页头、全站流程导航条、以及一个任务工作区（TaskFocusShell 负责
 * 一次只渲染一件事），三件事之间靠顶部切换器切换、选中项写在 ?task= 里。
 * 页头用语义化的 <header> 收拢——guided 兜底横幅是「关于这一页的说明」，
 * 和标题属于同一块，不该另起一条页面级横幅。
 */
import React, { type ReactNode } from "react";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";

type RiskPageShellProps = {
  header: ReactNode;
  /** 当前任务的工作区（由 TaskFocusShell 渲染）。 */
  children: ReactNode;
};

export function RiskPageShell({ header, children }: RiskPageShellProps) {
  return (
    <div className="v3-result-shell">
      <header>{header}</header>
      <FinanceFlowBar current="risk" />
      {children}
    </div>
  );
}
