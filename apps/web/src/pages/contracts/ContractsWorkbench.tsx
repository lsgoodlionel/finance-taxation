import React, { type ReactNode } from "react";

type ContractsWorkbenchProps = {
  children: ReactNode;
};

export function ContractsWorkbench({ children }: ContractsWorkbenchProps) {
  return (
    <section className="v3-section-shell" data-tone="accent" style={{ minWidth: 0 }}>
      <div className="v3-section-heading">
        <span className="v3-section-kicker">合同工作台</span>
        <h2 className="v3-section-title">工作台先给出流程摘要，再处理动作、事项和下游对象。</h2>
        <p className="v3-section-description">这里是合同闭环主视图。优先看当前阶段、下一步动作和对象联动，再决定是否补开票、回款、收入确认或归档。</p>
      </div>
      {children}
    </section>
  );
}
