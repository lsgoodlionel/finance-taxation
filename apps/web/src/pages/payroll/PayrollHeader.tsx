import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";

type PayrollHeaderProps = {
  message: string;
  actions: React.ReactNode;
};

export function PayrollHeader({ message, actions }: PayrollHeaderProps) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <PageHeader
        title="工资管理"
        subtitle="工资页承接员工台账、工资运行、税务复核、凭证建议与风险联动，适合作为工资闭环工作台。"
        actions={actions}
      />
      <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
    </div>
  );
}
