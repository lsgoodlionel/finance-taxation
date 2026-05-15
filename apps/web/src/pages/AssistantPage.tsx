import { useEffect, useRef, useState } from "react";
import { createEvent, login, refreshSession } from "../lib/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";
const TOKEN_KEY = "finance-taxation-v2-token";

interface Message {
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
}

interface SuggestedEvent {
  type: string;
  title: string;
  amount: number | null;
  currency: string;
  occurredOn: string | null;
  description: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  sales: "销售", procurement: "采购", expense: "费用",
  payroll: "工资", tax: "税务", asset: "资产",
  financing: "融资", rnd: "研发", general: "其他"
};

const QUICK_PROMPTS = [
  "本月工资已发放，请帮我整理工资相关的财税事项",
  "我们刚签了一笔采购合同，金额50万，请问需要做哪些财税处理？",
  "帮我看一下公司当前的税务风险",
  "有笔销售收款100万进来了，如何入账？",
  "研发费用如何加计扣除？"
];

function parseSuggestedEvent(text: string): SuggestedEvent | null {
  const match = text.match(/```action\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]!.trim()) as SuggestedEvent;
  } catch {
    return null;
  }
}

function stripActionBlock(text: string): string {
  return text.replace(/```action[\s\S]*?```/g, "").trim();
}

function formatMessage(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

export function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("财税秘书已就绪，请输入您的问题或经营事项描述。");
  const [suggestedEvent, setSuggestedEvent] = useState<SuggestedEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
      } catch {
        setStatus("连接失败，请检查后端服务。");
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(userText: string) {
    if (!userText.trim() || sending) return;
    setSending(true);
    setSuggestedEvent(null);

    const userMsg: Message = { role: "user", content: userText };
    const assistantMsg: Message = { role: "assistant", content: "", loading: true };

    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, assistantMsg]);
    setInput("");
    setStatus("财税秘书正在思考...");

    const token = window.localStorage.getItem(TOKEN_KEY) ?? "";
    let accumulated = "";

    try {
      const response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "请求失败" })) as { error?: string };
        throw new Error(err.error ?? "请求失败");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取流");

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
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw) as { type: string; text?: string; fullText?: string; error?: string };
            if (event.type === "delta" && event.text) {
              accumulated += event.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated, loading: true };
                return updated;
              });
            } else if (event.type === "done") {
              accumulated = event.fullText ?? accumulated;
            } else if (event.type === "error") {
              throw new Error(event.error ?? "AI 返回错误");
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      const suggested = parseSuggestedEvent(accumulated);
      const cleanContent = stripActionBlock(accumulated);

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: cleanContent };
        return updated;
      });

      if (suggested) setSuggestedEvent(suggested);
      setStatus("财税秘书已就绪，请继续提问。");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "发送失败";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${errMsg}` };
        return updated;
      });
      setStatus(errMsg);
    } finally {
      setSending(false);
    }
  }

  async function handleCreateEvent() {
    if (!suggestedEvent) return;
    setCreating(true);
    try {
      await createEvent({
        type: suggestedEvent.type as Parameters<typeof createEvent>[0]["type"],
        title: suggestedEvent.title,
        description: suggestedEvent.description,
        department: "财务部",
        occurredOn: suggestedEvent.occurredOn ?? new Date().toISOString().slice(0, 10),
        amount: suggestedEvent.amount !== null ? String(suggestedEvent.amount) : null,
        currency: suggestedEvent.currency || "CNY",
        source: "ai"
      });
      setSuggestedEvent(null);
      setStatus(`已创建经营事项：${suggestedEvent.title}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const panelBg = {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)"
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "calc(100vh - 180px)", maxHeight: "800px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>AI 财税秘书</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{status}</div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setSuggestedEvent(null); setStatus("对话已清除。"); }}
            style={{ background: "#eef0f3", color: "#6c7a89", border: "none", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontSize: "13px" }}
          >
            清除对话
          </button>
        )}
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
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

      {/* Chat area */}
      <div style={{ ...panelBg, flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#aab5c0", fontSize: "14px", marginTop: "60px" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>💬</div>
            <div>描述您的经营事项或财税问题</div>
            <div style={{ fontSize: "12px", marginTop: "6px" }}>我会提供会计建议、税务指导和风险提示</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
              gap: "10px",
              alignItems: "flex-start"
            }}
          >
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
              padding: "12px 16px",
              fontSize: "14px",
              lineHeight: "1.6",
              border: msg.role === "assistant" ? "1px solid rgba(20,40,60,0.08)" : "none"
            }}>
              {msg.loading && msg.content === "" ? (
                <span style={{ color: "#aab5c0", fontStyle: "italic" }}>正在思考...</span>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggested event card */}
      {suggestedEvent && (
        <div style={{
          ...panelBg, padding: "16px",
          background: "rgba(232,244,239,0.95)",
          border: "1px solid rgba(26,127,90,0.2)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px"
        }}>
          <div style={{ fontSize: "13px" }}>
            <span style={{ fontWeight: 600, color: "#1a7f5a" }}>📋 建议创建经营事项：</span>
            <span style={{ marginLeft: "8px" }}>
              [{EVENT_TYPE_LABELS[suggestedEvent.type] ?? suggestedEvent.type}] {suggestedEvent.title}
              {suggestedEvent.amount !== null && ` · ¥${suggestedEvent.amount.toLocaleString()}`}
              {suggestedEvent.occurredOn && ` · ${suggestedEvent.occurredOn}`}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={handleCreateEvent}
              disabled={creating}
              style={{
                background: "#1a7f5a", color: "#fff", border: "none",
                borderRadius: "8px", padding: "6px 16px", cursor: "pointer",
                fontSize: "13px", opacity: creating ? 0.6 : 1
              }}
            >
              {creating ? "创建中..." : "确认创建"}
            </button>
            <button
              onClick={() => setSuggestedEvent(null)}
              style={{
                background: "none", color: "#6c7a89", border: "1px solid rgba(20,40,60,0.15)",
                borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontSize: "13px"
              }}
            >
              忽略
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div style={{ ...panelBg, padding: "12px 16px", display: "flex", gap: "10px", alignItems: "flex-end" }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="描述您的经营事项或财税问题（Enter 发送，Shift+Enter 换行）"
          disabled={sending}
          style={{
            flex: 1, border: "1px solid rgba(20,40,60,0.12)", borderRadius: "12px",
            padding: "10px 14px", fontSize: "14px", resize: "none", outline: "none",
            fontFamily: "inherit", lineHeight: "1.5",
            background: sending ? "#f8f9fa" : "#fff"
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={sending || !input.trim()}
          style={{
            background: "#1e2a37", color: "#fff", border: "none",
            borderRadius: "12px", padding: "10px 20px", cursor: "pointer",
            fontSize: "14px", flexShrink: 0,
            opacity: sending || !input.trim() ? 0.5 : 1
          }}
        >
          {sending ? "发送中" : "发送"}
        </button>
      </div>
    </div>
  );
}
