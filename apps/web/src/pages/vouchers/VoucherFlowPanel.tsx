import React from "react";
import { Button } from "antd";
import { ObjectFlowBar } from "../../components/ui/ObjectFlowBar";
import { Term } from "../../components/ui/Term";
import type { ObjectFlow } from "../../lib/object-flow";
import type { VoucherNextStep } from "./voucher-flow";

/**
 * 「这张凭证办到哪了 + 下一步点这里」。
 *
 * 改造前这两件事在页面上是分开的：流程位置由一块喂假数据的阶段流程图表示，
 * 而「下一步该做什么」只绑在快捷键 a 上，界面上没有任何可见入口。
 * 现在流程条讲进度，紧跟着的按钮就是那一步的动作，两者共用同一份判定
 * （见 voucher-flow.ts）。
 */

interface VoucherFlowPanelProps {
  flow: ObjectFlow | null;
  title: string;
  nextStep: VoucherNextStep | null;
  /** 这张凭证归属的会计期间（YYYY-MM），拿不到时不显示报表那句话。 */
  reportPeriod: string | null;
  busy: boolean;
  onRunNextStep: () => void;
  onOpenReports: () => void;
}

const HINT_STYLE: React.CSSProperties = {
  margin: 0,
  padding: "12px 16px",
  borderRadius: 12,
  background: "rgba(20,40,60,0.04)",
  border: "1px solid rgba(20,40,60,0.08)",
  color: "#5c6b7a",
  fontSize: 13,
  lineHeight: 1.7
};

const ACTION_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center"
};

const NOTE_STYLE: React.CSSProperties = { fontSize: 12, color: "#6c7a89", lineHeight: 1.7 };

export function VoucherFlowPanel({
  flow,
  title,
  nextStep,
  reportPeriod,
  busy,
  onRunNextStep,
  onOpenReports
}: VoucherFlowPanelProps) {
  if (!flow || !nextStep) {
    return (
      <p style={HINT_STYLE}>
        还没有选中<Term k="voucher">凭证</Term>。在下面的列表里点一张，这里就会显示它办到哪一步、下一步该谁做。
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <ObjectFlowBar flow={flow} title={title} />
      <div style={ACTION_ROW_STYLE}>
        <Button type="primary" disabled={nextStep.done || busy} loading={busy} onClick={onRunNextStep}>
          下一步：{nextStep.label}
        </Button>
        <Button size="small" onClick={onOpenReports}>
          去看这一期的报表
        </Button>
        <span style={NOTE_STYLE}>
          {reportPeriod ? `本笔归在 ${reportPeriod} 期间：` : "本笔按会计期间归集："}
          <Term k="posting">过账</Term>后随该期间一起进报表，报表按期间出，不与单张
          <Term k="voucher">凭证</Term>一一对应，所以这里只能按期间过去看。
        </span>
      </div>
    </div>
  );
}
