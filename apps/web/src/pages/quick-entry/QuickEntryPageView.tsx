/**
 * 「记一笔」纯展示层：接收控制器渲染 3 步向导。
 * 与容器（QuickEntryPage + useQuickEntry）分离，便于在 node 环境独立 SSR 测试。
 */
import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { StepWizard } from "../../components/ui/StepWizard";
import { QUICK_ENTRY_STEPS } from "./wizard-state";
import { StepConfirm } from "./StepConfirm";
import { StepDescribe } from "./StepDescribe";
import { StepDone } from "./StepDone";
import type { QuickEntryController } from "./types";

const PAGE_STYLE: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "0 12px 32px",
  display: "flex",
  flexDirection: "column",
  gap: 16
};

export function QuickEntryPageView({ controller }: { controller: QuickEntryController }) {
  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title="记一笔"
        subtitle="拍张票据或说一句话，3 步记下一笔账，剩下的交给财务和 AI。"
      />
      <StepWizard steps={[...QUICK_ENTRY_STEPS]} currentKey={controller.step}>
        {controller.step === "describe" ? <StepDescribe controller={controller} /> : null}
        {controller.step === "confirm" ? <StepConfirm controller={controller} /> : null}
        {controller.step === "done" ? <StepDone controller={controller} /> : null}
      </StepWizard>
    </div>
  );
}
