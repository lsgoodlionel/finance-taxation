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
import { ReportsHeader } from "./ReportsHeader";
import { ReportsShell } from "./ReportsShell";
import { ReportsSidebar } from "./ReportsSidebar";
import { ReportsWorkbench } from "./ReportsWorkbench";
import type { BundleKind, ReportsStatus, ReportsWorkbenchView } from "./report-types";
import { defaultReportsView, getWorkbenchViewLabel, resolveBundlePeriodLabel } from "./reports-helpers";

export function ReportsShellContainer() {
  const navigate = useNavigate();
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
  const [activeView, setActiveView] = useState<ReportsWorkbenchView>(defaultReportsView);
  const [status, setStatus] = useState<ReportsStatus>({
    tone: "info",
    message: "正在准备财务报表。"
  });

  useEffect(() => {
    async function bootstrap() {
      try {
        await loadReports();
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

  async function generateSummary() {
    try {
      const payload = await getChairmanReportSummary(toSnapshotId || fromSnapshotId);
      setChairmanSummary(payload);
      setActiveView("chairman");
      setStatus({
        tone: "success",
        message: "已生成老板口径摘要。"
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: (error as Error).message
      });
    }
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
    <ReportsShell
      header={(
        <ReportsHeader
          activeViewLabel={getWorkbenchViewLabel(activeView)}
          onNavigateToExportCenter={() => navigate("/pdf-export")}
        />
      )}
      sidebar={(
        <ReportsSidebar
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
        />
      )}
    />
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
