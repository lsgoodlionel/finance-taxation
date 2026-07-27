import React from "react";
import type { SessionMessage } from "../../lib/useChatSessions";

type SessionGroup = {
  label: string;
  items: Array<{ id: string; title: string; updatedAt: string; messages: SessionMessage[] }>;
};

type AssistantSessionListProps = {
  activeId: string | null;
  hoveredSession: string | null;
  groups: SessionGroup[];
  onHover(sessionId: string | null): void;
  onLoad(sessionId: string): void;
  onDelete(sessionId: string): void;
};

export function AssistantSessionList({
  activeId,
  hoveredSession,
  groups,
  onHover,
  onLoad,
  onDelete
}: AssistantSessionListProps) {
  if (groups.length === 0) {
    return <div style={{ color: "#64748b", fontSize: "13px", textAlign: "center", padding: "16px 0" }}>暂无历史记录</div>;
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.label} style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, letterSpacing: "0.5px", marginBottom: "6px" }}>
            {group.label}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {group.items.map((session) => (
              <div
                key={session.id}
                onMouseEnter={() => onHover(session.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(session.id)}
                onBlur={(event) => {
                  // 只在焦点真正离开这一行时才收起「删除」按钮，避免从「打开」
                  // Tab 到「删除」按钮时按钮先被隐藏、导致键盘用户永远够不到它。
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    onHover(null);
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 10px", borderRadius: "8px", cursor: "pointer",
                  background: activeId === session.id
                    ? "rgba(30,42,55,0.08)"
                    : hoveredSession === session.id ? "rgba(30,42,55,0.04)" : "transparent",
                  transition: "background 0.15s"
                }}
              >
                <button
                  type="button"
                  onClick={() => onLoad(session.id)}
                  aria-current={activeId === session.id ? "true" : undefined}
                  aria-label={`${activeId === session.id ? "当前对话：" : ""}${session.title}，${session.messages.length / 2 | 0} 轮对话`}
                  style={{
                    flex: 1, overflow: "hidden", background: "none", border: "none",
                    textAlign: "left", font: "inherit", cursor: "pointer", padding: 0
                  }}
                >
                  <div style={{
                    fontSize: "13px", color: "#1e2a37", fontWeight: activeId === session.id ? 600 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                  }}>
                    {activeId === session.id && <span aria-hidden="true">● </span>}{session.title}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    {new Date(session.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    {" · "}{session.messages.length / 2 | 0} 轮对话
                  </div>
                </button>
                {hoveredSession === session.id && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(session.id);
                    }}
                    aria-label={`删除对话：${session.title}`}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "#c0392b", fontSize: "12px", padding: "2px 6px",
                      borderRadius: "4px", flexShrink: 0
                    }}
                  >
                    删除
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
