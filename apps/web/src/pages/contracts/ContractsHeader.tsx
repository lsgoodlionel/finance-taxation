import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";

type ContractsHeaderProps = {
  message: string;
  onToggleCreate(): void;
};

export function ContractsHeader({ message, onToggleCreate }: ContractsHeaderProps) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <PageHeader
        title="合同管理"
        subtitle="合同页承接合同台账、履约事项、税务与凭证联动，适合作为合同闭环工作台。"
        actions={(
          <button
            onClick={onToggleCreate}
            style={{
              background: "#1e2a37", color: "#fff", border: "none",
              borderRadius: "8px", padding: "10px 20px", cursor: "pointer", fontSize: "14px"
            }}
          >
            + 新建合同
          </button>
        )}
      />
      <div className="v3-banner" data-tone="info" style={{ fontSize: "13px" }}>
        {message}
      </div>
    </div>
  );
}
