import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GeneratedDocument, Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import {
  archiveDocument,
  getDocumentDetail,
  listDocuments,
  listTasks,
  listTaxItems,
  listVouchers,
  uploadDocumentFileRaw,
  type DocumentDetail
} from "../lib/api";
import { useI18n, DOC_STATUS_LABELS, DOC_TYPE_LABELS } from "../lib/i18n";
import { ProcessFlowStageSection } from "../features/process-flow/ProcessFlowStageSection";
import { resolveProcessFlowContext } from "../features/process-flow/resolve";
import {
  buildDocumentRelations,
  buildPrintableDocumentHtml,
  supportsPrintableDocument
} from "./document-relations";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";
const TOKEN_KEY = "finance-taxation-v2-token";

const STATUS_COLOR: Record<string, string> = {
  draft: "#8a9bb0",
  awaiting_upload: "#d97706",
  under_review: "#2563eb",
  approved: "#1a7f5a",
  archived: "#6b7280"
};

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "620px", width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>单据中心 · 业务关系与操作说明</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(79,142,247,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(79,142,247,0.18)" }}>
            <strong>三个中心的关系</strong><br />
            <strong>任务中心</strong>负责告诉谁去做、先做什么；<strong>单据中心</strong>负责沉淀原始资料、业务单据和附件；<strong>凭证中心</strong>负责把单据转成正式会计凭证并过账。标准顺序通常是：<strong>事项分析 → 任务分发 → 单据补齐 → 凭证审核过账</strong>。
          </div>
          <div><strong>标准业务流程</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>AI 财税秘书或经营事项页识别业务，自动生成任务</li>
              <li>任务中心分配给财务、业务、行政或税务岗位执行</li>
              <li>单据中心补齐发票、回单、审批单、附件索引等资料</li>
              <li>凭证中心根据单据生成和审核记账凭证</li>
              <li>过账后进入总账、报表、税务和归档流程</li>
            </ol>
          </div>
          <div><strong>单据中心负责什么</strong>
            <div>这里重点管理“原始业务资料是否齐全”。包括发票、付款凭证、合同、审批单、附件索引、验收或招待说明等。单据完整，凭证才有依据，税务和审计才可追溯。</div>
          </div>
          <div><strong>本页常见操作</strong>
            <div>1. 在左侧选择单据；2. 在右侧查看正式单据内容；3. 上传附件；4. 下载已归档附件；5. 单据资料完整后执行归档。</div>
          </div>
          <div style={{ background: "rgba(255,165,0,0.08)", borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px", color: "#b45309" }}>
            ⚠️ 如果单据缺资料，不建议直接推进凭证过账。应先回到任务中心或事项页补齐责任人和附件要求。
          </div>
        </div>
      </div>
    </div>
  );
}

function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

export function DocumentsPage() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const navEventId = (location.state as { businessEventId?: string } | null)?.businessEventId ?? null;
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [relatedTasks, setRelatedTasks] = useState<(Task & { isOverdue?: boolean })[]>([]);
  const [relatedTaxItems, setRelatedTaxItems] = useState<TaxItem[]>([]);
  const [relatedVouchers, setRelatedVouchers] = useState<Voucher[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [message, setMessage] = useState("正在加载单据数据...");
  const [uploading, setUploading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function loadRelations(businessEventId: string | null) {
    if (!businessEventId) {
      setRelatedTasks([]);
      setRelatedTaxItems([]);
      setRelatedVouchers([]);
      return;
    }
    const [tasksPayload, taxPayload, voucherPayload] = await Promise.all([
      listTasks(businessEventId),
      listTaxItems({ businessEventId }),
      listVouchers({ businessEventId })
    ]);
    setRelatedTasks(tasksPayload.items);
    setRelatedTaxItems(taxPayload.items);
    setRelatedVouchers(voucherPayload.items);
  }

  async function bootstrap() {
    try {
      const [docsPayload, vouchersPayload] = await Promise.all([
        listDocuments(),
        listVouchers()
      ]);
      setDocuments(docsPayload.items);
      setVouchers(vouchersPayload.items);
      const linkedId = navEventId
        ? docsPayload.items.find((d) => d.businessEventId === navEventId)?.id ?? null
        : null;
      const targetId = linkedId ?? docsPayload.items[0]?.id ?? null;
      setSelectedDocumentId(targetId);
      if (targetId) {
        const nextDetail = await getDocumentDetail(targetId);
        setDetail(nextDetail);
        await loadRelations(nextDetail.businessEventId);
      } else {
        await loadRelations(null);
      }
      setMessage(`已加载 ${docsPayload.total} 个单据。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function refreshListAndDetail(documentId?: string) {
    const payload = await listDocuments();
    setDocuments(payload.items);
    const targetId = documentId ?? selectedDocumentId ?? payload.items[0]?.id ?? null;
    setSelectedDocumentId(targetId);
    if (targetId) {
      const nextDetail = await getDocumentDetail(targetId);
      setDetail(nextDetail);
      await loadRelations(nextDetail.businessEventId);
    } else {
      setDetail(null);
      await loadRelations(null);
    }
  }

  async function handleSelectDocument(docId: string) {
    setSelectedDocumentId(docId);
    const nextDetail = await getDocumentDetail(docId);
    setDetail(nextDetail);
    await loadRelations(nextDetail.businessEventId);
  }

  async function handleUploadFile(file: File) {
    if (!detail) return;
    if (file.size > 20 * 1024 * 1024) {
      setMessage("文件过大（最大 20MB）");
      return;
    }
    setUploading(true);
    setMessage(`正在上传 ${file.name}...`);
    try {
      await uploadDocumentFileRaw(detail.id, file);
      await refreshListAndDetail(detail.id);
      setMessage(`附件「${file.name}」已上传并挂载到单据。`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleArchive() {
    if (!detail) return;
    await archiveDocument(detail.id);
    await refreshListAndDetail(detail.id);
    setMessage(`单据已归档。`);
  }

  async function handleDownload(attachmentId: string, fileName: string) {
    const token = window.localStorage.getItem(TOKEN_KEY) ?? "";
    const resp = await fetch(`${API_BASE_URL}/api/attachments/${attachmentId}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) { setMessage("下载失败"); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handlePrintDocument() {
    if (!detail) return;
    const html = buildPrintableDocumentHtml({
      document: detail,
      tasks: relatedTasks,
      taxItems: relatedTaxItems,
      vouchers: relatedVouchers
    });
    const printableWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printableWindow) {
      setMessage("无法打开打印窗口");
      return;
    }
    printableWindow.document.open();
    printableWindow.document.write(html);
    printableWindow.document.close();
    setMessage(`已打开「${detail.title}」打印版。`);
  }

  const documentFlowContext = useMemo(() => {
    if (!detail) {
      return null;
    }

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

  const panelStyle = {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "20px"
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {showHelp && <DocumentsHelpModal onClose={() => setShowHelp(false)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>单据中心</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
        </div>
        <button onClick={() => setShowHelp(true)} title="业务说明" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>?</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px", alignItems: "start" }}>
        {/* Document list */}
        <div style={panelStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>单据列表</h3>
          {documents.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px 0", fontSize: "13px" }}>
              暂无单据数据
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["名称", "类型", "关联事项", "凭证", "状态", "附件"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((item) => {
                  const rowRelatedVouchers = vouchers.filter((v) => v.businessEventId === item.businessEventId);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => void handleSelectDocument(item.id)}
                      style={{
                        cursor: "pointer",
                        background: item.id === selectedDocumentId ? "rgba(30,42,55,0.06)" : "transparent"
                      }}
                    >
                      <td style={cellStyle()}>
                        <div style={{ fontWeight: item.id === selectedDocumentId ? 600 : 400 }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: "11px", color: "#9aa5b4", marginTop: "2px" }}>
                          {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                        </div>
                      </td>
                      <td style={cellStyle()}>{t(DOC_TYPE_LABELS, item.documentType)}</td>
                      <td style={cellStyle()}>
                        {item.businessEventId ? (
                          <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4f8ef7", background: "rgba(79,142,247,0.08)", borderRadius: "4px", padding: "1px 5px" }}>
                            {shortId(item.businessEventId)}
                          </span>
                        ) : (
                          <span style={{ color: "#c4cdd6", fontSize: "12px" }}>—</span>
                        )}
                      </td>
                      <td style={{ ...cellStyle(), textAlign: "center" as const }}>
                        {rowRelatedVouchers.length > 0 ? (
                          <span style={{ color: "#1a7f5a", fontWeight: 600, fontSize: "12px" }}>
                            {rowRelatedVouchers.length}张
                          </span>
                        ) : (
                          <span style={{ color: "#c4cdd6", fontSize: "12px" }}>—</span>
                        )}
                      </td>
                      <td style={cellStyle()}>
                        <span style={{
                          background: `${STATUS_COLOR[item.status] ?? "#8a9bb0"}22`,
                          color: STATUS_COLOR[item.status] ?? "#8a9bb0",
                          borderRadius: "999px", padding: "2px 8px", fontSize: "12px"
                        }}>
                          {t(DOC_STATUS_LABELS, item.status)}
                        </span>
                      </td>
                      <td style={{ ...cellStyle(), textAlign: "center" as const }}>
                        {item.attachmentIds.length > 0 ? (
                          <span style={{ color: "#1a7f5a", fontWeight: 600 }}>
                            {item.attachmentIds.length}
                          </span>
                        ) : (
                          <span style={{ color: "#d97706", fontSize: "12px" }}>待上传</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Document detail - formal document format */}
        <div style={panelStyle}>
          {detail ? (
            <>
              <div style={{ marginBottom: "16px" }}>
                <ProcessFlowStageSection
                  title="单据阶段流程回看"
                  subtitle="当前页定位到单据生成或归档节点。若已关联具体事项，则会尽量使用该事项上下文高亮分支。"
                  currentNodeId={documentFlowContext?.currentNodeId ?? "document_generation"}
                  branch={documentFlowContext?.branch}
                  businessEventId={detail.businessEventId}
                />
              </div>

              {/* 正式单据头部 */}
              <div style={{
                border: "1.5px solid rgba(20,40,60,0.18)", borderRadius: "10px",
                padding: "18px 20px", background: "#fff", marginBottom: "16px"
              }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px", gap: "8px" }}>
                  {supportsPrintableDocument(detail.documentType) && (
                    <button
                      onClick={handlePrintDocument}
                      style={{ background: "#1e2a37", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontSize: "12px" }}
                    >
                      打印单据
                    </button>
                  )}
                </div>
                <div style={{ textAlign: "center", marginBottom: "14px", borderBottom: "1.5px solid rgba(20,40,60,0.12)", paddingBottom: "12px" }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "2px" }}>{detail.title}</div>
                  <div style={{ fontSize: "12px", color: "#6c7a89", marginTop: "4px" }}>
                    {t(DOC_TYPE_LABELS, detail.documentType)}
                  </div>
                </div>

                {/* 基本信息表格 */}
                {(() => {
                  const relations = buildDocumentRelations({
                    document: detail,
                    tasks: relatedTasks,
                    taxItems: relatedTaxItems,
                    vouchers: relatedVouchers
                  });
                  const rows: [string, React.ReactNode][] = [
                    ["单据编号", `DOC-${shortId(detail.id)}`],
                    ["单据类型", t(DOC_TYPE_LABELS, detail.documentType)],
                    ["当前状态", t(DOC_STATUS_LABELS, detail.status)],
                    ["责任部门", detail.ownerDepartment || "—"],
                    ["关联事项", detail.businessEventId
                      ? <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4f8ef7" }}>{shortId(detail.businessEventId)}</span>
                      : "—"
                    ],
                    ["关联任务", relations.tasks.length > 0
                      ? <span style={{ color: "#2563eb" }}>{relations.tasks.length} 个</span>
                      : <span style={{ color: "#c4cdd6" }}>暂无任务</span>
                    ],
                    ["关联税务", relations.taxItems.length > 0
                      ? <span style={{ color: "#d97706" }}>{relations.taxItems.length} 条</span>
                      : <span style={{ color: "#c4cdd6" }}>暂无税务事项</span>
                    ],
                    ["关联凭证", relations.vouchers.length > 0
                      ? <span style={{ color: "#1a7f5a" }}>{relations.vouchers.length} 张（{relations.vouchers.map((v) => `V-${shortId(v.id)}`).join("、")}）</span>
                      : <span style={{ color: "#c4cdd6" }}>暂无凭证</span>
                    ],
                    ["创建日期", detail.createdAt?.slice(0, 10) ?? "—"],
                    ...(detail.archivedAt ? [["归档日期", detail.archivedAt.slice(0, 10)] as [string, React.ReactNode]] : [])
                  ];
                  return (
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
                  );
                })()}

                {/* 单据说明/备注 */}
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
              </div>

              <div style={{ marginBottom: "16px", display: "grid", gap: "12px" }}>
                <div style={{ border: "1px solid rgba(20,40,60,0.08)", borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4 style={{ margin: 0, fontSize: "13.5px" }}>关联任务</h4>
                    <button
                      onClick={() => navigate("/tasks", { state: { businessEventId: detail.businessEventId } })}
                      style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontSize: "12px", padding: 0 }}
                    >
                      查看任务中心
                    </button>
                  </div>
                  {relatedTasks.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.8, fontSize: "12.5px" }}>
                      {relatedTasks.map((task) => (
                        <li key={task.id}>
                          {task.title}｜{task.assigneeDepartment || "未分配"}｜{task.status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#9aa5b4", fontSize: "12px" }}>暂无关联任务</div>
                  )}
                </div>

                <div style={{ border: "1px solid rgba(20,40,60,0.08)", borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4 style={{ margin: 0, fontSize: "13.5px" }}>关联税务事项</h4>
                    <button
                      onClick={() => navigate("/tax", { state: { businessEventId: detail.businessEventId } })}
                      style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontSize: "12px", padding: 0 }}
                    >
                      查看税务中心
                    </button>
                  </div>
                  {relatedTaxItems.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.8, fontSize: "12.5px" }}>
                      {relatedTaxItems.map((item) => (
                        <li key={item.id}>
                          {item.taxType}｜{item.filingPeriod}｜{item.treatment}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#9aa5b4", fontSize: "12px" }}>暂无关联税务事项</div>
                  )}
                </div>

                <div style={{ border: "1px solid rgba(20,40,60,0.08)", borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4 style={{ margin: 0, fontSize: "13.5px" }}>关联凭证</h4>
                    <button
                      onClick={() => navigate("/vouchers", { state: { businessEventId: detail.businessEventId } })}
                      style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontSize: "12px", padding: 0 }}
                    >
                      查看凭证中心
                    </button>
                  </div>
                  {relatedVouchers.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.8, fontSize: "12.5px" }}>
                      {relatedVouchers.map((voucher) => (
                        <li key={voucher.id}>
                          V-{shortId(voucher.id)}｜{voucher.summary}｜{voucher.status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#9aa5b4", fontSize: "12px" }}>暂无关联凭证</div>
                  )}
                </div>
              </div>

              {/* 原始凭证附件 */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <h4 style={{ margin: 0, fontSize: "13.5px" }}>
                    原始凭证附件 <span style={{ color: "#9aa5b4", fontWeight: 400 }}>({detail.attachments.length})</span>
                  </h4>
                  <label style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    padding: "5px 12px", borderRadius: "6px", fontSize: "12px",
                    background: uploading ? "#eef0f3" : "#1e2a37",
                    color: uploading ? "#9aa5b4" : "#fff",
                    cursor: uploading ? "default" : "pointer", border: "none"
                  }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadFile(file);
                      }}
                    />
                    {uploading ? "上传中..." : "+ 上传附件"}
                  </label>
                </div>

                {detail.attachments.length === 0 ? (
                  <div style={{
                    border: "1px dashed rgba(217,119,6,0.4)", borderRadius: "8px",
                    padding: "12px", fontSize: "12px", color: "#92400e",
                    background: "rgba(255,249,235,0.6)"
                  }}>
                    📎 尚无附件。请上传发票、收据或银行流水（图片/PDF，最大 20MB）。
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {detail.attachments.map((att) => (
                      <div key={att.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 10px", borderRadius: "8px",
                        background: "rgba(26,127,90,0.05)", border: "1px solid rgba(26,127,90,0.12)",
                        fontSize: "12px"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                          <span>{att.fileType?.includes("pdf") ? "📄" : "🖼"}</span>
                          <span style={{ color: "#1e2a37", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {att.fileName}
                          </span>
                          <span style={{ color: "#9aa5b4", flexShrink: 0 }}>{formatFileSize(att.fileSize)}</span>
                        </div>
                        <button
                          onClick={() => void handleDownload(att.id, att.fileName)}
                          style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontSize: "12px", flexShrink: 0, marginLeft: "8px", padding: 0 }}
                        >下载</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.status !== "archived" && (
                <button
                  onClick={() => void handleArchive()}
                  style={{ background: "#eef0f3", color: "#6c7a89", border: "none", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontSize: "12px" }}
                >归档</button>
              )}
            </>
          ) : (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "40px 0", fontSize: "13px" }}>
              点击左侧单据查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
