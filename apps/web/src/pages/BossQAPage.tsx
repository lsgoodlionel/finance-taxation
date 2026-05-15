import { useEffect, useRef, useState } from "react";
import { getStoredToken, login, refreshSession } from "../lib/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ready, setReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState("正在连接财务数据...");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    login("chairman", "123456")
      .then(() => refreshSession())
      .catch(() => null)
      .finally(() => {
        setReady(true);
        setStatusMsg("实时财务快照已加载 — 直接提问即可");
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(content: string) {
    if (!content.trim() || streaming || !ready) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: content.trim() };
    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantMsgId, role: "assistant", content: "", streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    try {
      const token = getStoredToken();
      const response = await fetch(`${API_BASE_URL}/api/boss-qa/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`
        },
        body: JSON.stringify({ messages: history })
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

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
            const payload = JSON.parse(line.slice(6)) as { type: string; text?: string; fullText?: string; error?: string };
            if (payload.type === "delta" && payload.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + payload.text! } : m
                )
              );
            } else if (payload.type === "done") {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsgId ? { ...m, streaming: false } : m)
              );
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ 请求失败：${err instanceof Error ? err.message : "未知错误"}`, streaming: false }
            : m
        )
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>老板专线</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{statusMsg}</div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            style={{
              padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)",
              background: "none", color: "#6c7a89", fontSize: "13px", cursor: "pointer"
            }}
          >
            清除对话
          </button>
        )}
      </div>

      {/* 提示栏 */}
      <div style={{ ...panelStyle(), background: "rgba(255,249,235,0.8)", border: "1px solid rgba(217,119,6,0.15)", fontSize: "13px", color: "#92400e" }}>
        💼 老板专线基于实时财务快照回答问题，包含当前资金、收支、税负、风险等数据。每次提问都会重新加载最新数据。
      </div>

      {/* 快捷问题 */}
      {messages.length === 0 && (
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
                maxWidth: "80%",
                padding: "12px 16px",
                borderRadius: "16px",
                fontSize: "14px",
                lineHeight: "1.6",
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
