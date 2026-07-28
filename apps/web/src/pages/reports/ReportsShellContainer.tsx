import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createReportSnapshot,
  getBalanceSheetReport,
  getCashFlowReport,
  getChairmanReportSummary,
  getPrintableReportHtml,
  getReportDiff,
  getProfitStatementReport,
  listReportSnapshots
} from "../../lib/api";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { resolveActiveTask } from "../../lib/task-focus";
import { useWorkspaceMode } from "../../lib/workspace-mode";
import { ReportsHeader } from "./ReportsHeader";
import { ReportsHelpPanel } from "./ReportsHelpPanel";
import { ReportsPeriodControl } from "./ReportsPeriodControl";
import { ReportsShell } from "./ReportsShell";
import { ReportsWorkbench } from "./ReportsWorkbench";
import { SnapshotComparePanel } from "./panels/SnapshotComparePanel";
import type { ReportsStatus, ReportsWorkbenchView } from "./report-types";
import { getWorkbenchViewLabel, pickLatestSnapshotId } from "./reports-helpers";
import {
  buildReportsTasks,
  isStatementView,
  resolveInitialReportsTask,
  resolveTaskByView,
  resolveViewByTask
} from "./reports-tasks";
import { readReportsUrlState, writeReportsUrlState } from "./reports-url-state";

/**
 * 财务报表中心容器。
 *
 * V10：一次只显示一件事。四件事（看结论 / 看三张报表 / 对比两期 / 对预算）由
 * TaskFocusShell 承载，只有当前这件事进 DOM；期间上下文收进页头；
 * 月结 / 审计 / 稽核资料包移交 /export-center（那边是同一接口的等价能力，
 * 还会登记导出历史与审计轨迹）。
 */
export function ReportsShellContainer() {
  const navigate = useNavigate();
  const { mode } = useWorkspaceMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => readReportsUrlState(searchParams), [searchParams]);

  const [periodType, setPeriodType] = useState<"month" | "quarter" | "year">("month");
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);
  const [quarter, setQuarter] = useState(2);
  const [balanceSheet, setBalanceSheet] = useState<Awaited<ReturnType<typeof getBalanceSheetReport>> | null>(null);
  const [profitStatement, setProfitStatement] = useState<Awaited<ReturnType<typeof getProfitStatementReport>> | null>(null);
  const [cashFlow, setCashFlow] = useState<Awaited<ReturnType<typeof getCashFlowReport>> | null>(null);
  const [snapshots, setSnapshots] = useState<Awaited<ReturnType<typeof listReportSnapshots>>["items"]>([]);
  const [fromSnapshotId, setFromSnapshotId] = useState("");
  const [toSnapshotId, setToSnapshotId] = useState("");
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof getReportDiff>> | null>(null);
  const [chairmanSummary, setChairmanSummary] = useState<Awaited<ReturnType<typeof getChairmanReportSummary>> | null>(null);
  const [activeView, setActiveView] = useState<ReportsWorkbenchView>(() =>
    resolveViewByTask(
      resolveActiveTask(buildReportsTasks(mode), urlState.task, resolveInitialReportsTask(mode)) ?? "",
      urlState.report || "balanceSheet"
    )
  );
  const [showHelp, setShowHelp] = useState(false);
  const [status, setStatus] = useState<ReportsStatus>({
    tone: "info",
    message: "正在准备财务报表。"
  });

  const tasks = useMemo(() => buildReportsTasks(mode), [mode]);
  const activeTaskKey = resolveTaskByView(activeView);
  /** 三表里最后看过的那张，切走再切回时回到原处。 */
  const lastStatementView: ReportsWorkbenchView = isStatementView(activeView)
    ? activeView
    : urlState.report || "balanceSheet";

  useEffect(() => {
    async function bootstrap() {
      try {
        const loadedSnapshots = await loadReports();
        // V7 K3：guided 模式自动用最新快照生成老板摘要，先讲结论再谈报表。
        if (mode === "guided") {
          const latestSnapshotId = pickLatestSnapshotId(loadedSnapshots);
          if (latestSnapshotId) {
            await generateSummaryFor(latestSnapshotId, "已为您准备好本期白话经营摘要。");
          }
        }
      } catch (error) {
        setStatus({
          tone: "error",
          message: (error as Error).message
        });
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    // report 参数即便切到别的任务也保留：它记的是「三表里在看哪张」，
    // 切走再切回要能回到原处，否则每次都被打回资产负债表。
    const next = writeReportsUrlState({ task: activeTaskKey, report: lastStatementView });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [activeTaskKey, lastStatementView, searchParams, setSearchParams]);

  async function loadReports() {
    const request = { periodType, year, month, quarter };
    const [bs, ps, cf, snapshotsPayload] = await Promise.all([
      getBalanceSheetReport(request),
      getProfitStatementReport(request),
      getCashFlowReport(request),
      listReportSnapshots()
    ]);

    setBalanceSheet(bs);
    setProfitStatement(ps);
    setCashFlow(cf);
    setSnapshots(snapshotsPayload.items);
    setStatus({
      tone: "success",
      message: `已更新 ${bs.periodLabel} 财务三表。`
    });
    return snapshotsPayload.items;
  }

  async function saveSnapshot() {
    try {
      await createReportSnapshot({
        reportType: "balance_sheet",
        periodType,
        year,
        month,
        quarter
      });
      const snapshotsPayload = await listReportSnapshots();
      setSnapshots(snapshotsPayload.items);
      setStatus({
        tone: "success",
        message: "已保存资产负债表快照。"
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: (error as Error).message
      });
    }
  }

  async function generateDiff() {
    try {
      const payload = await getReportDiff(fromSnapshotId, toSnapshotId);
      setDiff(payload);
      setActiveView("diff");
      setStatus({
        tone: "success",
        message: `已生成 ${payload.reportType} 差异分析。`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: (error as Error).message
      });
    }
  }

  async function generateSummaryFor(snapshotId: string, successMessage: string) {
    try {
      const payload = await getChairmanReportSummary(snapshotId);
      setChairmanSummary(payload);
      setActiveView("chairman");
      setStatus({
        tone: "success",
        message: successMessage
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: (error as Error).message
      });
    }
  }

  async function generateSummary() {
    await generateSummaryFor(toSnapshotId || fromSnapshotId, "已生成老板口径摘要。");
  }

  async function openPrintable() {
    try {
      const html = await getPrintableReportHtml(toSnapshotId || fromSnapshotId);
      openHtmlWindow(html, "无法打开打印窗口");
      setStatus({
        tone: "success",
        message: "已生成报表打印版。"
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: (error as Error).message
      });
    }
  }

  return (
    <>
      <ReportsHelpPanel open={showHelp} onClose={() => setShowHelp(false)} />
      <ReportsShell
        header={(
          <ReportsHeader
            activeViewLabel={getWorkbenchViewLabel(activeView)}
            periodControl={(
              <ReportsPeriodControl
                periodType={periodType}
                year={year}
                month={month}
                quarter={quarter}
                onPeriodTypeChange={setPeriodType}
                onYearChange={setYear}
                onMonthChange={setMonth}
                onQuarterChange={setQuarter}
                onReload={() => void loadReports()}
              />
            )}
            onOpenHelp={() => setShowHelp(true)}
          />
        )}
      >
        <TaskFocusShell
          tasks={tasks}
          activeKey={activeTaskKey}
          onSelectTask={(key) => setActiveView(resolveViewByTask(key, lastStatementView))}
          switcherLabel="财务报表中心当前要做的事"
        >
          <ReportsWorkbench
            activeView={activeView}
            status={status}
            balanceSheet={balanceSheet}
            profitStatement={profitStatement}
            cashFlow={cashFlow}
            chairmanSummary={chairmanSummary}
            diff={diff}
            onSelectStatement={setActiveView}
            defaultPeriod={`${year}-${String(month).padStart(2, "0")}`}
            comparePanel={(
              <SnapshotComparePanel
                snapshots={snapshots}
                fromSnapshotId={fromSnapshotId}
                toSnapshotId={toSnapshotId}
                diff={diff}
                onSelectFrom={setFromSnapshotId}
                onSelectTo={setToSnapshotId}
                onSaveSnapshot={() => void saveSnapshot()}
                onGenerateDiff={() => void generateDiff()}
                onGenerateSummary={() => void generateSummary()}
                onOpenPrintable={() => void openPrintable()}
                onOpenExportCenter={() => navigate("/export-center")}
              />
            )}
          />
        </TaskFocusShell>
      </ReportsShell>
    </>
  );
}

function openHtmlWindow(html: string, errorMessage: string) {
  const printableWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printableWindow) {
    throw new Error(errorMessage);
  }
  printableWindow.document.open();
  printableWindow.document.write(html);
  printableWindow.document.close();
}
