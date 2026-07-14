import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { ASSISTANT_ENTRY_SUBTITLE } from "../../lib/entry-guidance";
import type { AssistantUploadPhase } from "./types";

interface AssistantHeaderBarProps {
  sessionsCount: number;
  showHistory: boolean;
  onToggleHistory: () => void;
  onNewSession: () => void;
  isBoss: boolean;
  isOpMode: boolean;
  onToggleViewMode: () => void;
  status: string;
  uploadPhase: AssistantUploadPhase | null;
}

export function AssistantHeaderBar({
  sessionsCount,
  showHistory,
  onToggleHistory,
  onNewSession,
  isBoss,
  isOpMode,
  onToggleViewMode,
  status,
  uploadPhase
}: AssistantHeaderBarProps) {
  return (
    <>
      <PageHeader
        title="AI 财税助手"
        subtitle={ASSISTANT_ENTRY_SUBTITLE}
        actions={(
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={onToggleHistory}
              style={{
                background: showHistory ? "#1e2a37" : "#eef0f3",
                color: showHistory ? "#fff" : sessionsCount > 0 ? "#1e2a37" : "#bcc5ce",
                border: "none", borderRadius: "8px", padding: "6px 14px",
                cursor: sessionsCount > 0 ? "pointer" : "default", fontSize: "13px"
              }}
            >
              历史记录{sessionsCount > 0 ? ` (${sessionsCount})` : ""}
            </button>
            <button
              onClick={onNewSession}
              style={{
                background: "#eef0f3", color: "#1e2a37", border: "none",
                borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontSize: "13px"
              }}
            >
              + 新对话
            </button>
          </div>
        )}
      />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* View mode toggle — visible only to boss users */}
            {isBoss && (
              <button
                onClick={onToggleViewMode}
                title={isOpMode ? "切换到决策视角" : "切换到操作视角"}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "4px 12px", borderRadius: "20px", border: "none", cursor: "pointer",
                  fontWeight: 600, fontSize: "12px",
                  background: isOpMode ? "rgba(26,127,90,0.12)" : "rgba(217,119,6,0.12)",
                  color: isOpMode ? "#1a7f5a" : "#92400e",
                  transition: "all 0.2s"
                }}
              >
                {isOpMode ? "⚙ 操作视角" : "📊 决策视角"}
                <span style={{ fontSize: "10px", opacity: 0.7 }}>（点击切换）</span>
              </button>
            )}
            {!isBoss && (
              <span style={{
                fontSize: "11px", padding: "2px 8px", borderRadius: "10px", fontWeight: 600,
                background: "rgba(26,127,90,0.12)", color: "#1a7f5a"
              }}>
                操作视角
              </span>
            )}
          </div>
        <div style={{ color: "#6c7a89", fontSize: "13px", marginTop: "6px" }}>{status}</div>
        {uploadPhase && (
          <div style={{ marginTop: "6px", width: "260px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#4f8ef7", marginBottom: "3px" }}>
                <span>
                  {uploadPhase.phase === "reading" && "读取文件"}
                  {uploadPhase.phase === "uploading" && "上传中"}
                  {uploadPhase.phase === "ai" && "AI 识别中"}
                </span>
                <span>{uploadPhase.pct}%</span>
              </div>
              <div style={{ height: "5px", background: "#e8ecf0", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${uploadPhase.pct}%`,
                  background: uploadPhase.phase === "ai"
                    ? "linear-gradient(90deg, #4f8ef7, #1a7f5a)"
                    : "#4f8ef7",
                  borderRadius: "3px",
                  transition: "width 0.3s ease"
                }} />
              </div>
          </div>
        )}
      </div>
    </>
  );
}
