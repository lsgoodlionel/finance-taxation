import React from "react";
import { panelBg } from "./styles";
import type { OcrPreview } from "./types";

interface AssistantOcrPreviewCardProps {
  ocrPreview: OcrPreview;
  onClear: () => void;
}

export function AssistantOcrPreviewCard({ ocrPreview, onClear }: AssistantOcrPreviewCardProps) {
  return (
    <div style={{
      ...panelBg, padding: "14px 16px",
      background: "rgba(240,247,255,0.95)",
      border: "1px solid rgba(79,142,247,0.25)",
      display: "flex", gap: "14px", alignItems: "flex-start"
    }}>
      {ocrPreview.isPdf ? (
        <div style={{
          width: "64px", height: "64px", borderRadius: "8px", flexShrink: 0,
          border: "1px solid rgba(20,40,60,0.1)", background: "#fff3f0",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          fontSize: "22px", gap: "2px"
        }}>
          📄
          <span style={{ fontSize: "9px", color: "#c0392b", fontWeight: 700 }}>PDF</span>
        </div>
      ) : (
        <img
          src={ocrPreview.previewUrl}
          alt="凭证预览"
          style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", flexShrink: 0, border: "1px solid rgba(20,40,60,0.1)" }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#4f8ef7", marginBottom: "4px" }}>
          {ocrPreview.isPdf ? "📄 PDF凭证已识别" : "📷 图片凭证已识别"} — 请确认内容后发送
        </div>
        <div style={{ fontSize: "12px", color: "#4d5d6c", lineHeight: "1.5", maxHeight: "48px", overflow: "hidden", textOverflow: "ellipsis" }}>
          {ocrPreview.recognizedText.split("\n").slice(0, 3).join(" · ")}
        </div>
        <div style={{ fontSize: "11px", color: "#1a7f5a", marginTop: "4px" }}>
          ✓ 确认创建经营事项后，此文件将自动挂载为原始凭证附件
        </div>
      </div>
      <button
        onClick={onClear}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#9aa5b4", fontSize: "16px", flexShrink: 0, padding: "0 4px" }}
        title="清除"
      >
        ✕
      </button>
    </div>
  );
}
