import React, { type ReactNode } from "react";

type ContractsListPanelProps = {
  children: ReactNode;
};

export function ContractsListPanel({ children }: ContractsListPanelProps) {
  return (
    <section className="v3-section-shell" data-tone="muted" style={{ minWidth: 0 }}>
      <div className="v3-section-heading">
        <span className="v3-section-kicker">合同台账</span>
        <h2 className="v3-section-title">先定位合同，再进入右侧工作台推进履约闭环。</h2>
        <p className="v3-section-description">这里优先承接筛选后的合同列表，便于按主体、状态和履约结果分批处理。</p>
      </div>
      {children}
    </section>
  );
}
