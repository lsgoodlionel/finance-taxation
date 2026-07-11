import React from "react";
import type { TaxFilingBatch } from "@finance-taxation/domain-model";
import type { WorkflowRunDetail } from "../../lib/api";
import { EmptyState } from "../../components/ui/EmptyState";
import { useI18n, REVIEW_RESULT_LABELS, TAX_BATCH_STATUS_LABELS, TAX_STATUS_LABELS } from "../../lib/i18n";
import type { TaxBatchDetail } from "./taxTypes";
import { actionButtonStyle, cellStyle, panelStyle } from "./taxStyles";

type ValidationResult = { valid: boolean; issues: string[]; itemCount: number } | null;

type TaxBatchesPanelProps = {
  batches: TaxFilingBatch[];
  selectedBatchId: string | null;
  selectedBatchDetail: TaxBatchDetail | null;
  runtimeDetail?: WorkflowRunDetail | null;
  validation: ValidationResult;
  reviewForm: {
    reviewResult: "approved" | "rejected";
    reviewNotes: string;
  };
  archiveForm: {
    archiveLabel: string;
    archiveNotes: string;
  };
  onSelectBatch: (batchId: string) => void;
  onReviewFormChange: (updater: (current: TaxBatchesPanelProps["reviewForm"]) => TaxBatchesPanelProps["reviewForm"]) => void;
  onArchiveFormChange: (updater: (current: TaxBatchesPanelProps["archiveForm"]) => TaxBatchesPanelProps["archiveForm"]) => void;
  onValidateBatch: () => void;
  onSubmitBatch: () => void;
  onReviewBatch: () => void;
  onArchiveBatch: () => void;
  onOpenEvent?: (businessEventId: string) => void;
  onOpenVoucherHub?: (businessEventId: string) => void;
  onOpenDocuments?: (businessEventId: string) => void;
  onOpenTaxItem?: (taxItemId: string) => void;
};

export function TaxBatchesPanel({
  batches,
  selectedBatchId,
  selectedBatchDetail,
  runtimeDetail,
  validation,
  reviewForm,
  archiveForm,
  onSelectBatch,
  onReviewFormChange,
  onArchiveFormChange,
  onValidateBatch,
  onSubmitBatch,
  onReviewBatch,
  onArchiveBatch,
  onOpenEvent,
  onOpenVoucherHub,
  onOpenDocuments,
  onOpenTaxItem
}: TaxBatchesPanelProps) {
  const { t } = useI18n();
  const readyCount = batches.filter((item) => item.status === "ready" || item.status === "review_required").length;
  const latestCommand = runtimeDetail?.commands[0] ?? null;

  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>申报批次列表</h3>
        <p style={{ margin: "0 0 12px", color: "#5c6b7a", lineHeight: 1.7 }}>
          用批次承接税务事项，固定复核、提交与留档顺序，避免把申报动作散落在不同材料块中。
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
          <span style={{ borderRadius: "999px", padding: "6px 10px", fontSize: "12px", background: "rgba(79,142,247,0.08)", color: "#2563eb" }}>
            批次数：{batches.length}
          </span>
          <span style={{ borderRadius: "999px", padding: "6px 10px", fontSize: "12px", background: "rgba(217,119,6,0.08)", color: "#b45309" }}>
            待处理：{readyCount}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>批次编号</th>
                <th style={cellStyle()}>税种</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>事项数</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onSelectBatch(item.id)}
                  style={{ cursor: "pointer", background: item.id === selectedBatchId ? "rgba(30,42,55,0.06)" : "transparent" }}
                >
                  <td style={cellStyle()}>{item.id}</td>
                  <td style={cellStyle()}>{item.taxType}</td>
                  <td style={cellStyle()}>{t(TAX_BATCH_STATUS_LABELS, item.status)}</td>
                  <td style={cellStyle()}>{item.itemIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>批次工作台</h3>
        {!selectedBatchDetail ? (
          <EmptyState title="请选择一个申报批次" description="选中批次后，可在这里完成校验、提交、复核和留档。" />
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gap: "4px" }}>
              <div>税种：{selectedBatchDetail.taxType}</div>
              <div>申报期：{selectedBatchDetail.filingPeriod}</div>
              <div>状态：{t(TAX_BATCH_STATUS_LABELS, selectedBatchDetail.status)}</div>
            </div>
            {runtimeDetail?.run.blockedReason ? (
              <div style={{ borderRadius: "12px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.16)", padding: "12px 14px", color: "#991b1b" }}>
                阻塞原因：{runtimeDetail.run.blockedReason}
              </div>
            ) : null}
            {latestCommand?.lastErrorDetail || runtimeDetail?.compensations.length ? (
              <div style={{ borderRadius: "12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.16)", padding: "12px 14px", color: "#92400e" }}>
                <div>最近运行：{latestCommand?.lastErrorDetail || "已进入人工补偿处理"}</div>
                <div style={{ marginTop: 4 }}>补偿记录：{runtimeDetail?.compensations.length ?? 0} 条</div>
              </div>
            ) : null}
            {selectedBatchDetail.items[0]?.businessEventId ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button onClick={() => onOpenEvent?.(selectedBatchDetail.items[0]!.businessEventId)} style={actionButtonStyle()}>
                  查看事项
                </button>
                <button onClick={() => onOpenDocuments?.(selectedBatchDetail.items[0]!.businessEventId)} style={actionButtonStyle()}>
                  查看单据
                </button>
                <button onClick={() => onOpenVoucherHub?.(selectedBatchDetail.items[0]!.businessEventId)} style={actionButtonStyle()}>
                  查看凭证
                </button>
                <button onClick={() => onOpenTaxItem?.(selectedBatchDetail.items[0]!.id)} style={actionButtonStyle()}>
                  定位税项
                </button>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={onValidateBatch} style={actionButtonStyle()}>校验批次</button>
              <button onClick={onSubmitBatch} style={actionButtonStyle("primary")}>提交批次</button>
              <button onClick={onReviewBatch} style={actionButtonStyle()}>保存复核</button>
              <button onClick={onArchiveBatch} style={actionButtonStyle()}>留档批次</button>
            </div>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div style={{ display: "grid", gap: "8px" }}>
                <select
                  value={reviewForm.reviewResult}
                  onChange={(event) =>
                    onReviewFormChange((current) => ({
                      ...current,
                      reviewResult: event.target.value as "approved" | "rejected"
                    }))
                  }
                >
                  <option value="approved">审核通过</option>
                  <option value="rejected">审核驳回</option>
                </select>
                <input
                  value={reviewForm.reviewNotes}
                  onChange={(event) => onReviewFormChange((current) => ({ ...current, reviewNotes: event.target.value }))}
                  placeholder="复核说明"
                />
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                <input
                  value={archiveForm.archiveLabel}
                  onChange={(event) => onArchiveFormChange((current) => ({ ...current, archiveLabel: event.target.value }))}
                  placeholder="留档标签，如 2026Q2-VAT"
                />
                <input
                  value={archiveForm.archiveNotes}
                  onChange={(event) => onArchiveFormChange((current) => ({ ...current, archiveNotes: event.target.value }))}
                  placeholder="留档说明"
                />
              </div>
            </section>
            {validation ? (
              <div style={{ borderRadius: "12px", background: validation.valid ? "rgba(16,185,129,0.08)" : "rgba(220,38,38,0.08)", border: `1px solid ${validation.valid ? "rgba(16,185,129,0.16)" : "rgba(220,38,38,0.16)"}`, padding: "12px 14px" }}>
                <div>校验结果：{validation.valid ? "通过" : "未通过"}</div>
                {validation.issues.length ? (
                  <ul style={{ paddingLeft: "22px", lineHeight: 1.8, marginBottom: 0 }}>
                    {validation.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div>
              <h4 style={{ marginBottom: "8px" }}>批次事项</h4>
              <ul style={{ paddingLeft: "22px", lineHeight: 1.8, margin: 0 }}>
                {selectedBatchDetail.items.map((item) => (
                  <li key={item.id}>
                    {item.taxType} | {item.filingPeriod} | {t(TAX_STATUS_LABELS, item.status)} | {item.treatment}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 style={{ marginBottom: "8px" }}>复核记录</h4>
              {selectedBatchDetail.reviews.length ? (
                <ul style={{ paddingLeft: "22px", lineHeight: 1.8, margin: 0 }}>
                  {selectedBatchDetail.reviews.map((item) => (
                    <li key={item.id}>
                      {item.reviewedAt.slice(0, 10)} | {item.reviewedByName} | {t(REVIEW_RESULT_LABELS, item.reviewResult)} | {item.reviewNotes}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: "#6c7a89" }}>暂无复核记录。</p>
              )}
            </div>
            <div>
              <h4 style={{ marginBottom: "8px" }}>留档记录</h4>
              {selectedBatchDetail.archives.length ? (
                <ul style={{ paddingLeft: "22px", lineHeight: 1.8, margin: 0 }}>
                  {selectedBatchDetail.archives.map((item) => (
                    <li key={item.id}>
                      {item.archivedAt.slice(0, 10)} | {item.archiveLabel} | {item.archivedByName} | {item.archiveNotes || "—"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: "#6c7a89" }}>暂无留档记录。</p>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
