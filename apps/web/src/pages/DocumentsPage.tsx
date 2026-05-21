import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedDocument } from "@finance-taxation/domain-model";
import {
  archiveDocument,
  getDocumentDetail,
  listDocuments,
  uploadDocumentFileRaw,
  type DocumentDetail
} from "../lib/api";
import { useI18n, DOC_STATUS_LABELS, DOC_TYPE_LABELS } from "../lib/i18n";
import { ProcessFlowStageSection } from "../features/process-flow/ProcessFlowStageSection";
import { resolveProcessFlowContext } from "../features/process-flow/resolve";

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

export function DocumentsPage() {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [message, setMessage] = useState("正在加载单据数据...");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    try {
      const payload = await listDocuments();
      setDocuments(payload.items);
      const first = payload.items[0]?.id ?? null;
      setSelectedDocumentId(first);
      if (first) setDetail(await getDocumentDetail(first));
      setMessage(`已加载 ${payload.total} 个单据。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function refreshListAndDetail(documentId?: string) {
    const payload = await listDocuments();
    setDocuments(payload.items);
    const targetId = documentId ?? selectedDocumentId ?? payload.items[0]?.id ?? null;
    setSelectedDocumentId(targetId);
    if (targetId) setDetail(await getDocumentDetail(targetId));
  }

  async function handleSelectDocument(docId: string) {
    setSelectedDocumentId(docId);
    setDetail(await getDocumentDetail(docId));
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>单据中心</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
        </div>
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
                  {["名称", "类型", "状态", "附件"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((item) => (
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
                ))}
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
                <div style={{ textAlign: "center", marginBottom: "14px", borderBottom: "1.5px solid rgba(20,40,60,0.12)", paddingBottom: "12px" }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "2px" }}>{detail.title}</div>
                  <div style={{ fontSize: "12px", color: "#6c7a89", marginTop: "4px" }}>
                    {t(DOC_TYPE_LABELS, detail.documentType)}
                  </div>
                </div>

                {/* 基本信息表格 */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <tbody>
                    {[
                      ["单据编号", detail.id.slice(-12).toUpperCase()],
                      ["单据类型", t(DOC_TYPE_LABELS, detail.documentType)],
                      ["当前状态", t(DOC_STATUS_LABELS, detail.status)],
                      ["责任部门", detail.ownerDepartment || "—"],
                      ["关联事项", detail.businessEventId || "—"],
                      ["创建日期", detail.createdAt?.slice(0, 10) ?? "—"],
                      ...(detail.archivedAt ? [["归档日期", detail.archivedAt.slice(0, 10)]] : [])
                    ].map(([label, value]) => (
                      <tr key={label} style={{ borderBottom: "1px solid rgba(20,40,60,0.06)" }}>
                        <td style={{ padding: "7px 10px", color: "#6c7a89", width: "80px", fontWeight: 500, fontSize: "12.5px" }}>{label}</td>
                        <td style={{ padding: "7px 10px" }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

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
