import { type RefObject, useMemo } from "react";
import type { Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import type { DocumentDetail } from "../../lib/api";
import { ProcessFlowStageSection } from "../../features/process-flow/ProcessFlowStageSection";
import { resolveProcessFlowContext } from "../../features/process-flow/resolve";
import {
  buildExpenseDocumentTemplateModel,
  getExpenseDocumentTemplateKind
} from "../document-relations";
import { deriveContractRevenueDocumentGuidance } from "./contract-revenue-document-guidance";
import { derivePurchaseDocumentGuidance } from "./purchase-document-guidance";
import { deriveTravelDocumentGuidance } from "./travel-document-guidance";
import { DocumentFormalView, type ExpenseTemplateDetail } from "./DocumentFormalView";
import { DocumentRelationsPanel } from "./DocumentRelationsPanel";
import { DocumentAttachments } from "./DocumentAttachments";

type DocumentDetailPanelProps = {
  detail: DocumentDetail | null;
  tasks: (Task & { isOverdue?: boolean })[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onUpload: (file: File) => void;
  onDownload: (attachmentId: string, fileName: string) => void;
  onPrint: () => void;
  onArchive: () => void;
  onViewTasks: () => void;
  onViewTax: () => void;
  onViewVouchers: () => void;
};

export function DocumentDetailPanel({
  detail,
  tasks,
  taxItems,
  vouchers,
  uploading,
  fileInputRef,
  onUpload,
  onDownload,
  onPrint,
  onArchive,
  onViewTasks,
  onViewTax,
  onViewVouchers
}: DocumentDetailPanelProps) {
  const flowContext = useMemo(() => {
    if (!detail) return null;
    return resolveProcessFlowContext({
      event: {
        id: detail.businessEventId || detail.id,
        type: "general",
        title: detail.title,
        description: detail.notes,
        status: detail.status
      },
      detail: {
        tasks: detail.status === "draft" ? [] : [{ id: `${detail.id}-task-stage` }],
        generatedDocuments: [{ id: detail.id }],
        vouchers: [],
        taxItems: [],
        hasArchivedArtifacts: detail.status === "archived"
      }
    });
  }, [detail]);

  const expenseTemplate = useMemo<ExpenseTemplateDetail | null>(() => {
    if (!detail) return null;
    const templateKind = getExpenseDocumentTemplateKind(detail.documentType);
    if (!templateKind) return null;
    return {
      templateKind,
      model: buildExpenseDocumentTemplateModel({ document: detail, tasks, taxItems, vouchers })
    };
  }, [detail, tasks, taxItems, vouchers]);
  const purchaseGuidance = useMemo(
    () => derivePurchaseDocumentGuidance(detail, tasks, taxItems, vouchers),
    [detail, tasks, taxItems, vouchers]
  );
  const travelGuidance = useMemo(
    () => deriveTravelDocumentGuidance(detail, tasks, taxItems, vouchers),
    [detail, tasks, taxItems, vouchers]
  );
  const contractGuidance = useMemo(
    () => deriveContractRevenueDocumentGuidance(detail, tasks, taxItems, vouchers),
    [detail, tasks, taxItems, vouchers]
  );
  const workflowGuidance = purchaseGuidance ?? travelGuidance ?? contractGuidance;

  if (!detail) {
    return (
      <div style={{ color: "#aab5c0", textAlign: "center", padding: "40px 0", fontSize: "13px" }}>
        点击左侧单据查看详情
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {workflowGuidance && (
        <div
          style={{
            borderRadius: 14,
            border: workflowGuidance.tone === "error"
              ? "1px solid rgba(185,28,28,0.18)"
              : "1px solid rgba(217,119,6,0.18)",
            background: workflowGuidance.tone === "error"
              ? "rgba(254,242,242,0.92)"
              : "rgba(255,251,235,0.96)",
            padding: "14px 16px",
            display: "grid",
            gap: 6
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>{workflowGuidance.title}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>{workflowGuidance.message}</div>
        </div>
      )}

      <ProcessFlowStageSection
        title="单据阶段流程回看"
        subtitle="当前页定位到单据生成或归档节点。若已关联具体事项，则会尽量使用该事项上下文高亮分支。"
        currentNodeId={flowContext?.currentNodeId ?? "document_generation"}
        branch={flowContext?.branch}
        businessEventId={detail.businessEventId}
      />

      <DocumentFormalView
        detail={detail}
        tasks={tasks}
        taxItems={taxItems}
        vouchers={vouchers}
        expenseTemplate={expenseTemplate}
        onPrint={onPrint}
      />

      <DocumentRelationsPanel
        tasks={tasks}
        taxItems={taxItems}
        vouchers={vouchers}
        onViewTasks={onViewTasks}
        onViewTax={onViewTax}
        onViewVouchers={onViewVouchers}
      />

      <DocumentAttachments
        attachments={detail.attachments}
        uploading={uploading}
        fileInputRef={fileInputRef}
        onUpload={onUpload}
        onDownload={onDownload}
      />

      {detail.status !== "archived" && (
        <div>
          <button
            onClick={onArchive}
            style={{ background: "#eef0f3", color: "#6c7a89", border: "none", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontSize: "12px" }}
          >
            归档
          </button>
        </div>
      )}
    </div>
  );
}
