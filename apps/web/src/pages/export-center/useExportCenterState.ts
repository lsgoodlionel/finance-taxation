import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import type {
  AuditLog,
  ExportArchiveEntry,
  ExportArtifactKind,
  ExportJob,
  GeneratedDocument,
  PayrollPeriodSummary,
  ReportSnapshot,
  RiskFinding,
  RndProject,
  RndProjectSummary,
  Voucher
} from "@finance-taxation/domain-model";
import {
  describePageLoadError,
  getArchivePackage,
  getPayrollPeriods,
  listExportArchiveEntries,
  listExportJobs,
  listAuditLogs,
  listDocuments,
  listRiskFindings,
  listRndProjects,
  listReportSnapshots,
  listVouchers,
  type ArchivePackage
} from "../../lib/api";
import { normalizeDrilldownState } from "../drilldown";
import { usePeriod } from "../../lib/period-context";

/**
 * 导出与归档中心的原始状态与数据加载逻辑：8 大导出场景所需的列表数据、
 * 期间输入、导出历史/归档索引/审计轨迹，以及按会计期间加载的财税资料包。
 */
export function useExportCenterState() {
  const location = useLocation();
  const navState = normalizeDrilldownState(location.state);
  const navExportJobId = navState.resourceType === "export_job" ? navState.resourceId ?? null : null;

  const { period } = usePeriod();

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
  const [message, setMessage] = useState("正在加载导出与归档中心...");
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportJob[]>([]);
  const [archiveEntries, setArchiveEntries] = useState<ExportArchiveEntry[]>([]);
  const [exportAuditLogs, setExportAuditLogs] = useState<AuditLog[]>([]);
  const [archiveKindFilter, setArchiveKindFilter] = useState<ExportArtifactKind | "">("");
  const [archiveKeyword, setArchiveKeyword] = useState("");

  const [archivePackage, setArchivePackage] = useState<ArchivePackage | null>(null);
  const [archivePackageLoading, setArchivePackageLoading] = useState(true);

  const loadArchivePackage = useCallback(async () => {
    setArchivePackageLoading(true);
    try {
      setArchivePackage(await getArchivePackage(period));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setArchivePackageLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void loadArchivePackage();
  }, [loadArchivePackage]);

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
        setMessage("这里是导出与归档中心，汇总工资、报表、税务底稿、资料包、单据、风险、研发和凭证的打印/导出入口。");
      } catch (error) {
        setMessage(describePageLoadError(error));
      }
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!navExportJobId) return;
    const matchedJob = exportHistory.find((item) => item.id === navExportJobId);
    setMessage(
      matchedJob
        ? `已从审计日志恢复到导出任务 ${matchedJob.label}。`
        : `已从审计日志恢复导出上下文，目标任务 ${navExportJobId}。`
    );
  }, [exportHistory, navExportJobId]);

  useEffect(() => {
    void listExportArchiveEntries(20, { kind: archiveKindFilter, keyword: archiveKeyword || undefined })
      .then((res) => setArchiveEntries(res.items))
      .catch(() => {});
  }, [archiveKindFilter, archiveKeyword]);

  return {
    period,
    archivePackage,
    archivePackageLoading,
    loadArchivePackage,
    periods,
    snapshots,
    vouchers,
    documents,
    findings,
    rndProjects,
    vatFilingPeriod,
    citFilingPeriod,
    closingPeriod,
    inspectionPeriod,
    setVatFilingPeriod,
    setCitFilingPeriod,
    setClosingPeriod,
    setInspectionPeriod,
    message,
    setMessage,
    selectedReportIds,
    setSelectedReportIds,
    selectedDocumentIds,
    setSelectedDocumentIds,
    selectedVoucherIds,
    setSelectedVoucherIds,
    exportHistory,
    setExportHistory,
    archiveEntries,
    setArchiveEntries,
    exportAuditLogs,
    setExportAuditLogs,
    archiveKindFilter,
    setArchiveKindFilter,
    archiveKeyword,
    setArchiveKeyword,
    navExportJobId
  };
}

export type ExportCenterState = ReturnType<typeof useExportCenterState>;
