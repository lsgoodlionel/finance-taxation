import React, { type ReactNode } from "react";

type ContractsListPanelProps = {
  children: ReactNode;
};

export function ContractsListPanel({ children }: ContractsListPanelProps) {
  return (
    <section style={{ display: "grid", gap: "12px", minWidth: 0 }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "12px", color: "#6c7a89" }}>合同台账</span>
        <strong style={{ fontSize: "16px", color: "#1e2a37" }}>按合同主体、状态和履约结果查看当前合同闭环。</strong>
      </div>
      {children}
    </section>
  );
}
