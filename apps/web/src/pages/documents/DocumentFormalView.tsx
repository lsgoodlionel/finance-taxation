import React from "react";
import type { Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import type { DocumentDetail } from "../../lib/api";
import { useI18n, DOC_STATUS_LABELS, DOC_TYPE_LABELS } from "../../lib/i18n";
import { buildDocumentRelations, type ExpenseDocumentTemplateModel } from "../document-relations";
import { ExpenseClaimTemplate } from "../document-templates/ExpenseClaimTemplate";
import { InvoiceBundleTemplate } from "../document-templates/InvoiceBundleTemplate";
import { shortId } from "./documents-helpers";

export type ExpenseTemplateDetail = {
  templateKind: string;
  model: ExpenseDocumentTemplateModel;
};

type DocumentFormalViewProps = {
  detail: DocumentDetail;
  tasks: (Task & { isOverdue?: boolean })[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
  expenseTemplate: ExpenseTemplateDetail | null;
  onPrint: () => void;
};

export function DocumentFormalView({
  detail,
  tasks,
  taxItems,
  vouchers,
  expenseTemplate,
  onPrint
}: DocumentFormalViewProps) {
  const { t } = useI18n();

  return (
    <div style={{ border: "1.5px solid rgba(20,40,60,0.18)", borderRadius: "10px", padding: "18px 20px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px", gap: "8px" }}>
        {expenseTemplate && (
          <button
            onClick={onPrint}
            style={{ background: "#1e2a37", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontSize: "12px" }}
          >
            打印单据
          </button>
        )}
      </div>
      <div style={{ textAlign: "center", marginBottom: "14px", borderBottom: "1.5px solid rgba(20,40,60,0.12)", paddingBottom: "12px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "2px" }}>{detail.title}</div>
        <div style={{ fontSize: "12px", color: "#6c7a89", marginTop: "4px" }}>{t(DOC_TYPE_LABELS, detail.documentType)}</div>
      </div>

      {expenseTemplate ? (
        expenseTemplate.templateKind === "invoice_bundle" ? (
          <InvoiceBundleTemplate model={expenseTemplate.model} mode="screen" />
        ) : (
          <ExpenseClaimTemplate model={expenseTemplate.model} mode="screen" />
        )
      ) : (
        <BasicInfoView detail={detail} tasks={tasks} taxItems={taxItems} vouchers={vouchers} t={t} />
      )}
    </div>
  );
}

function BasicInfoView({
  detail,
  tasks,
  taxItems,
  vouchers,
  t
}: {
  detail: DocumentDetail;
  tasks: (Task & { isOverdue?: boolean })[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
  t: (labels: Record<string, string>, key: string) => string;
}) {
  const relations = buildDocumentRelations({ document: detail, tasks, taxItems, vouchers });
  const rows: [string, React.ReactNode][] = [
    ["单据编号", `DOC-${shortId(detail.id)}`],
    ["单据类型", t(DOC_TYPE_LABELS, detail.documentType)],
    ["当前状态", t(DOC_STATUS_LABELS, detail.status)],
    ["责任部门", detail.ownerDepartment || "—"],
    ["关联事项", detail.businessEventId
      ? <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4f8ef7" }}>{shortId(detail.businessEventId)}</span>
      : "—"],
    ["关联任务", relations.tasks.length > 0
      ? <span style={{ color: "#2563eb" }}>{relations.tasks.length} 个</span>
      : <span style={{ color: "#c4cdd6" }}>暂无任务</span>],
    ["关联税务", relations.taxItems.length > 0
      ? <span style={{ color: "#d97706" }}>{relations.taxItems.length} 条</span>
      : <span style={{ color: "#c4cdd6" }}>暂无税务事项</span>],
    ["关联凭证", relations.vouchers.length > 0
      ? <span style={{ color: "#1a7f5a" }}>{relations.vouchers.length} 张（{relations.vouchers.map((v) => `V-${shortId(v.id)}`).join("、")}）</span>
      : <span style={{ color: "#c4cdd6" }}>暂无凭证</span>],
    ["创建日期", detail.createdAt?.slice(0, 10) ?? "—"],
    ...(detail.archivedAt ? [["归档日期", detail.archivedAt.slice(0, 10)] as [string, React.ReactNode]] : [])
  ];

  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} style={{ borderBottom: "1px solid rgba(20,40,60,0.06)" }}>
              <td style={{ padding: "7px 10px", color: "#6c7a89", width: "80px", fontWeight: 500, fontSize: "12.5px" }}>{label}</td>
              <td style={{ padding: "7px 10px" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail.notes && (
        <div style={{
          marginTop: "12px", padding: "10px 14px",
          background: "rgba(37,99,235,0.04)", borderRadius: "6px",
          borderLeft: "3px solid rgba(37,99,235,0.3)", fontSize: "13px",
          lineHeight: 1.7, color: "#1e2a37"
        }}>
          <div style={{ fontSize: "11.5px", color: "#6c7a89", marginBottom: "4px", fontWeight: 500 }}>单据说明</div>
          {detail.notes}
        </div>
      )}
    </>
  );
}
