import React, { type ReactNode } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { HelpTriggerButton } from "../../components/ui/HelpPanel";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type ReportsHeaderProps = {
  activeViewLabel: string;
  /** 期间上下文控件：四件事共用，因此挂在页头而不是各自的工作区里。 */
  periodControl: ReactNode;
  onOpenHelp?: () => void;
};

/**
 * 「去税务申报」「前往 PDF 导出中心」两个跳转按钮已从这里去掉：
 * 页面下方的业务链路条同样提供「税务申报」与「归档留档」两站的跳转，
 * 同一屏留两套导航只是噪音，能力没有丢失。
 */
export function ReportsHeader({ activeViewLabel, periodControl, onOpenHelp }: ReportsHeaderProps) {
  return (
    <PageHeader
      title="财务报表中心"
      subtitle={buildResultPageSubtitle("财务报表")}
      actions={(
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {periodControl}
          <div style={{ display: "grid", gap: "4px", textAlign: "right" }}>
            <span style={{ fontSize: "12px", color: "#6c7a89" }}>当前视图</span>
            <strong style={{ fontSize: "14px", color: "#1e2a37" }}>{activeViewLabel}</strong>
          </div>
          {onOpenHelp ? <HelpTriggerButton onClick={onOpenHelp} label="查看财务报表中心操作说明" /> : null}
        </div>
      )}
    />
  );
}
