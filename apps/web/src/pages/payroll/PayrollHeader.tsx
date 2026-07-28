import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";

/**
 * 工资页页头。
 *
 * V10 车道 B1 之后它只负责「这是哪一页 + 你现在在办哪件事」：
 * 原来挂在这里的页内 Tab 条（员工管理 / 工资计算 / 参数设置）已由
 * TaskFocusShell 的任务切换器取代；状态文案下沉到各任务自己的工作区，
 * 因为「已加载 12 名员工」和「已切换到工资期间 2026-05」本来就不是同一句话。
 */
type PayrollHeaderProps = {
  /** 当前这件事的名字，与任务切换器上的选中项一致。 */
  activeTaskLabel: string;
};

export function PayrollHeader({ activeTaskLabel }: PayrollHeaderProps) {
  return (
    <PageHeader
      title="工资"
      subtitle="算工资、发工资、社保公积金关账，以及员工档案与工资参数的维护，都在这一页按事切换。"
      actions={(
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>正在办</span>
          <strong style={{ fontSize: "14px", color: "#1e2a37" }}>{activeTaskLabel}</strong>
        </div>
      )}
    />
  );
}
