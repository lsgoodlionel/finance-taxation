import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createReportSnapshot,
  getBalanceSheetReport,
  getCashFlowReport,
  getChairmanReportSummary,
  getClosingBundleHtml,
  getPrintableReportHtml,
  getReportDiff,
  getProfitStatementReport,
  listReportSnapshots
} from "../../lib/api";
import { useWorkspaceMode } from "../../lib/workspace-mode";
import { ReportsHeader } from "./ReportsHeader";
import { ReportsHelpPanel } from "./ReportsHelpPanel";
import { ReportsShell } from "./ReportsShell";
import { ReportsSidebar } from "./ReportsSidebar";
import { ReportsWorkbench } from "./ReportsWorkbench";
import type { BundleKind, ReportsStatus, ReportsWorkbenchView } from "./report-types";
import {
  getWorkbenchViewLabel,
  pickLatestSnapshotId,
  resolveBundlePeriodLabel,
  resolveInitialReportsView
} from "./reports-helpers";

export function ReportsShellContainer() {
  const navigate = useNavigate();
  const { mode } = useWorkspaceMode();
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
  const [activeView, setActiveView] = useState<ReportsWorkbenchView>(() => resolveInitialReportsView(mode));
  const [showHelp, setShowHelp] = useState(false);
  const [status, setStatus] = useState<ReportsStatus>({
    tone: "info",
    message: "正在准备财务报表。"
  });

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

  async function openBundle(kind: BundleKind) {
    try {
      const html = await getClosingBundleHtml(
        kind,
        resolveBundlePeriodLabel(kind, { year, month, quarter }, balanceSheet?.periodLabel)
      );
      openHtmlWindow(html, "无法打开资料包窗口");
      setStatus({
        tone: "success",
        message: kind === "month_end" ? "已打开月结资料包。" : kind === "audit" ? "已打开审计资料包。" : "已打开稽核资料包。"
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
          onNavigateToExportCenter={() => navigate("/pdf-export")}
          onNavigateToTax={() => navigate("/tax")}
          onOpenHelp={() => setShowHelp(true)}
        />
      )}
      sidebar={(
        <ReportsSidebar
          mode={mode}
          periodType={periodType}
          year={year}
          month={month}
          quarter={quarter}
          snapshots={snapshots}
          fromSnapshotId={fromSnapshotId}
          toSnapshotId={toSnapshotId}
          activeView={activeView}
          onPeriodTypeChange={setPeriodType}
          onYearChange={setYear}
          onMonthChange={setMonth}
          onQuarterChange={setQuarter}
          onSelectFrom={setFromSnapshotId}
          onSelectTo={setToSnapshotId}
          onSelectView={setActiveView}
          onReload={() => void loadReports()}
          onSaveSnapshot={() => void saveSnapshot()}
          onGenerateDiff={() => void generateDiff()}
          onGenerateSummary={() => void generateSummary()}
          onOpenPrintable={() => void openPrintable()}
          onOpenBundle={(kind) => void openBundle(kind)}
        />
      )}
      workbench={(
        <ReportsWorkbench
          activeView={activeView}
          status={status}
          balanceSheet={balanceSheet}
          profitStatement={profitStatement}
          cashFlow={cashFlow}
          diff={diff}
          chairmanSummary={chairmanSummary}
          defaultPeriod={`${year}-${String(month).padStart(2, "0")}`}
        />
      )}
    />
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
