/**
 * 审计日志（V10 车道：按任务重组）。
 *
 * 改造前首屏 6 个平级区块：页头卡（含「AI 审计勾稽」按钮）、「校验完整性」一行、
 * 全站 10 环节导航条、四项过滤条、日志表、右侧详情面板。这 6 块混了两件性质完全
 * 不同的事——查日志（筛 → 列 → 详）和验日志本身可不可信（按一下出结论），后者被
 * 挤成页头里的一个按钮和一个小标签。
 *
 * 改造后：两件事（见 audit/audit-tasks.ts），TaskFocusShell 一次只渲染一件事的
 * 工作区；骨架只剩页头 + 工作区两块。过滤条件仍写在 URL 上，切走再切回不丢。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { message as antdMessage } from "antd";
import type { AuditLog } from "@finance-taxation/domain-model";
import {
  type AuditChainVerification,
  type AuditReviewResult,
  auditReview,
  describePageLoadError,
  listAuditLogs,
  verifyAuditChain
} from "../lib/api";
import { TaskFocusShell } from "../components/ui/TaskFocusShell";
import { normalizeDrilldownState, resolveAuditContextFromState } from "./drilldown";
import { resolveInitialAuditExpansion } from "./risk-scope";
import { AuditIntegrityPanel } from "./audit/AuditIntegrityPanel";
import { AuditPageShell } from "./audit/AuditPageShell";
import { AuditTrailWorkspace } from "./audit/AuditTrailWorkspace";
import { AuditWorkbenchHeader } from "./audit/AuditWorkbenchHeader";
import { readAuditUrlState, writeAuditUrlState } from "./audit/audit-url-state";
import { AUDIT_TASK_KEYS, buildAuditTasks, readAuditTask, writeAuditTask, isAuditTaskKey } from "./audit/audit-tasks";

const LIMIT = 50;

export function AuditPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => readAuditUrlState(searchParams), [searchParams]);
  const navState = normalizeDrilldownState(location.state);
  const navAuditContext = resolveAuditContextFromState(navState);
  const navResourceType = navAuditContext?.resourceType ?? "";
  const navResourceId = navAuditContext?.resourceId ?? "";
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("正在加载审计日志...");
  const [resourceType, setResourceType] = useState(urlState.resourceType || navResourceType);
  const [resourceId, setResourceId] = useState(urlState.resourceId || navResourceId);
  const [fromDate, setFromDate] = useState(urlState.from);
  const [toDate, setToDate] = useState(urlState.to);
  const [offset, setOffset] = useState(urlState.offset);
  const [expandedId, setExpandedId] = useState<string | null>(urlState.expandedId || null);
  const [selectedLogId, setSelectedLogId] = useState(urlState.logId);
  const [chainVerifying, setChainVerifying] = useState(false);
  const [chainResult, setChainResult] = useState<AuditChainVerification | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<AuditReviewResult | null>(null);

  const activeTask = readAuditTask(searchParams);
  // 校验出断裂才挂角标：断裂是事故，「还没验」不是待办量。
  const tasks = useMemo(
    () => buildAuditTasks({ chainBroken: chainResult !== null && !chainResult.valid }),
    [chainResult]
  );

  function selectTask(task: string) {
    if (!isAuditTaskKey(task)) return;
    setSearchParams(writeAuditTask(searchParams, task));
  }

  useEffect(() => {
    void load(urlState.offset, resourceType, resourceId, fromDate, toDate, urlState.logId, urlState.expandedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = writeAuditUrlState({
      resourceType,
      resourceId,
      from: fromDate,
      to: toDate,
      offset,
      logId: selectedLogId,
      expandedId: expandedId ?? ""
    });
    // 任务不属于检索状态，writeAuditUrlState 不认识它；这里补回去，
    // 否则每次过滤条件一变就会把用户从「验完整性」踢回「查日志」。
    const currentTask = searchParams.get("task");
    if (currentTask) {
      next.set("task", currentTask);
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [expandedId, fromDate, offset, resourceId, resourceType, searchParams, selectedLogId, setSearchParams, toDate]);

  async function load(
    off: number,
    rt: string,
    rid: string,
    fd: string,
    td: string,
    logId?: string,
    explicitExpandedId?: string
  ) {
    setLoading(true);
    try {
      const res = await listAuditLogs({
        resourceType: rt || undefined,
        resourceId: rid || undefined,
        from: fd || undefined,
        to: td ? td + "T23:59:59Z" : undefined,
        limit: LIMIT,
        offset: off
      });
      setLogs(res.items);
      const nextExpandedId = explicitExpandedId
        || logId
        || resolveInitialAuditExpansion(
          res.items.map((item) => ({ id: item.id, resourceId: item.resourceId })),
          rid || navResourceId || null
        );
      setExpandedId(nextExpandedId);
      setSelectedLogId(logId || nextExpandedId || "");
      setTotal(res.total);
      setOffset(off);
      setMessage(`${rid ? `当前对象 ${rid}：` : ""}共 ${res.total} 条审计记录`);
    } catch (error) {
      setMessage(describePageLoadError(error));
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    void load(0, resourceType, resourceId, fromDate, toDate, selectedLogId, expandedId ?? "");
  }

  async function handleVerifyChain() {
    setChainVerifying(true);
    try {
      setChainResult(await verifyAuditChain());
    } catch (error) {
      antdMessage.error(describePageLoadError(error));
    } finally {
      setChainVerifying(false);
    }
  }

  async function handleRunReview() {
    setReviewLoading(true);
    try {
      setReviewResult(await auditReview());
    } catch (error) {
      antdMessage.error(describePageLoadError(error));
    } finally {
      setReviewLoading(false);
    }
  }

  function renderWorkspace() {
    if (activeTask === AUDIT_TASK_KEYS.integrity) {
      return (
        <AuditIntegrityPanel
          chainVerifying={chainVerifying}
          chainResult={chainResult}
          onVerifyChain={() => void handleVerifyChain()}
          reviewLoading={reviewLoading}
          reviewResult={reviewResult}
          onRunReview={() => void handleRunReview()}
        />
      );
    }

    return (
      <AuditTrailWorkspace
        logs={logs}
        loading={loading}
        total={total}
        limit={LIMIT}
        offset={offset}
        navResourceId={navResourceId}
        expandedId={expandedId}
        selectedLogId={selectedLogId}
        resourceType={resourceType}
        resourceId={resourceId}
        fromDate={fromDate}
        toDate={toDate}
        onResourceTypeChange={setResourceType}
        onResourceIdChange={setResourceId}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onSearch={handleSearch}
        onReset={() => {
          setResourceType("");
          setResourceId("");
          setFromDate("");
          setToDate("");
          setSelectedLogId("");
          setExpandedId(null);
          void load(0, "", "", "", "", "", "");
        }}
        onToggleExpanded={(logId) => setExpandedId((current) => (current === logId ? null : logId))}
        onSelectLog={(logId) => setSelectedLogId(logId)}
        onNavigate={(path, state) => navigate(path, { state })}
        onPrevPage={() =>
          void load(Math.max(0, offset - LIMIT), resourceType, resourceId, fromDate, toDate, selectedLogId, expandedId ?? "")
        }
        onNextPage={() =>
          void load(offset + LIMIT, resourceType, resourceId, fromDate, toDate, selectedLogId, expandedId ?? "")
        }
      />
    );
  }

  return (
    <AuditPageShell header={<AuditWorkbenchHeader total={total} message={message} navState={navState} />}>
      <TaskFocusShell
        tasks={tasks}
        activeKey={activeTask}
        onSelectTask={selectTask}
        switcherLabel="审计页能办的事"
      >
        {renderWorkspace()}
      </TaskFocusShell>
    </AuditPageShell>
  );
}
