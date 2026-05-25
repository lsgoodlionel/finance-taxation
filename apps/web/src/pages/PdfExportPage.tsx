import { useEffect, useState } from "react";
import {
  createExportJob,
  getDocumentDetail,
  getClosingBundleHtml,
  getRndProjectDetail,
  getRndSuperDeductionPackage,
  getStoredToken,
  getPayrollPeriods,
  getTaxPrintableHtml,
  listExportArchiveEntries,
  listExportJobs,
  listDocuments,
  listRiskClosureRecords,
  listRiskFindings,
  listRndProjects,
  listTasks,
  listReportSnapshots,
  listTaxItems,
  listVouchers
} from "../lib/api";
import type {
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";

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

function escHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function PdfExportPage() {
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
  const [activeTab, setActiveTab] = useState<"payroll" | "reports" | "tax" | "packages" | "documents" | "risk" | "rnd" | "vouchers">("reports");
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportJob[]>([]);
  const [archiveEntries, setArchiveEntries] = useState<ExportArchiveEntry[]>([]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [perRes, snapRes, vcRes, docsRes, riskRes, rndRes, historyRes, archiveRes] = await Promise.all([
          getPayrollPeriods(),
          listReportSnapshots(),
          listVouchers(),
          listDocuments(),
          listRiskFindings(),
          listRndProjects(),
          listExportJobs(),
          listExportArchiveEntries()
        ]);
        setPeriods(perRes.items);
        setSnapshots(snapRes.items);
        setVouchers(vcRes.items.slice(0, 50));
        setDocuments(docsRes.items.slice(0, 50));
        setFindings(riskRes.items.slice(0, 50));
        setRndProjects(rndRes.items);
        setExportHistory(historyRes.items);
        setArchiveEntries(archiveRes.items);
        setMessage("这里是最终导出中心。下方统一汇总工资、报表、税务底稿、资料包和凭证的打印版入口。");
      } catch {
        setMessage("加载失败，请检查后端连接。");
      }
    }
    bootstrap();
  }, []);

  const tabStyle = (t: typeof activeTab) => ({
    padding: "8px 20px", borderRadius: "8px", border: "none",
    cursor: "pointer", fontSize: "14px",
    background: activeTab === t ? "#1e2a37" : "rgba(255,255,255,0.72)",
    color: activeTab === t ? "#fff" : "#1e2a37"
  } as const);

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
    void createExportJob(input)
      .then(({ job, archiveEntry }) => {
        setExportHistory((current) => [job, ...current].slice(0, 20));
        setArchiveEntries((current) => [archiveEntry, ...current].slice(0, 20));
      })
      .catch(() => {
        setMessage("导出已打开，但后端导出历史记录失败。");
      });
  }

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
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>PDF 导出中心</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={tabStyle("reports")} onClick={() => setActiveTab("reports")}>报表导出</button>
          <button style={tabStyle("tax")} onClick={() => setActiveTab("tax")}>税务底稿</button>
          <button style={tabStyle("packages")} onClick={() => setActiveTab("packages")}>资料包</button>
          <button style={tabStyle("documents")} onClick={() => setActiveTab("documents")}>单据导出</button>
          <button style={tabStyle("risk")} onClick={() => setActiveTab("risk")}>风险复盘</button>
          <button style={tabStyle("rnd")} onClick={() => setActiveTab("rnd")}>研发资料</button>
          <button style={tabStyle("payroll")} onClick={() => setActiveTab("payroll")}>工资导出</button>
          <button style={tabStyle("vouchers")} onClick={() => setActiveTab("vouchers")}>凭证导出</button>
        </div>
      </div>

      <div style={{ ...panelStyle(), background: "rgba(232,244,239,0.6)", border: "1px solid rgba(26,127,90,0.15)", fontSize: "13px", color: "#1a7f5a" }}>
        💡 打开导出链接后，在浏览器中按 <strong>Ctrl+P</strong>（Mac: <strong>⌘+P</strong>），选择「另存为 PDF」即可保存 PDF 文件。
      </div>

      <div style={panelStyle()}>
        <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>最近导出记录</h3>
        {exportHistory.length === 0 ? (
          <div style={{ color: "#aab5c0", textAlign: "center", padding: "24px" }}>暂无导出记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ color: "#6c7a89" }}>
                {["时间", "类型", "名称", "建议文件名"].map((h) => (
                  <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exportHistory.map((item) => (
                <tr key={item.id}>
                  <td style={cellStyle()}>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                  <td style={cellStyle()}>{item.kind}</td>
                  <td style={cellStyle()}>{item.label}</td>
                  <td style={cellStyle()}>{item.fileName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={panelStyle()}>
        <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>导出归档索引</h3>
        {archiveEntries.length === 0 ? (
          <div style={{ color: "#aab5c0", textAlign: "center", padding: "24px" }}>暂无归档索引</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ color: "#6c7a89" }}>
                {["归档键", "分类", "标题", "对象", "建议文件名", "时间"].map((h) => (
                  <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {archiveEntries.map((item) => (
                <tr key={item.id}>
                  <td style={cellStyle()}>{item.archiveKey}</td>
                  <td style={cellStyle()}>{item.kind}</td>
                  <td style={cellStyle()}>{item.title}</td>
                  <td style={cellStyle()}>{item.objectId || item.objectType}</td>
                  <td style={cellStyle()}>{item.fileName}</td>
                  <td style={cellStyle()}>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 工资导出 ── */}
      {activeTab === "payroll" && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>工资汇总表 &amp; 工资条</h3>
          {periods.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无工资数据</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["工资期间", "人数", "实发合计", "状态", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.period}>
                    <td style={cellStyle()}>{p.period}</td>
                    <td style={cellStyle()}>{p.headcount} 人</td>
                    <td style={cellStyle()}>
                      ¥ {p.totalNetPay.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={cellStyle()}>
                      <span style={{ fontSize: "12px", color: p.status === "confirmed" ? "#1a7f5a" : "#8a9bb0" }}>
                        {p.status === "confirmed" ? "已确认" : p.status === "draft" ? "草稿" : "部分确认"}
                      </span>
                    </td>
                    <td style={{ ...cellStyle(), display: "flex", gap: "6px" }}>
                      {btnExport(() => {
                        rememberExport({
                          kind: "payroll",
                          label: `${p.period} 工资汇总表`,
                          fileName: buildExportFileName([p.period, "工资汇总表"]),
                          resourceType: "payroll_period",
                          resourceId: p.period,
                          periodLabel: p.period
                        });
                        openPdf(`/api/pdf/payroll?period=${p.period}`);
                      }, "工资汇总")}
                      {btnExport(() => {
                        rememberExport({
                          kind: "payroll",
                          label: `${p.period} 全员工资条`,
                          fileName: buildExportFileName([p.period, "全员工资条"]),
                          resourceType: "payroll_period",
                          resourceId: `${p.period}:slips`,
                          periodLabel: p.period
                        });
                        openPdf(`/api/pdf/payroll-slip?period=${p.period}`);
                      }, "全员工资条")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 报表导出 ── */}
      {activeTab === "reports" && (
        <div style={panelStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "15px" }}>财务报表快照导出</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "#6c7a89" }}>已选 {selectedReportIds.length} 项</span>
              <button
                disabled={selectedReportIds.length === 0}
                onClick={() => selectedReportIds.forEach((id) => openReportSnapshot(id))}
                style={{ ...batchButtonStyle, opacity: selectedReportIds.length ? 1 : 0.5 }}
              >
                批量打开
              </button>
            </div>
          </div>
          {snapshots.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无报表快照，请先在「财务报表」页生成快照</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["选择", "报表类型", "期间", "快照日期", "建议文件名", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td style={cellStyle()}>
                      <input
                        type="checkbox"
                        checked={selectedReportIds.includes(s.id)}
                        onChange={() => toggleSelection(s.id, setSelectedReportIds)}
                      />
                    </td>
                    <td style={cellStyle()}>{REPORT_TYPE_LABELS[s.reportType] ?? s.reportType}</td>
                    <td style={cellStyle()}>{s.periodLabel}</td>
                    <td style={cellStyle()}>{s.snapshotDate}</td>
                    <td style={cellStyle()}>
                      {buildExportFileName([REPORT_TYPE_LABELS[s.reportType] ?? s.reportType, s.periodLabel, "快照"])}
                    </td>
                    <td style={cellStyle()}>
                      {btnExport(() => openReportSnapshot(s.id))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "tax" && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>税务底稿与申报准备导出</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end", marginBottom: "16px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
              <span style={{ color: "#6c7a89" }}>增值税底稿期间</span>
              <input
                type="month"
                value={vatFilingPeriod}
                onChange={(event) => setVatFilingPeriod(event.target.value)}
                style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
              />
            </label>
            {btnExport(
              () =>
                void getTaxPrintableHtml("vat", vatFilingPeriod).then((html) => {
                  rememberExport({
                    kind: "tax",
                    label: `增值税底稿 ${vatFilingPeriod}`,
                    fileName: buildExportFileName(["增值税底稿", vatFilingPeriod]),
                    resourceType: "tax_working_paper",
                    resourceId: `vat:${vatFilingPeriod}`,
                    periodLabel: vatFilingPeriod
                  });
                  openHtmlPreview(`增值税底稿 ${vatFilingPeriod}`, html);
                }),
              "打开增值税底稿"
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
              <span style={{ color: "#6c7a89" }}>企业所得税准备期间</span>
              <input
                value={citFilingPeriod}
                onChange={(event) => setCitFilingPeriod(event.target.value)}
                style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
                placeholder="例如 2026-Q2"
              />
            </label>
            {btnExport(
              () =>
                void getTaxPrintableHtml("corporate_income_tax", citFilingPeriod).then((html) => {
                  rememberExport({
                    kind: "tax",
                    label: `企业所得税准备 ${citFilingPeriod}`,
                    fileName: buildExportFileName(["企业所得税准备", citFilingPeriod]),
                    resourceType: "corporate_income_tax_preparation",
                    resourceId: `cit:${citFilingPeriod}`,
                    periodLabel: citFilingPeriod
                  });
                  openHtmlPreview(`企业所得税准备 ${citFilingPeriod}`, html);
                }),
              "打开企业所得税准备稿"
            )}
          </div>
        </div>
      )}

      {activeTab === "packages" && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>月结 / 审计 / 稽核资料包导出</h3>
          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                <span style={{ color: "#6c7a89" }}>月结期间</span>
                <input
                  type="month"
                  value={closingPeriod}
                  onChange={(event) => setClosingPeriod(event.target.value)}
                  style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
                />
              </label>
              {btnExport(
                () =>
                  void getClosingBundleHtml("month_end", closingPeriod).then((html) => {
                    rememberExport({
                      kind: "package",
                      label: `月结资料包 ${closingPeriod}`,
                      fileName: buildExportFileName(["月结资料包", closingPeriod]),
                      resourceType: "closing_bundle",
                      resourceId: `month_end:${closingPeriod}`,
                      periodLabel: closingPeriod
                    });
                    openHtmlPreview(`月结资料包 ${closingPeriod}`, html);
                  }),
                "打开月结资料包"
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                <span style={{ color: "#6c7a89" }}>审计 / 稽核期间</span>
                <input
                  value={inspectionPeriod}
                  onChange={(event) => setInspectionPeriod(event.target.value)}
                  style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
                  placeholder="例如 2026-Q2"
                />
              </label>
              {btnExport(
                () =>
                  void getClosingBundleHtml("audit", inspectionPeriod).then((html) => {
                    rememberExport({
                      kind: "package",
                      label: `审计资料包 ${inspectionPeriod}`,
                      fileName: buildExportFileName(["审计资料包", inspectionPeriod]),
                      resourceType: "closing_bundle",
                      resourceId: `audit:${inspectionPeriod}`,
                      periodLabel: inspectionPeriod
                    });
                    openHtmlPreview(`审计资料包 ${inspectionPeriod}`, html);
                  }),
                "打开审计资料包"
              )}
              {btnExport(
                () =>
                  void getClosingBundleHtml("inspection", inspectionPeriod).then((html) => {
                    rememberExport({
                      kind: "package",
                      label: `稽核资料包 ${inspectionPeriod}`,
                      fileName: buildExportFileName(["稽核资料包", inspectionPeriod]),
                      resourceType: "closing_bundle",
                      resourceId: `inspection:${inspectionPeriod}`,
                      periodLabel: inspectionPeriod
                    });
                    openHtmlPreview(`稽核资料包 ${inspectionPeriod}`, html);
                  }),
                "打开稽核资料包"
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div style={panelStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "15px" }}>单据正式模板导出</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "#6c7a89" }}>已选 {selectedDocumentIds.length} 项</span>
              <button
                disabled={selectedDocumentIds.length === 0}
                onClick={() => {
                  selectedDocumentIds.forEach((id) => {
                    const document = documents.find((item) => item.id === id);
                    if (document) {
                      void openDocumentTemplate(document);
                    }
                  });
                }}
                style={{ ...batchButtonStyle, opacity: selectedDocumentIds.length ? 1 : 0.5 }}
              >
                批量打开
              </button>
            </div>
          </div>
          {documents.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无单据数据</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["选择", "单据名称", "类型", "状态", "事项", "建议文件名", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td style={cellStyle()}>
                      <input
                        type="checkbox"
                        checked={selectedDocumentIds.includes(document.id)}
                        onChange={() => toggleSelection(document.id, setSelectedDocumentIds)}
                      />
                    </td>
                    <td style={cellStyle()}>{document.title}</td>
                    <td style={cellStyle()}>{document.documentType}</td>
                    <td style={cellStyle()}>{document.status}</td>
                    <td style={cellStyle()}>{document.businessEventId}</td>
                    <td style={cellStyle()}>
                      {buildExportFileName([document.title, document.documentType, document.businessEventId])}
                    </td>
                    <td style={cellStyle()}>
                      {btnExport(
                        () => void openDocumentTemplate(document),
                        "打开单据模板"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "risk" && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>风险复盘导出</h3>
          {findings.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无风险发现</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["规则", "优先级", "事项", "标题", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {findings.map((finding) => (
                  <tr key={finding.id}>
                    <td style={cellStyle()}>{finding.ruleCode}</td>
                    <td style={cellStyle()}>{finding.priority || "—"}</td>
                    <td style={cellStyle()}>{finding.businessEventId || "—"}</td>
                    <td style={cellStyle()}>{finding.title}</td>
                    <td style={cellStyle()}>
                      {btnExport(
                        () =>
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
                          }),
                        "打开复盘记录"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "rnd" && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>研发资料包导出</h3>
          {rndProjects.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无研发项目</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["项目", "编号", "费用化", "资本化", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rndProjects.map((project) => (
                  <tr key={project.id}>
                    <td style={cellStyle()}>{project.name}</td>
                    <td style={cellStyle()}>{project.code}</td>
                    <td style={cellStyle()}>{project.summary.expenseAmount}</td>
                    <td style={cellStyle()}>{project.summary.capitalizedAmount}</td>
                    <td style={cellStyle()}>
                      {btnExport(
                        () =>
                          void Promise.all([
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
                          }),
                        "打开研发资料包"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 凭证导出 ── */}
      {activeTab === "vouchers" && (
        <div style={panelStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "15px" }}>凭证导出（最近 50 条）</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "#6c7a89" }}>已选 {selectedVoucherIds.length} 项</span>
              <button
                disabled={selectedVoucherIds.length === 0}
                onClick={() => selectedVoucherIds.forEach((id) => openVoucherPdf(id))}
                style={{ ...batchButtonStyle, opacity: selectedVoucherIds.length ? 1 : 0.5 }}
              >
                批量打开
              </button>
            </div>
          </div>
          {vouchers.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无凭证数据</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["选择", "凭证编号", "类型", "摘要", "状态", "建议文件名", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td style={cellStyle()}>
                      <input
                        type="checkbox"
                        checked={selectedVoucherIds.includes(v.id)}
                        onChange={() => toggleSelection(v.id, setSelectedVoucherIds)}
                      />
                    </td>
                    <td style={cellStyle()}>{v.id.slice(-8).toUpperCase()}</td>
                    <td style={cellStyle()}>{v.voucherType}</td>
                    <td style={cellStyle()}>{v.summary}</td>
                    <td style={cellStyle()}>{v.status}</td>
                    <td style={cellStyle()}>
                      {buildExportFileName(["凭证", v.id.slice(-8).toUpperCase(), v.voucherType])}
                    </td>
                    <td style={cellStyle()}>
                      {btnExport(() => openVoucherPdf(v.id))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
