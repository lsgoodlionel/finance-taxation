import { type RefObject } from "react";
import type { DocumentDetail } from "../../lib/api";
import { formatFileSize } from "./documents-helpers";

type DocumentAttachmentsProps = {
  attachments: DocumentDetail["attachments"];
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onUpload: (file: File) => void;
  onDownload: (attachmentId: string, fileName: string) => void;
};

export function DocumentAttachments({
  attachments,
  uploading,
  fileInputRef,
  onUpload,
  onDownload
}: DocumentAttachmentsProps) {
  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0, fontSize: "13.5px" }}>
          原始凭证附件 <span style={{ color: "#9aa5b4", fontWeight: 400 }}>({attachments.length})</span>
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
              if (file) onUpload(file);
            }}
          />
          {uploading ? "上传中..." : "+ 上传附件"}
        </label>
      </div>

      {attachments.length === 0 ? (
        <div style={{
          border: "1px dashed rgba(217,119,6,0.4)", borderRadius: "8px",
          padding: "12px", fontSize: "12px", color: "#92400e",
          background: "rgba(255,249,235,0.6)"
        }}>
          📎 尚无附件。请上传发票、收据或银行流水（图片/PDF，最大 20MB）。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {attachments.map((att) => (
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
                onClick={() => onDownload(att.id, att.fileName)}
                style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontSize: "12px", flexShrink: 0, marginLeft: "8px", padding: 0 }}
              >下载</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
