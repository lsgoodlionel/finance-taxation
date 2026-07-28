import React, { type ReactNode } from "react";

/**
 * 税务中心的外壳：只保留页头、反馈条和「当前这件事」的工作区三层。
 *
 * V10 改造前这里还固定摆着 FinanceFlowBar（全站 10 个环节的导航条）。它被移除的
 * 理由不是「不好看」，而是它和工作区里的 ObjectFlowBar 是两种流程、外观又相近，
 * 同屏必混：
 * - FinanceFlowBar 讲「系统有哪些环节」，done/current 由当前在哪个页面算出来，
 *   与业务数据无关，点击是跳页面——这是导航，左侧主菜单已经在做这件事；
 * - ObjectFlowBar 讲「我手上这个申报批次卡在哪」，每一步来自批次真实字段。
 * 用户抱怨的正是「不知道从何下手」，页面上该留下的是后者。
 *
 * 原来的 summary / taxItems / batches / materials 四个插槽一并撤掉：那种「一页把
 * 所有区块摆齐」的结构正是要改掉的东西，现在由 TaskFocusShell 一次只渲染一件事。
 */
type TaxShellProps = {
  header: ReactNode;
  guidance?: ReactNode;
  children: ReactNode;
};

export function TaxShell({ header, guidance, children }: TaxShellProps) {
  return (
    <div className="v3-result-shell">
      {header}
      {guidance}
      {children}
    </div>
  );
}
