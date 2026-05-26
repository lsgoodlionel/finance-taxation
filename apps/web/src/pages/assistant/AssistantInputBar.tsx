import React from "react";

type AssistantInputBarProps = {
  disabled: boolean;
  input: string;
  isOperationMode: boolean;
  ocrLoading: boolean;
  sending: boolean;
  fileInputRef: React.Ref<HTMLInputElement>;
  onChange(value: string): void;
  onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void;
  onSend(): void;
  onPickFile(file: File): void;
};

export function AssistantInputBar({
  disabled,
  input,
  isOperationMode,
  ocrLoading,
  sending,
  fileInputRef,
  onChange,
  onKeyDown,
  onSend,
  onPickFile
}: AssistantInputBarProps) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.82)",
      borderRadius: "24px",
      border: "1px solid rgba(20,40,60,0.08)",
      padding: "12px 16px",
      display: "flex",
      gap: "10px",
      alignItems: "flex-end"
    }}>
      {isOperationMode && (
        <label
          title="上传发票/回单/收据（PDF 直接识别，支持图片格式）"
          style={{
            flexShrink: 0, width: "38px", height: "38px", display: "flex",
            alignItems: "center", justifyContent: "center",
            borderRadius: "10px", cursor: ocrLoading ? "default" : "pointer",
            background: ocrLoading ? "#eef0f3" : "rgba(255,255,255,0.9)",
            border: "1px solid rgba(20,40,60,0.12)",
            fontSize: "18px", opacity: ocrLoading ? 0.5 : 1
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: "none" }}
            disabled={ocrLoading || sending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onPickFile(file);
            }}
          />
          {ocrLoading ? "⏳" : "📎"}
        </label>
      )}
      <textarea
        value={input}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder={isOperationMode
          ? "描述经营事项、报销内容等，或点击 📎 上传凭证图片/PDF 直接识别（Enter 发送）"
          : "直接提问财务经营问题（Enter 发送，Shift+Enter 换行）"}
        disabled={disabled}
        style={{
          flex: 1, border: "1px solid rgba(20,40,60,0.12)", borderRadius: "12px",
          padding: "10px 14px", fontSize: "14px", resize: "none", outline: "none",
          fontFamily: "inherit", lineHeight: "1.5",
          background: disabled ? "#f8f9fa" : "#fff"
        }}
      />
      <button
        onClick={onSend}
        disabled={disabled || !input.trim()}
        style={{
          background: "#1e2a37", color: "#fff", border: "none",
          borderRadius: "12px", padding: "10px 20px", cursor: "pointer",
          fontSize: "14px", flexShrink: 0,
          opacity: disabled || !input.trim() ? 0.5 : 1
        }}
      >
        {sending ? "发送中" : "发送"}
      </button>
    </div>
  );
}
