import { useEffect, useState } from "react";
import type { GeneratedDocument } from "@finance-taxation/domain-model";
import {
  archiveDocument,
  attachDocumentFile,
  getDocumentDetail,
  listDocuments,
  login,
  refreshSession,
  type DocumentDetail
} from "../lib/api";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [message, setMessage] = useState("正在准备单据数据。");
  const [attachmentDraft, setAttachmentDraft] = useState("demo-receipt.pdf");

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        const payload = await listDocuments();
        setDocuments(payload.items);
        const first = payload.items[0]?.id || null;
        setSelectedDocumentId(first);
        if (first) {
          setDetail(await getDocumentDetail(first));
        }
        setMessage(`已加载 ${payload.total} 个单据对象。`);
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function refreshListAndDetail(documentId?: string) {
    const payload = await listDocuments();
    setDocuments(payload.items);
    const targetId = documentId || selectedDocumentId || payload.items[0]?.id || null;
    setSelectedDocumentId(targetId);
    if (targetId) {
      setDetail(await getDocumentDetail(targetId));
    }
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>单据中心占位页</h2>
        <p style={{ lineHeight: 1.8 }}>{message}</p>
      </article>
      <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>单据对象</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>编号</th>
                <th style={cellStyle()}>名称</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>附件数</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    setSelectedDocumentId(item.id);
                    void getDocumentDetail(item.id).then(setDetail);
                  }}
                  style={{
                    cursor: "pointer",
                    background: item.id === selectedDocumentId ? "rgba(30,42,55,0.06)" : "transparent"
                  }}
                >
                  <td style={cellStyle()}>{item.id}</td>
                  <td style={cellStyle()}>{item.title}</td>
                  <td style={cellStyle()}>{item.status}</td>
                  <td style={cellStyle()}>{item.attachmentIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>单据详情</h3>
          {detail ? (
            <>
              <p>{detail.title}</p>
              <p>类型：{detail.documentType}</p>
              <p>状态：{detail.status}</p>
              <p>责任部门：{detail.ownerDepartment}</p>
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <input
                  value={attachmentDraft}
                  onChange={(event) => setAttachmentDraft(event.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() =>
                    void attachDocumentFile(detail.id, attachmentDraft).then(async () => {
                      await refreshListAndDetail(detail.id);
                      setMessage(`已为 ${detail.id} 绑定附件 ${attachmentDraft}。`);
                    })
                  }
                >
                  绑定附件
                </button>
                <button
                  onClick={() =>
                    void archiveDocument(detail.id).then(async () => {
                      await refreshListAndDetail(detail.id);
                      setMessage(`已归档单据 ${detail.id}。`);
                    })
                  }
                >
                  归档
                </button>
              </div>
              <h4>附件记录</h4>
              <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                {detail.attachments.map((item) => (
                  <li key={item.id}>
                    {item.fileName} | {item.fileType} | {item.fileSize} bytes | {item.uploadedAt}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>请选择一条单据。</p>
          )}
        </article>
      </section>
    </section>
  );
}
