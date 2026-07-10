import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  API_BASE_URL,
  createExportJob,
  describePageLoadError,
  getDocumentDetail,
  getClosingBundleHtml,
  getRndProjectDetail,
  getRndSuperDeductionPackage,
  getStoredToken,
  getPayrollPeriods,
  getTaxPrintableHtml,
  listExportArchiveEntries,
  listExportJobs,
  listAuditLogs,
  listDocuments,
  listRiskClosureRecords,
  listRiskFindings,
  listRndProjects,
  listTasks,
  listReportSnapshots,
  listTaxItems,
  listVouchers,
  updateExportJobRuntime
} from "../lib/api";
import type {
  AuditLog,
  ExportArchiveEntry,
  ExportArtifactKind,
  ExportJob,
  GeneratedDocument,
  PayrollPeriodSummary,
  ReportSnapshot,
  RiskClosureRecord,
  RiskFinding,
  RndProject,
  RndProjectSummary,
  TaxItem,
  Task,
  Voucher
} from "@finance-taxation/domain-model";
import { buildPrintableDocumentHtml } from "./document-relations";
import { buildExportFileName } from "./pdf-export-utils";
import { ResultBanner } from "../components/ui/ResultBanner";
import { useQueryState } from "../hooks/useQueryState";
import { normalizeDrilldownState } from "./drilldown";
import { ExportArchivePanel } from "./export/ExportArchivePanel";
import { ExportAuditPanel } from "./export/ExportAuditPanel";
import { ExportDocumentsPanel } from "./export/ExportDocumentsPanel";
import { ExportHeader } from "./export/ExportHeader";
import { ExportHistoryPanel } from "./export/ExportHistoryPanel";
import { ExportPackagesPanel } from "./export/ExportPackagesPanel";
import { ExportPayrollPanel } from "./export/ExportPayrollPanel";
import { ExportReportsPanel } from "./export/ExportReportsPanel";
import { ExportRiskPanel } from "./export/ExportRiskPanel";
import { ExportRndPanel } from "./export/ExportRndPanel";
import { ExportSceneSelector, type ExportSceneKey, type ExportSceneOption } from "./export/ExportSceneSelector";
import { ExportSceneSummary } from "./export/ExportSceneSummary";
import { ExportShell } from "./export/ExportShell";
import { ExportTaxPanel } from "./export/ExportTaxPanel";
import { ExportVouchersPanel } from "./export/ExportVouchersPanel";

function openPdf(path: string) {
  const token = getStoredToken();
  const url = `${API_BASE_URL}${path}&_token=${encodeURIComponent(token ?? "")}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function openPdfNoToken(path: string) {
  const token = getStoredToken();
  const sep = path.includes("?") ? "&" : "?";
  window.open(`${API_BASE_URL}${path}${sep}_token=${encodeURIComponent(token ?? "")}`, "_blank", "noopener,noreferrer");
}

function openHtmlPreview(title: string, html: string) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.title = title;
  win.document.close();
}

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return { borderBottom: "1px solid rgba(20,40,60,0.08)", padding: "10px 8px", textAlign: "left" as const };
}

function btnExport(onClick: () => void, label = "导出 PDF") {
  const style = {
    fontSize: "12px", padding: "4px 12px", borderRadius: "6px",
    border: "1px solid rgba(20,40,60,0.15)", color: "#1e2a37",
    background: "none", cursor: "pointer", whiteSpace: "nowrap" as const
  };
  return (
    <button
      onClick={onClick}
      style={style}
    >
      {label}
    </button>
  );
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  balance_sheet: "资产负债表",
  profit_statement: "利润表",
  cash_flow: "现金流量表"
};

const EXPORT_SCENES: ExportSceneOption[] = [
  { key: "reports", title: "财务报表", description: "报表快照、期间对比和结果页导出。", emoji: "📊" },
  { key: "payroll", title: "工资材料", description: "工资汇总表、工资条和工资期间材料。", emoji: "💰" },
  { key: "tax", title: "税务材料", description: "增值税底稿、企业所得税准备和申报资料。", emoji: "🧾" },
  { key: "packages", title: "批量归档", description: "月结、审计、稽核资料包统一导出。", emoji: "📦" },
  { key: "documents", title: "单据模板", description: "报销单、票据包和其他正式模板导出。", emoji: "📁" },
  { key: "risk", title: "风险复盘", description: "风险发现、关闭记录和复盘输出。", emoji: "🔍" },
  { key: "rnd", title: "研发辅助", description: "研发资料包和加计扣除检查清单。", emoji: "🔬" },
  { key: "vouchers", title: "凭证导出", description: "凭证打印、批量打开和凭证归档。", emoji: "🧷" }
];

function buildSceneSummary(
  scene: ExportSceneKey,
  context: {
    periods: PayrollPeriodSummary[];
    snapshots: ReportSnapshot[];
    documents: GeneratedDocument[];
    findings: RiskFinding[];
    rndProjects: Array<RndProject & { summary: RndProjectSummary }>;
    vouchers: Voucher[];
    selectedReportIds: string[];
    selectedDocumentIds: string[];
    selectedVoucherIds: string[];
  }
) {
  switch (scene) {
    case "reports":
      return {
        title: "财务报表导出",
        description: "面向资产负债表、利润表、现金流量表快照。先确认期间和快照，再执行单项或批量打开。",
        highlights: [`${context.snapshots.length} 条快照`, `已选 ${context.selectedReportIds.length} 项`, "支持批量打开"],
        pendingCount: context.selectedReportIds.length
      };
    case "payroll":
      return {
        title: "工资材料导出",
        description: "用于工资汇总表、工资条和工资期留档。优先按工资期间选择，再导出汇总或全员工资条。",
        highlights: [`${context.periods.length} 个工资期间`, "工资汇总表", "全员工资条"],
        pendingCount: context.periods.length
      };
    case "tax":
      return {
        title: "税务材料导出",
        description: "面向增值税底稿与企业所得税准备稿。确认申报期间后再打开打印版。",
        highlights: ["增值税底稿", "企业所得税准备稿", "按期间生成"],
        pendingCount: 2
      };
    case "packages":
      return {
        title: "资料包导出",
        description: "统一处理月结、审计和稽核资料包。先选期间，再分别打开对应资料包。",
        highlights: ["月结资料包", "审计资料包", "稽核资料包"],
        pendingCount: 3
      };
    case "documents":
      return {
        title: "单据模板导出",
        description: "用于正式单据模板和票据包打印。先确认关联事项，再执行单项或批量打开。",
        highlights: [`${context.documents.length} 份单据`, `已选 ${context.selectedDocumentIds.length} 项`, "正式模板打印"],
        pendingCount: context.selectedDocumentIds.length
      };
    case "risk":
      return {
        title: "风险复盘导出",
        description: "面向风险发现、关闭记录和复盘输出。先确认规则和事项，再打开复盘记录。",
        highlights: [`${context.findings.length} 条风险`, "关闭记录", "复盘留档"],
        pendingCount: context.findings.length
      };
    case "rnd":
      return {
        title: "研发资料导出",
        description: "用于研发项目资料包和加计扣除检查清单。优先确认项目编码和费用口径。",
        highlights: [`${context.rndProjects.length} 个项目`, "加计扣除清单", "研发资料包"],
        pendingCount: context.rndProjects.length
      };
    case "vouchers":
      return {
        title: "凭证导出",
        description: "用于凭证打印和批量打开。先筛选凭证，再按摘要或编号导出。",
        highlights: [`${context.vouchers.length} 条凭证`, `已选 ${context.selectedVoucherIds.length} 项`, "批量打开"],
        pendingCount: context.selectedVoucherIds.length
      };
  }
}

function escHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function PdfExportPage() {
  const location = useLocation();
  const navState = normalizeDrilldownState(location.state);
  const navExportJobId = navState.resourceType === "export_job" ? navState.resourceId ?? null : null;
  const navScene = navState.scene ?? null;
  const [periods, setPeriods] = useState<PayrollPeriodSummary[]>([]);
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [findings, setFindings] = useState<RiskFinding[]>([]);
  const [rndProjects, setRndProjects] = useState<Array<RndProject & { summary: RndProjectSummary }>>([]);
  const [vatFilingPeriod, setVatFilingPeriod] = useState("2026-05");
  const [citFilingPeriod, setCitFilingPeriod] = useState("2026-Q2");
  const [closingPeriod, setClosingPeriod] = useState("2026-05");
  const [inspectionPeriod, setInspectionPeriod] = useState("2026-Q2");
  const [message, setMessage] = useState("正在加载导出列表...");
  const [activeTabState, setActiveTabState] = useQueryState("tab", "reports");
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportJob[]>([]);
  const [archiveEntries, setArchiveEntries] = useState<ExportArchiveEntry[]>([]);
  const [exportAuditLogs, setExportAuditLogs] = useState<AuditLog[]>([]);
  const [archiveKindFilter, setArchiveKindFilter] = useState<ExportArtifactKind | "">("");
  const [archiveKeyword, setArchiveKeyword] = useState("");
  const activeTab = (["payroll", "reports", "tax", "packages", "documents", "risk", "rnd", "vouchers"].includes(activeTabState)
    ? activeTabState
    : "reports") as "payroll" | "reports" | "tax" | "packages" | "documents" | "risk" | "rnd" | "vouchers";
  const activeScene = EXPORT_SCENES.find((item) => item.key === activeTab) ?? EXPORT_SCENES[0]!;
  const sceneSummary = buildSceneSummary(activeTab, {
    periods,
    snapshots,
    documents,
    findings,
    rndProjects,
    vouchers,
    selectedReportIds,
    selectedDocumentIds,
    selectedVoucherIds
  });

  useEffect(() => {
    async function bootstrap() {
      try {
        const [perRes, snapRes, vcRes, docsRes, riskRes, rndRes, historyRes, archiveRes, auditRes] = await Promise.all([
          getPayrollPeriods(),
          listReportSnapshots(),
          listVouchers(),
          listDocuments(),
          listRiskFindings(),
          listRndProjects(),
          listExportJobs(),
          listExportArchiveEntries(),
          listAuditLogs({ resourceType: "export_job", limit: 20 })
        ]);
        setPeriods(perRes.items);
        setSnapshots(snapRes.items);
        setVouchers(vcRes.items.slice(0, 50));
        setDocuments(docsRes.items.slice(0, 50));
        setFindings(riskRes.items.slice(0, 50));
        setRndProjects(rndRes.items);
        setExportHistory(historyRes.items);
        setArchiveEntries(archiveRes.items);
        setExportAuditLogs(auditRes.items);
        setMessage("这里是最终导出中心。下方统一汇总工资、报表、税务底稿、资料包和凭证的打印版入口。");
      } catch (error) {
        setMessage(describePageLoadError(error));
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (!navScene) {
      return;
    }
    const matchedScene = EXPORT_SCENES.find((item) => item.key === navScene);
    if (!matchedScene || matchedScene.key === activeTab) {
      return;
    }
    setActiveTabState(matchedScene.key);
  }, [activeTab, navScene, setActiveTabState]);

  useEffect(() => {
    if (!navExportJobId) {
      return;
    }
    const matchedJob = exportHistory.find((item) => item.id === navExportJobId);
    if (matchedJob) {
      setMessage(`已从审计日志恢复到导出任务 ${matchedJob.label}。`);
      return;
    }
    setMessage(`已从审计日志恢复导出上下文，目标任务 ${navExportJobId}。`);
  }, [exportHistory, navExportJobId]);

  function toggleSelection(id: string, setter: (updater: (current: string[]) => string[]) => void) {
    setter((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function rememberExport(input: {
    kind: ExportArtifactKind;
    label: string;
    fileName: string;
    resourceType?: string | null;
    resourceId?: string | null;
    periodLabel?: string | null;
  }) {
    void createExportJob({ ...input, status: "opened" })
      .then(async ({ job, archiveEntry, reused }) => {
        setExportHistory((current) => [job, ...current].slice(0, 20));
        setArchiveEntries((current) => [archiveEntry, ...current].slice(0, 20));
        const auditRes = await listAuditLogs({ resourceType: "export_job", limit: 20 });
        setExportAuditLogs(auditRes.items);
        if (reused) {
          setMessage(`已复用现有导出任务：${job.label}`);
        }
      })
      .catch(() => {
        setMessage("导出已打开，但后端导出历史记录失败。");
      });
  }

  async function handleUpdateExportStatus(jobId: string, status: ExportJob["status"]) {
    try {
      const { job } = await updateExportJobRuntime(jobId, {
        status,
        errorMessage: status === "failed" ? "导出已打开但文件整理或外部连接器处理失败，请人工复核后重试。" : undefined
      });
      setExportHistory((current) => current.map((item) => item.id === job.id ? job : item));
      const auditRes = await listAuditLogs({ resourceType: "export_job", limit: 20 });
      setExportAuditLogs(auditRes.items);
      setMessage(`已将导出任务更新为 ${status}。`);
    } catch {
      setMessage("导出任务状态更新失败。");
    }
  }

  useEffect(() => {
    void listExportArchiveEntries(20, { kind: archiveKindFilter, keyword: archiveKeyword || undefined })
      .then((res) => setArchiveEntries(res.items))
      .catch(() => {});
  }, [archiveKindFilter, archiveKeyword]);

  const batchButtonStyle = {
    fontSize: "12px",
    padding: "4px 12px",
    borderRadius: "6px",
    border: "1px solid rgba(20,40,60,0.15)",
    color: "#1e2a37",
    background: "none",
    cursor: "pointer",
    whiteSpace: "nowrap" as const
  };

  function openReportSnapshot(snapshotId: string) {
    const snapshot = snapshots.find((item) => item.id === snapshotId);
    if (snapshot) {
      rememberExport({
        kind: "report",
        label: `${REPORT_TYPE_LABELS[snapshot.reportType] ?? snapshot.reportType} ${snapshot.periodLabel}`,
        fileName: buildExportFileName([REPORT_TYPE_LABELS[snapshot.reportType] ?? snapshot.reportType, snapshot.periodLabel, "快照"]),
        resourceType: "report_snapshot",
        resourceId: snapshot.id,
        periodLabel: snapshot.periodLabel
      });
    }
    openPdfNoToken(`/api/pdf/report?snapshotId=${snapshotId}`);
  }

  async function openDocumentTemplate(document: GeneratedDocument) {
    const [detail, tasksPayload, taxPayload, voucherPayload] = await Promise.all([
      getDocumentDetail(document.id),
      listTasks(document.businessEventId),
      listTaxItems({ businessEventId: document.businessEventId }),
      listVouchers({ businessEventId: document.businessEventId })
    ]);
    const html = buildPrintableDocumentHtml({
      document: detail,
      tasks: tasksPayload.items as Task[],
      taxItems: taxPayload.items as TaxItem[],
      vouchers: voucherPayload.items
    });
    rememberExport({
      kind: "document",
      label: document.title,
      fileName: buildExportFileName([document.title, document.documentType, document.businessEventId]),
      resourceType: "document",
      resourceId: document.id
    });
    openHtmlPreview(document.title, html);
  }

  function openVoucherPdf(voucherId: string) {
    const voucher = vouchers.find((item) => item.id === voucherId);
    if (voucher) {
      rememberExport({
        kind: "voucher",
        label: voucher.summary,
        fileName: buildExportFileName(["凭证", voucher.id.slice(-8).toUpperCase(), voucher.voucherType]),
        resourceType: "voucher",
        resourceId: voucher.id
      });
    }
    openPdfNoToken(`/api/pdf/voucher/${voucherId}`);
  }

  return (
    <ExportShell
      header={<ExportHeader activeSceneLabel={activeScene.title} />}
      guidance={(
        <>
          {message ? <ResultBanner tone="info" message={message} /> : null}
          <ResultBanner tone="success" message="打开导出链接后，在浏览器中按 Ctrl+P（Mac: ⌘+P），选择「另存为 PDF」即可保存 PDF 文件。" />
        </>
      )}
      sceneSelector={(
        <ExportSceneSelector
          activeScene={activeTab as ExportSceneKey}
          options={EXPORT_SCENES}
          onChange={(key) => setActiveTabState(key)}
        />
      )}
      content={(
        <>
          <ExportSceneSummary
            scene={activeTab}
            title={sceneSummary.title}
            description={sceneSummary.description}
            highlights={sceneSummary.highlights}
            pendingCount={sceneSummary.pendingCount}
          />
          <ExportAuditPanel logs={exportAuditLogs} cellStyle={cellStyle} />
          {activeTab === "payroll" && (
            <ExportPayrollPanel
              periods={periods}
              onOpenPayrollSummary={(period) => {
                rememberExport({
                  kind: "payroll",
                  label: `${period.period} 工资汇总表`,
                  fileName: buildExportFileName([period.period, "工资汇总表"]),
                  resourceType: "payroll_period",
                  resourceId: period.period,
                  periodLabel: period.period
                });
                openPdf(`/api/pdf/payroll?period=${period.period}`);
              }}
              onOpenPayrollSlips={(period) => {
                rememberExport({
                  kind: "payroll",
                  label: `${period.period} 全员工资条`,
                  fileName: buildExportFileName([period.period, "全员工资条"]),
                  resourceType: "payroll_period",
                  resourceId: `${period.period}:slips`,
                  periodLabel: period.period
                });
                openPdf(`/api/pdf/payroll-slip?period=${period.period}`);
              }}
              renderActionButton={btnExport}
              cellStyle={cellStyle}
            />
          )}

          {activeTab === "reports" && (
            <ExportReportsPanel
              snapshots={snapshots}
              selectedIds={selectedReportIds}
              onToggleSelection={(id) => toggleSelection(id, setSelectedReportIds)}
              onBatchOpen={() => selectedReportIds.forEach((id) => openReportSnapshot(id))}
              onOpenSnapshot={openReportSnapshot}
              buildFileName={(snapshot) => buildExportFileName([REPORT_TYPE_LABELS[snapshot.reportType] ?? snapshot.reportType, snapshot.periodLabel, "快照"])}
              cellStyle={cellStyle}
              batchButtonStyle={batchButtonStyle}
            />
          )}

          {activeTab === "tax" && (
            <ExportTaxPanel
              vatFilingPeriod={vatFilingPeriod}
              citFilingPeriod={citFilingPeriod}
              onVatPeriodChange={setVatFilingPeriod}
              onCitPeriodChange={setCitFilingPeriod}
              onOpenVat={() => void getTaxPrintableHtml("vat", vatFilingPeriod).then((html) => {
                rememberExport({
                  kind: "tax",
                  label: `增值税底稿 ${vatFilingPeriod}`,
                  fileName: buildExportFileName(["增值税底稿", vatFilingPeriod]),
                  resourceType: "tax_working_paper",
                  resourceId: `vat:${vatFilingPeriod}`,
                  periodLabel: vatFilingPeriod
                });
                openHtmlPreview(`增值税底稿 ${vatFilingPeriod}`, html);
              })}
              onOpenCit={() => void getTaxPrintableHtml("corporate_income_tax", citFilingPeriod).then((html) => {
                rememberExport({
                  kind: "tax",
                  label: `企业所得税准备 ${citFilingPeriod}`,
                  fileName: buildExportFileName(["企业所得税准备", citFilingPeriod]),
                  resourceType: "corporate_income_tax_preparation",
                  resourceId: `cit:${citFilingPeriod}`,
                  periodLabel: citFilingPeriod
                });
                openHtmlPreview(`企业所得税准备 ${citFilingPeriod}`, html);
              })}
              renderActionButton={btnExport}
            />
          )}

          {activeTab === "packages" && (
            <ExportPackagesPanel
              closingPeriod={closingPeriod}
              inspectionPeriod={inspectionPeriod}
              onClosingPeriodChange={setClosingPeriod}
              onInspectionPeriodChange={setInspectionPeriod}
              onOpenMonthEnd={() => void getClosingBundleHtml("month_end", closingPeriod).then((html) => {
                rememberExport({
                  kind: "package",
                  label: `月结资料包 ${closingPeriod}`,
                  fileName: buildExportFileName(["月结资料包", closingPeriod]),
                  resourceType: "closing_bundle",
                  resourceId: `month_end:${closingPeriod}`,
                  periodLabel: closingPeriod
                });
                openHtmlPreview(`月结资料包 ${closingPeriod}`, html);
              })}
              onOpenAudit={() => void getClosingBundleHtml("audit", inspectionPeriod).then((html) => {
                rememberExport({
                  kind: "package",
                  label: `审计资料包 ${inspectionPeriod}`,
                  fileName: buildExportFileName(["审计资料包", inspectionPeriod]),
                  resourceType: "closing_bundle",
                  resourceId: `audit:${inspectionPeriod}`,
                  periodLabel: inspectionPeriod
                });
                openHtmlPreview(`审计资料包 ${inspectionPeriod}`, html);
              })}
              onOpenInspection={() => void getClosingBundleHtml("inspection", inspectionPeriod).then((html) => {
                rememberExport({
                  kind: "package",
                  label: `稽核资料包 ${inspectionPeriod}`,
                  fileName: buildExportFileName(["稽核资料包", inspectionPeriod]),
                  resourceType: "closing_bundle",
                  resourceId: `inspection:${inspectionPeriod}`,
                  periodLabel: inspectionPeriod
                });
                openHtmlPreview(`稽核资料包 ${inspectionPeriod}`, html);
              })}
              renderActionButton={btnExport}
            />
          )}

          {activeTab === "documents" && (
            <ExportDocumentsPanel
              documents={documents}
              selectedIds={selectedDocumentIds}
              onToggleSelection={(id) => toggleSelection(id, setSelectedDocumentIds)}
              onBatchOpen={() => {
                selectedDocumentIds.forEach((id) => {
                  const document = documents.find((item) => item.id === id);
                  if (document) {
                    void openDocumentTemplate(document);
                  }
                });
              }}
              onOpenDocument={(document) => void openDocumentTemplate(document)}
              buildFileName={(document) => buildExportFileName([document.title, document.documentType, document.businessEventId])}
              cellStyle={cellStyle}
              batchButtonStyle={batchButtonStyle}
            />
          )}

          {activeTab === "risk" && (
            <ExportRiskPanel
              findings={findings}
              onOpenFinding={(finding) => void listRiskClosureRecords(finding.id).then((payload) => {
                const closures = payload.items as RiskClosureRecord[];
                rememberExport({
                  kind: "risk",
                  label: `风险复盘 ${finding.ruleCode}`,
                  fileName: buildExportFileName(["风险复盘", finding.ruleCode, finding.id]),
                  resourceType: "risk_finding",
                  resourceId: finding.id,
                  periodLabel: null
                });
                const html = `
                  <html><head><meta charset="utf-8"><title>${escHtml(finding.title)}</title></head>
                  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;color:#1f2937;">
                    <h1 style="margin:0 0 8px;">风险复盘记录</h1>
                    <div style="margin-bottom:16px;color:#6b7280;">规则：${escHtml(finding.ruleCode)} ｜ 标题：${escHtml(finding.title)}</div>
                    <div style="margin-bottom:16px;"><strong>说明：</strong>${escHtml(finding.detail)}</div>
                    <h2 style="margin:24px 0 8px;font-size:16px;">关闭记录</h2>
                    ${
                      closures.length
                        ? `<ul>${closures.map((record) => `<li><strong>${escHtml(record.closedByName)}</strong> ｜ ${escHtml(record.reviewedAt)} ｜ ${escHtml(record.resolution)}</li>`).join("")}</ul>`
                        : "<div>暂无关闭记录</div>"
                    }
                  </body></html>
                `;
                openHtmlPreview(`风险复盘 ${finding.ruleCode}`, html);
              })}
              renderActionButton={btnExport}
              cellStyle={cellStyle}
            />
          )}

          {activeTab === "rnd" && (
            <ExportRndPanel
              projects={rndProjects}
              onOpenProject={(project) => void Promise.all([
                getRndProjectDetail(project.id),
                getRndSuperDeductionPackage(project.id)
              ]).then(([detail, pkg]) => {
                rememberExport({
                  kind: "rnd",
                  label: `研发资料包 ${project.code}`,
                  fileName: buildExportFileName(["研发资料包", project.code, project.name]),
                  resourceType: "rnd_project",
                  resourceId: project.id,
                  periodLabel: null
                });
                const html = `
                  <html><head><meta charset="utf-8"><title>${escHtml(detail.name)}</title></head>
                  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;color:#1f2937;">
                    <h1 style="margin:0 0 8px;">研发资料包</h1>
                    <div style="margin-bottom:16px;color:#6b7280;">项目：${escHtml(detail.name)} ｜ 编号：${escHtml(detail.code)}</div>
                    <div><strong>费用化：</strong>${escHtml(detail.summary.expenseAmount)}</div>
                    <div><strong>资本化：</strong>${escHtml(detail.summary.capitalizedAmount)}</div>
                    <div><strong>总工时：</strong>${escHtml(detail.summary.totalHours)}</div>
                    <div><strong>加计扣除基数：</strong>${escHtml(pkg.eligibleBase)}</div>
                    <div><strong>建议加计扣除：</strong>${escHtml(pkg.suggestedDeductionAmount)}</div>
                    <h2 style="margin:24px 0 8px;font-size:16px;">检查清单</h2>
                    <ul>${pkg.checklist.map((item) => `<li>${escHtml(item)}</li>`).join("")}</ul>
                  </body></html>
                `;
                openHtmlPreview(`研发资料包 ${detail.code}`, html);
              })}
              renderActionButton={btnExport}
              cellStyle={cellStyle}
            />
          )}

          {activeTab === "vouchers" && (
            <ExportVouchersPanel
              vouchers={vouchers}
              selectedIds={selectedVoucherIds}
              onToggleSelection={(id) => toggleSelection(id, setSelectedVoucherIds)}
              onBatchOpen={() => selectedVoucherIds.forEach((id) => openVoucherPdf(id))}
              onOpenVoucher={openVoucherPdf}
              buildFileName={(voucher) => buildExportFileName(["凭证", voucher.id.slice(-8).toUpperCase(), voucher.voucherType])}
              cellStyle={cellStyle}
              batchButtonStyle={batchButtonStyle}
            />
          )}
        </>
      )}
      history={(
        <ExportHistoryPanel
          jobs={exportHistory}
          highlightedJobId={navExportJobId}
          onUpdateStatus={(jobId, status) => void handleUpdateExportStatus(jobId, status)}
          renderActionButton={btnExport}
          cellStyle={cellStyle}
        />
      )}
      archive={(
        <ExportArchivePanel
          archiveEntries={archiveEntries}
          archiveKindFilter={archiveKindFilter}
          archiveKeyword={archiveKeyword}
          onKindFilterChange={setArchiveKindFilter}
          onKeywordChange={setArchiveKeyword}
          cellStyle={cellStyle}
        />
      )}
    />
  );
}
