import React from "react";
import type { SessionMessage } from "../../lib/useChatSessions";
import { formatMessage } from "./message-utils";
import { panelBg } from "./styles";

interface AssistantChatMessagesProps {
  messages: SessionMessage[];
  showHistory: boolean;
  quickPrompts: string[];
  isOpMode: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
  onQuickPrompt: (prompt: string) => void;
}

export function AssistantChatMessages({
  messages,
  showHistory,
  quickPrompts,
  isOpMode,
  bottomRef,
  onQuickPrompt
}: AssistantChatMessagesProps) {
  return (
    <>
      {messages.length === 0 && !showHistory && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {quickPrompts.map((p) => (
            <button
              key={p}
              onClick={() => onQuickPrompt(p)}
              style={{
                padding: "8px 14px", borderRadius: "20px", fontSize: "13px",
                background: "rgba(255,255,255,0.82)", border: "1px solid rgba(20,40,60,0.1)",
                cursor: "pointer", color: "#1e2a37", textAlign: "left"
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div style={{ ...panelBg, flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#aab5c0", fontSize: "14px", marginTop: "60px" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>💬</div>
            <div>{isOpMode ? "描述您的经营事项或财税问题" : "直接提问财务经营问题"}</div>
            <div style={{ fontSize: "12px", marginTop: "6px" }}>
              {isOpMode
                ? "可文字描述，也可点击 📎 上传发票/回单/收据（支持 PDF 直接识别，无需转图）"
                : "我会基于实时财务数据给出简洁结论和行动建议"}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: "10px", alignItems: "flex-start" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
              background: msg.role === "user" ? "#1e2a37" : "#e8f4ef",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", color: msg.role === "user" ? "#fff" : "#1a7f5a"
            }}>
              {msg.role === "user" ? "我" : "AI"}
            </div>
            <div style={{
              maxWidth: "72%",
              background: msg.role === "user" ? "#1e2a37" : "rgba(255,255,255,0.9)",
              color: msg.role === "user" ? "#fff" : "#1e2a37",
              borderRadius: msg.role === "user" ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
              padding: "12px 16px", fontSize: "14px", lineHeight: "1.6",
              border: msg.role === "assistant" ? "1px solid rgba(20,40,60,0.08)" : "none"
            }}>
              {msg.content === "" ? (
                <span style={{ color: "#aab5c0", fontStyle: "italic" }}>正在思考...</span>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </>
  );
}
