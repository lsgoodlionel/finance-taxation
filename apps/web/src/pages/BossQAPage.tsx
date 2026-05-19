import { useEffect, useRef, useState } from "react";
import { getStoredToken } from "../lib/api";
import { useChatSessions } from "../lib/useChatSessions";
import type { SessionMessage } from "../lib/useChatSessions";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";
const STORAGE_KEY = "ft-bossqa-history";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const QUICK_QUESTIONS = [
  "本月资金状况如何？现金够用吗？",
  "我们最大的财务风险是什么？",
  "本月利润估算，与上月比如何？",
  "目前有哪些税要缴？金额多少？",
  "应收账款有多少？有逾期风险吗？",
  "有哪些任务待处理？优先级怎么排？"
];

function groupByDate(sessions: { id: string; title: string; updatedAt: string; messages: SessionMessage[] }[]) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups: { label: string; items: typeof sessions }[] = [];
  const map = new Map<string, typeof sessions>();

  for (const s of sessions) {
    const d = new Date(s.updatedAt).toDateString();
    let label: string;
    if (d === today) label = "今天";
    else if (d === yesterday) label = "昨天";
    else {
      const dt = new Date(s.updatedAt);
      label = `${dt.getMonth() + 1}月${dt.getDate()}日`;
    }
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(s);
  }

  for (const [label, items] of map) groups.push({ label, items });
  return groups;
}

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function formatText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part.split("\n").map((line, j) => (
      <span key={`${i}-${j}`}>
        {j > 0 && <br />}
        {line}
      </span>
    ));
  });
}

export function BossQAPage() {
  const { messages: persistedMsgs, persistMessages, sessions, activeId, newSession, loadSession, deleteSession } =
    useChatSessions(STORAGE_KEY);

  const [messages, setMessages] = useState<Message[]>(() =>
    persistedMsgs.map((m, i) => ({ id: `h-${i}`, role: m.role, content: m.content }))
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ready, setReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState(
    persistedMsgs.length > 0 ? "已恢复历史对话 — 实时快照每次提问自动刷新" : "正在连接财务数据..."
  );
  const [showHistory, setShowHistory] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setReady(true);
    if (persistedMsgs.length === 0) {
      setStatusMsg("实时财务快照已加载 — 直接提问即可");
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Abort any in-progress stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Sync messages when a session is loaded via loadSession
  useEffect(() => {
    setMessages(persistedMsgs.map((m, i) => ({ id: `h-${i}`, role: m.role, content: m.content })));
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNewSession() {
    abortRef.current?.abort();
    newSession();
    setMessages([]);
    setStatusMsg("新对话已开始 — 直接提问即可");
    setShowHistory(false);
  }

  function handleLoadSession(id: string) {
    abortRef.current?.abort();
    loadSession(id);
    setStatusMsg("已恢复历史对话 — 实时快照每次提问自动刷新");
    setShowHistory(false);
    // messages will sync via the activeId useEffect
  }

  async function sendMessage(content: string) {
    if (!content.trim() || streaming || !ready) return;
    setShowHistory(false);

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: content.trim() };
    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantMsgId, role: "assistant", content: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const history: SessionMessage[] = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = getStoredToken();
      const response = await fetch(`${API_BASE_URL}/api/boss-qa/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`
        },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              type: string; text?: string; fullText?: string; error?: string;
            };
            if (payload.type === "delta" && payload.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + payload.text! } : m
                )
              );
            } else if (payload.type === "done") {
              setMessages((prev) => {
                const updated = prev.map((m) => m.id === assistantMsgId ? { ...m, streaming: false } : m);
                persistMessages(updated.map((m) => ({ role: m.role, content: m.content })));
                return updated;
              });
            } else if (payload.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: `⚠️ ${payload.error ?? "AI 调用失败"}`, streaming: false }
                    : m
                )
              );
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ 请求失败：${err instanceof Error ? err.message : "未知错误"}`, streaming: false }
            : m
        );
        persistMessages(updated.map((m) => ({ role: m.role, content: m.content })));
        return updated;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  const sessionGroups = groupByDate(sessions);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>老板专线</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{statusMsg}</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => sessions.length > 0 && setShowHistory((v) => !v)}
            style={{
              padding: "8px 16px", borderRadius: "8px",
              border: "1px solid rgba(20,40,60,0.15)",
              background: showHistory ? "#1e2a37" : "none",
              color: showHistory ? "#fff" : sessions.length > 0 ? "#6c7a89" : "#bcc5ce",
              fontSize: "13px",
              cursor: sessions.length > 0 ? "pointer" : "default"
            }}
            title={sessions.length === 0 ? "暂无历史记录" : undefined}
          >
            历史记录{sessions.length > 0 ? ` (${sessions.length})` : ""}
          </button>
          <button
            onClick={handleNewSession}
            style={{
              padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)",
              background: "none", color: "#6c7a89", fontSize: "13px", cursor: "pointer"
            }}
          >
            + 新对话
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div style={{
          background: "rgba(248,249,250,0.95)",
          borderRadius: "16px",
          border: "1px solid rgba(20,40,60,0.08)",
          padding: "16px",
          maxHeight: "220px",
          overflowY: "auto"
        }}>
          {sessionGroups.length === 0 ? (
            <div style={{ color: "#aab5c0", fontSize: "13px", textAlign: "center", padding: "16px 0" }}>暂无历史记录</div>
          ) : (
            sessionGroups.map((group) => (
              <div key={group.label} style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "11px", color: "#aab5c0", fontWeight: 600, letterSpacing: "0.5px", marginBottom: "6px" }}>
                  {group.label}
                </div>
                {group.items.map((s) => (
                  <div
                    key={s.id}
                    onMouseEnter={() => setHoveredSession(s.id)}
                    onMouseLeave={() => setHoveredSession(null)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", borderRadius: "8px", cursor: "pointer",
                      background: activeId === s.id
                        ? "rgba(30,42,55,0.08)"
                        : hoveredSession === s.id
                          ? "rgba(30,42,55,0.04)"
                          : "transparent",
                      marginBottom: "2px"
                    }}
                  >
                    <div onClick={() => handleLoadSession(s.id)} style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{
                        fontSize: "13px", color: "#1e2a37",
                        fontWeight: activeId === s.id ? 600 : 400,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                      }}>
                        {activeId === s.id && "● "}{s.title}
                      </div>
                      <div style={{ fontSize: "11px", color: "#aab5c0", marginTop: "2px" }}>
                        {new Date(s.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                        {" · "}{s.messages.length >> 1} 轮对话
                      </div>
                    </div>
                    {hoveredSession === s.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "#c0392b", fontSize: "12px", padding: "2px 6px",
                          borderRadius: "4px", flexShrink: 0
                        }}
                        title="删除此对话"
                      >
                        删除
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* 提示栏 */}
      <div style={{ ...panelStyle(), background: "rgba(255,249,235,0.8)", border: "1px solid rgba(217,119,6,0.15)", fontSize: "13px", color: "#92400e" }}>
        💼 老板专线基于实时财务快照回答问题，包含当前资金、收支、税负、风险等数据。每次提问都会重新加载最新数据。
      </div>

      {/* 快捷问题 */}
      {messages.length === 0 && !showHistory && (
        <div style={panelStyle()}>
          <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "16px", color: "#6c7a89" }}>常见问题</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={!ready || streaming}
                style={{
                  fontSize: "13px", padding: "10px 16px", borderRadius: "10px",
                  border: "1px solid rgba(20,40,60,0.12)", background: "rgba(255,255,255,0.9)",
                  cursor: ready && !streaming ? "pointer" : "default", textAlign: "left" as const,
                  color: "#1e2a37", maxWidth: "280px", lineHeight: "1.4"
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 对话区 */}
      {messages.length > 0 && (
        <div style={{ ...panelStyle(), display: "flex", flexDirection: "column", gap: "16px", maxHeight: "60vh", overflowY: "auto" }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "80%", padding: "12px 16px", borderRadius: "16px",
                fontSize: "14px", lineHeight: "1.6",
                background: msg.role === "user" ? "#1e2a37" : "rgba(240,247,255,0.9)",
                color: msg.role === "user" ? "#fff" : "#1e2a37",
                border: msg.role === "assistant" ? "1px solid rgba(20,40,60,0.08)" : "none"
              }}>
                {msg.role === "assistant" ? formatText(msg.content) : msg.content}
                {msg.streaming && <span style={{ opacity: 0.5 }}> ▋</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* 输入区 */}
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder="直接输入问题，Enter 发送，Shift+Enter 换行"
          disabled={!ready || streaming}
          style={{
            flex: 1, padding: "12px 16px", borderRadius: "12px",
            border: "1px solid rgba(20,40,60,0.15)", fontSize: "14px",
            resize: "none", minHeight: "48px", maxHeight: "120px",
            fontFamily: "inherit", background: "rgba(255,255,255,0.9)",
            lineHeight: "1.5"
          }}
          rows={1}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || !ready || streaming}
          style={{
            padding: "12px 24px", borderRadius: "12px", border: "none",
            background: input.trim() && ready && !streaming ? "#1e2a37" : "#aab5c0",
            color: "#fff", fontSize: "14px",
            cursor: input.trim() && ready && !streaming ? "pointer" : "default",
            whiteSpace: "nowrap" as const
          }}
        >
          {streaming ? "回答中..." : "发送"}
        </button>
      </div>
    </div>
  );
}
