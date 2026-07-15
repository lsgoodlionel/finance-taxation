/**
 * V7 K1 老板工作台 /home（guided 默认首页）· 容器层
 * 负责数据装配与审批动作；呈现交给 HomePageView。
 * 路由接线由主控完成，此组件保证可独立渲染。
 */
import React, { useCallback, useState } from "react";
import { message } from "antd";
import { approveCloseDraft, rejectCloseDraft } from "../../lib/api";
import { buildPendingCards, takeTopPending } from "./home-helpers";
import { useHomeData } from "./useHomeData";
import { HomePageView } from "./HomePageView";
import type { PendingActing } from "./HomePendingSection";
import { GuidedQuickStartCard } from "../../components/GuidedQuickStartCard";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function HomePage() {
  const { drafts, inboxItems, dashboard, forecast, loading, error, reload, reloadDrafts } = useHomeData();
  const [acting, setActing] = useState<PendingActing>(null);

  const handleApprove = useCallback(async (draftId: string) => {
    setActing({ draftId, action: "approve" });
    try {
      await approveCloseDraft(draftId);
      void message.success("已批准，财务复核后就会正式入账");
      await reloadDrafts();
    } catch (err) {
      void message.error(getErrorMessage(err, "批准没有成功，请稍后再试"));
    } finally {
      setActing(null);
    }
  }, [reloadDrafts]);

  const handleReject = useCallback(async (draftId: string) => {
    setActing({ draftId, action: "reject" });
    try {
      await rejectCloseDraft(draftId);
      void message.success("已驳回，这笔不会入账");
      await reloadDrafts();
    } catch (err) {
      void message.error(getErrorMessage(err, "驳回没有成功，请稍后再试"));
    } finally {
      setActing(null);
    }
  }, [reloadDrafts]);

  const { top, remaining } = takeTopPending(buildPendingCards(drafts, inboxItems));

  return (
    <HomePageView
      loading={loading}
      error={error}
      pendingCards={top}
      pendingRemaining={remaining}
      acting={acting}
      dashboard={dashboard}
      forecast={forecast}
      onApprove={(id) => void handleApprove(id)}
      onReject={(id) => void handleReject(id)}
      onRetry={() => void reload()}
      quickStartSlot={<GuidedQuickStartCard />}
    />
  );
}
