import React, { type ReactNode } from "react";

type ContractsWorkbenchProps = {
  children: ReactNode;
};

export function ContractsWorkbench({ children }: ContractsWorkbenchProps) {
  return (
    <section style={{ display: "grid", gap: "12px", minWidth: 0 }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "12px", color: "#6c7a89" }}>合同工作台</span>
        <strong style={{ fontSize: "16px", color: "#1e2a37" }}>优先看流程摘要，再推进履约动作、事项联动和下游对象。</strong>
      </div>
      {children}
    </section>
  );
}
