/**
 * 我的一天 · 统一收件箱工作台
 * route: /inbox
 *
 * V10 车道 G1：从 10 个平级区块（滚 2.9 屏）收敛到 5 块。
 * 它是 guided 与 pro 两轨的默认落地页，本该最聚焦，改造前却有三个平行入口区
 * （新手引导、逐税种申报到期卡、其他模块待办卡片墙）和四张主待办卡抢注意力。
 *
 * 现在的结构，从上到下就是「今天什么状况 → 要处理什么 → 顺手能做完什么 → 其余」：
 * 1) hero；2) 今天的状况（统计 + 紧急 + 到期汇总 + 新手引导）；
 * 3) 今天要处理的（任务 / 风险 / 审批三张摘要卡并排）；
 * 4) AI 草稿工作台（唯一能就地做完的一块）；5) 其他模块待办（默认收起）。
 */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Space, Spin } from "antd";
import { ReloadOutlined, CalendarOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import type { RiskFinding, WorkflowRun } from "@finance-taxation/domain-model";
import { PageHeader } from "../components/ui/PageHeader";
import {
  getInbox, getSetupStatus, getTaxDeadlines, listRiskFindings, listTasks, listWorkflowRuns,
  type InboxItem, type SetupItem, type TaxDeadline,
} from "../lib/api";
import { usePeriod } from "../lib/period-context";
import { buildOnboardingChecklist } from "../lib/onboarding-checklist";
import { useWorkspaceMode } from "../lib/workspace-mode";
import { InboxAiDraftsCard } from "./inbox/InboxAiDraftsCard";
import { InboxMoreTodos } from "./inbox/InboxMoreTodos";
import { InboxTodayBar } from "./inbox/InboxTodayBar";
import { InboxTriageBoard } from "./inbox/InboxTriageBoard";
import { isInboxAllClear, summarizeInboxFocus, summarizeTaxDeadlines } from "./inbox/inbox-focus";
import type { TaskWithOverdue } from "./inbox/inbox-helpers";

export function MyDayPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [setup, setSetup] = useState<{ items: SetupItem[]; doneCount: number; total: number; ready: boolean } | null>(null);
  const [deadlines, setDeadlines] = useState<TaxDeadline[]>([]);
  const [tasks, setTasks] = useState<TaskWithOverdue[]>([]);
  const [riskFindings, setRiskFindings] = useState<RiskFinding[]>([]);
  const [approvalRuns, setApprovalRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const { period } = usePeriod();
  const { mode } = useWorkspaceMode();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, setupData, dl, taskData, riskData, runData] = await Promise.all([
        getInbox(),
        getSetupStatus().catch(() => null),
        getTaxDeadlines(period).catch(() => null),
        listTasks().catch(() => null),
        listRiskFindings().catch(() => null),
        listWorkflowRuns({ state: "awaiting_authorization" }).catch(() => null),
      ]);
      setItems(data.items);
      setTotalPending(data.totalPending);
      setSetup(setupData);
      setDeadlines(dl?.deadlines ?? []);
      setTasks(taskData?.items ?? []);
      setRiskFindings(riskData?.items ?? []);
      setApprovalRuns(runData?.items ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  // 快速开始 checklist：按工作区模式分内容（pro=后端 setup 清单，guided=白话三件事）
  const checklist = buildOnboardingChecklist(setup, mode);

  const focus = useMemo(
    () => summarizeInboxFocus({
      items,
      totalPending,
      tasks,
      findings: riskFindings,
      approvalCount: approvalRuns.length,
    }),
    [approvalRuns.length, items, riskFindings, tasks, totalPending]
  );
  const deadlineSummary = useMemo(() => summarizeTaxDeadlines(deadlines), [deadlines]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader
          title="我的一天"
          subtitle="今天要处理的事都在这里：待办任务、风险预警、审批请求、AI 草稿。先看上面的状况，再逐块处理。"
          actions={(
            <Space>
              <Button icon={<CalendarOutlined />} onClick={() => navigate("/close")}>月度结账</Button>
              <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            </Space>
          )}
        />
      </section>

      <InboxTodayBar
        summary={focus}
        deadlines={deadlineSummary}
        period={period}
        checklist={checklist}
        mode={mode}
        allClear={!loading && isInboxAllClear(focus)}
      />

      {loading ? (
        <div role="status" aria-live="polite" aria-label="收件箱加载中" style={{ padding: 40, textAlign: "center" }}>
          <Spin />
        </div>
      ) : (
        <InboxTriageBoard
          tasks={tasks}
          findings={riskFindings}
          runs={approvalRuns}
          loading={loading}
        />
      )}

      <InboxAiDraftsCard />

      <InboxMoreTodos items={focus.otherItems} />
    </div>
  );
}
