import { useRef, useState } from "react";
import { API_BASE_URL, refreshSession } from "../../lib/api";
import type { SessionMessage } from "../../lib/useChatSessions";
import { TOKEN_KEY } from "./constants";
import { buildAssistantFlowContext } from "./flow-context-utils";
import { parseSuggestedEvents, stripActionBlock } from "./message-utils";
import type { AssistantFlowContext, AssistantViewMode, OcrPreview, SuggestedEvent } from "./types";

interface UseAssistantChatStreamParams {
  messages: SessionMessage[];
  setMessages: React.Dispatch<React.SetStateAction<SessionMessage[]>>;
  persistMessages: (messages: SessionMessage[]) => void;
  viewMode: AssistantViewMode;
  isOpMode: boolean;
  setInput: (value: string) => void;
  setStatus: (status: string) => void;
  setSuggestedEvents: React.Dispatch<React.SetStateAction<SuggestedEvent[]>>;
  setFlowContext: React.Dispatch<React.SetStateAction<AssistantFlowContext | null>>;
  setHistoryState: (value: string) => void;
  setOcrPreview: (value: OcrPreview | null) => void;
}

export function useAssistantChatStream(params: UseAssistantChatStreamParams) {
  const {
    messages,
    setMessages,
    persistMessages,
    viewMode,
    isOpMode,
    setInput,
    setStatus,
    setSuggestedEvents,
    setFlowContext,
    setHistoryState,
    setOcrPreview
  } = params;

  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function sendMessage(userText: string, modeOverride?: AssistantViewMode) {
    if (!userText.trim() || sending) return;
    setSending(true);
    setSuggestedEvents([]);
    setFlowContext(null);
    setHistoryState("");
    setOcrPreview(null);

    const userMsg: SessionMessage = { role: "user", content: userText };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: "assistant" as const, content: "", loading: true }] as SessionMessage[]);
    setInput("");
    setStatus("AI 助手正在思考...");

    const token = window.localStorage.getItem(TOKEN_KEY) ?? "";
    let accumulated = "";
    const controller = new AbortController();
    abortRef.current = controller;
    const effectiveMode = modeOverride ?? viewMode;

    try {
      const chatBody = JSON.stringify({
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        mode: effectiveMode
      });
      let chatToken = window.localStorage.getItem(TOKEN_KEY) ?? "";
      let response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${chatToken}` },
        body: chatBody,
        signal: controller.signal
      });

      if (response.status === 401) {
        try {
          await refreshSession();
          chatToken = window.localStorage.getItem(TOKEN_KEY) ?? "";
          response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${chatToken}` },
            body: chatBody,
            signal: controller.signal
          });
        } catch { /* refresh failed, fall through to error handling */ }
      }

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

          let event: { type: string; text?: string; fullText?: string; error?: string };
          try {
            event = JSON.parse(raw) as { type: string; text?: string; fullText?: string; error?: string };
          } catch {
            // skip malformed SSE lines
            continue;
          }

          if (event.type === "delta" && event.text) {
            accumulated += event.text;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: accumulated };
              return updated;
            });
          } else if (event.type === "done") {
            accumulated = event.fullText ?? accumulated;
          } else if (event.type === "error") {
            throw new Error(event.error ?? "AI 返回错误");
          }
        }
      }

      const suggestedList = parseSuggestedEvents(accumulated);
      const cleanContent = stripActionBlock(accumulated);

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: cleanContent };
        persistMessages(updated);
        return updated;
      });

      if (suggestedList.length > 0 && isOpMode) {
        setSuggestedEvents(suggestedList);
        setFlowContext(buildAssistantFlowContext(suggestedList[0]!));
      }
      setStatus("AI 助手已就绪，请继续提问。");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const errMsg = err instanceof Error ? err.message : "发送失败";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${errMsg}` };
        persistMessages(updated);
        return updated;
      });
      setStatus(errMsg);
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  return { sending, sendMessage, abortRef };
}
