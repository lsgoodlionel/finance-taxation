import React from "react";
import { ResultBanner } from "../../components/ui/ResultBanner";
import { AssistantStatusPanel } from "./AssistantStatusPanel";

interface AssistantStatusBannersProps {
  isOpMode: boolean;
  isBoss: boolean;
  suggestedEventsCount: number;
  hasBusinessEvent: boolean;
  nextRouteLabel?: string;
}

export function AssistantStatusBanners({
  isOpMode,
  isBoss,
  suggestedEventsCount,
  hasBusinessEvent,
  nextRouteLabel
}: AssistantStatusBannersProps) {
  return (
    <AssistantStatusPanel>
      {!isOpMode && <ResultBanner tone="warning" message="决策视角：基于实时财务快照（资金/收支/税负/风险）回答，每次提问自动刷新。" />}
      {isOpMode && isBoss && <ResultBanner tone="info" message="操作视角：可处理报销、入账等实际财务操作，AI 将给出账务处理建议并自动生成凭证草稿。" />}
      {isOpMode && suggestedEventsCount > 0 && (
        <ResultBanner
          tone="success"
          message={`下一步：确认创建 ${suggestedEventsCount} 条事项，然后进入任务、单据、凭证与税务页面继续处理。`}
        />
      )}
      {isOpMode && !suggestedEventsCount && hasBusinessEvent && (
        <ResultBanner
          tone="info"
          message={`当前事项已进入流程跟踪。建议下一步前往 ${nextRouteLabel ?? "对应业务页"} 继续处理。`}
        />
      )}
    </AssistantStatusPanel>
  );
}
