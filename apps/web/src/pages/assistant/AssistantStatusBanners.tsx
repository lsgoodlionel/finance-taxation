import React, { type ReactNode } from "react";
import { ResultBanner } from "../../components/ui/ResultBanner";
import { AssistantStatusPanel } from "./AssistantStatusPanel";

interface AssistantStatusBannersProps {
  isOpMode: boolean;
  isBoss: boolean;
  suggestedEventsCount: number;
  hasBusinessEvent: boolean;
  /**
   * 下一个待办步骤的名字。
   *
   * 改造前这里收的是 `nextFlowNode.routes[0]`，也就是一个路由路径，然后被直接拼进
   * 面向用户的句子里：「建议下一步前往 /vouchers 继续处理」——把内部路径当人话
   * 显示给用户。现在改用节点自己的 title（如「凭证生成与审核」），它本来就是
   * 给人看的名字。
   */
  nextStepLabel?: string;
}

export function AssistantStatusBanners({
  isOpMode,
  isBoss,
  suggestedEventsCount,
  hasBusinessEvent,
  nextStepLabel
}: AssistantStatusBannersProps) {
  const banners: ReactNode[] = [];

  if (!isOpMode) {
    banners.push(
      <ResultBanner
        key="decision-mode"
        tone="warning"
        message="决策视角：基于实时财务快照（资金/收支/税负/风险）回答，每次提问自动刷新。"
      />
    );
  }

  if (isOpMode && isBoss) {
    banners.push(
      <ResultBanner
        key="operation-mode"
        tone="info"
        message="操作视角：可处理报销、入账等实际财务操作，AI 将给出账务处理建议并自动生成凭证草稿。"
      />
    );
  }

  if (isOpMode && suggestedEventsCount > 0) {
    banners.push(
      <ResultBanner
        key="suggested-events"
        tone="success"
        message={`下一步：确认创建 ${suggestedEventsCount} 条事项，然后进入任务、单据、凭证与税务页面继续处理。`}
      />
    );
  }

  if (isOpMode && suggestedEventsCount === 0 && hasBusinessEvent) {
    banners.push(
      <ResultBanner
        key="in-flow"
        tone="info"
        message={
          nextStepLabel
            ? `当前事项已进入流程跟踪，下一步要办的是「${nextStepLabel}」。`
            : "当前事项已进入流程跟踪，可在下方流程条上看它走到哪了。"
        }
      />
    );
  }

  /**
   * 一条横幅都没有时整块不渲染。
   *
   * 改造前无论有没有内容都会渲染一个带标题的「当前状态」区块——普通员工
   * （非老板、操作视角、还没提过问）首屏就会看到一个只有标题
   * 「先确认本轮上下文，再决定是继续提问还是生成事项」而下面空无一物的区块，
   * 白占一屏还让人以为漏加载了什么。
   */
  if (banners.length === 0) {
    return null;
  }

  return <AssistantStatusPanel>{banners}</AssistantStatusPanel>;
}
