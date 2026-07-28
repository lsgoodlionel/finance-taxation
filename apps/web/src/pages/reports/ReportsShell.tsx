import React, { type ReactNode } from "react";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";

type ReportsShellProps = {
  header: ReactNode;
  children: ReactNode;
};

/**
 * 报表页壳层：页头（含期间上下文）+ 业务链路条 + 当前这件事的工作区。
 *
 * 改造前这里是「页头 + 链路条 + 侧栏(四张卡) + 工作台」的双栏结构，侧栏把
 * 选期间、选报表、做对比、打包导出四件事并排常驻。现在侧栏整体下线：
 * 期间进页头，选报表变成任务切换器，对比与导出各自归位。
 */
export function ReportsShell({ header, children }: ReportsShellProps) {
  return (
    <div className="v3-result-shell">
      {header}
      <FinanceFlowBar current="reports" />
      {children}
    </div>
  );
}
