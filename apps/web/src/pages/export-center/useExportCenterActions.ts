import type {
  ExportArtifactKind,
  ExportJob,
  GeneratedDocument,
  PayrollPeriodSummary,
  RiskClosureRecord,
  RiskFinding,
  RndProject,
  RndProjectSummary,
  TaxItem,
  Task
} from "@finance-taxation/domain-model";
import {
  createExportJob,
  getDocumentDetail,
  getClosingBundleHtml,
  getRndProjectDetail,
  getRndSuperDeductionPackage,
  getTaxPrintableHtml,
  listAuditLogs,
  listRiskClosureRecords,
  listTasks,
  listTaxItems,
  listVouchers,
  updateExportJobRuntime
} from "../../lib/api";
import { buildPrintableDocumentHtml } from "../document-relations";
import { buildExportFileName } from "../pdf-export-utils";
import { REPORT_TYPE_LABELS, escHtml, openHtmlPreview, openPdf, openPdfNoToken } from "./export-center-helpers";
import type { ExportCenterState } from "./useExportCenterState";

function toggleSelection(id: string, setter: (updater: (current: string[]) => string[]) => void) {
  setter((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
}

/**
 * 导出与归档中心的动作集合：所有「一键导出」处理函数，均复用 lib/api.ts 中既有的
 * 导出相关调用（closing-bundle、pdf、exports/jobs 等），并在打开导出内容前后
 * 写入导出历史（createExportJob）与审计轨迹。
 */
export function useExportCenterActions(state: ExportCenterState) {
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
        state.setExportHistory((current) => [job, ...current].slice(0, 20));
        state.setArchiveEntries((current) => [archiveEntry, ...current].slice(0, 20));
        const auditRes = await listAuditLogs({ resourceType: "export_job", limit: 20 });
        state.setExportAuditLogs(auditRes.items);
        if (reused) {
          state.setMessage(`已复用现有导出任务：${job.label}`);
        }
      })
      .catch(() => {
        state.setMessage("导出已打开，但后端导出历史记录失败。");
      });
  }

  async function handleUpdateExportStatus(jobId: string, status: ExportJob["status"]) {
    try {
      const { job } = await updateExportJobRuntime(jobId, {
        status,
        errorMessage: status === "failed" ? "导出已打开但文件整理或外部连接器处理失败，请人工复核后重试。" : undefined
      });
      state.setExportHistory((current) => current.map((item) => (item.id === job.id ? job : item)));
      const auditRes = await listAuditLogs({ resourceType: "export_job", limit: 20 });
      state.setExportAuditLogs(auditRes.items);
      state.setMessage(`已将导出任务更新为 ${status}。`);
    } catch {
      state.setMessage("导出任务状态更新失败。");
    }
  }

  function openReportSnapshot(snapshotId: string) {
    const snapshot = state.snapshots.find((item) => item.id === snapshotId);
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
    const voucher = state.vouchers.find((item) => item.id === voucherId);
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

  function openPackage(kind: "month_end" | "audit" | "inspection", packagePeriod: string, label: string) {
    void getClosingBundleHtml(kind, packagePeriod).then((html) => {
      rememberExport({
        kind: "package",
        label: `${label} ${packagePeriod}`,
        fileName: buildExportFileName([label, packagePeriod]),
        resourceType: "closing_bundle",
        resourceId: `${kind}:${packagePeriod}`,
        periodLabel: packagePeriod
      });
      openHtmlPreview(`${label} ${packagePeriod}`, html);
    });
  }

  function openTaxWorkingPaper(kind: "vat" | "corporate_income_tax", filingPeriod: string, label: string) {
    void getTaxPrintableHtml(kind, filingPeriod).then((html) => {
      rememberExport({
        kind: "tax",
        label: `${label} ${filingPeriod}`,
        fileName: buildExportFileName([label, filingPeriod]),
        resourceType: kind === "vat" ? "tax_working_paper" : "corporate_income_tax_preparation",
        resourceId: `${kind}:${filingPeriod}`,
        periodLabel: filingPeriod
      });
      openHtmlPreview(`${label} ${filingPeriod}`, html);
    });
  }

  function openRiskFinding(finding: RiskFinding) {
    void listRiskClosureRecords(finding.id).then((payload) => {
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
    });
  }

  function openRndProject(project: RndProject & { summary: RndProjectSummary }) {
    void Promise.all([getRndProjectDetail(project.id), getRndSuperDeductionPackage(project.id)]).then(([detail, pkg]) => {
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
    });
  }

  function openPayrollSummary(periodItem: PayrollPeriodSummary) {
    rememberExport({
      kind: "payroll",
      label: `${periodItem.period} 工资汇总表`,
      fileName: buildExportFileName([periodItem.period, "工资汇总表"]),
      resourceType: "payroll_period",
      resourceId: periodItem.period,
      periodLabel: periodItem.period
    });
    openPdf(`/api/pdf/payroll?period=${periodItem.period}`);
  }

  function openPayrollSlips(periodItem: PayrollPeriodSummary) {
    rememberExport({
      kind: "payroll",
      label: `${periodItem.period} 全员工资条`,
      fileName: buildExportFileName([periodItem.period, "全员工资条"]),
      resourceType: "payroll_period",
      resourceId: `${periodItem.period}:slips`,
      periodLabel: periodItem.period
    });
    openPdf(`/api/pdf/payroll-slip?period=${periodItem.period}`);
  }

  return {
    handleUpdateExportStatus: (jobId: string, status: ExportJob["status"]) => void handleUpdateExportStatus(jobId, status),
    toggleReportSelection: (id: string) => toggleSelection(id, state.setSelectedReportIds),
    toggleDocumentSelection: (id: string) => toggleSelection(id, state.setSelectedDocumentIds),
    toggleVoucherSelection: (id: string) => toggleSelection(id, state.setSelectedVoucherIds),
    openReportSnapshot,
    openDocumentTemplate: (document: GeneratedDocument) => void openDocumentTemplate(document),
    openVoucherPdf,
    openPackage,
    openTaxWorkingPaper,
    openRiskFinding,
    openRndProject,
    openPayrollSummary,
    openPayrollSlips,
    batchOpenReports: () => state.selectedReportIds.forEach((id) => openReportSnapshot(id)),
    batchOpenDocuments: () => {
      state.selectedDocumentIds.forEach((id) => {
        const document = state.documents.find((item) => item.id === id);
        if (document) void openDocumentTemplate(document);
      });
    },
    batchOpenVouchers: () => state.selectedVoucherIds.forEach((id) => openVoucherPdf(id))
  };
}

export type ExportCenterActions = ReturnType<typeof useExportCenterActions>;
