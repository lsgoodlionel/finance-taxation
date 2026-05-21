import { useEffect, useMemo, useRef, useState } from "react";
import { createEvent, analyzeEvent, getCurrentUser, getCompanyProfile, listDocuments, uploadDocumentFileRaw, refreshSession } from "../lib/api";
import { useChatSessions } from "../lib/useChatSessions";
import type { SessionMessage } from "../lib/useChatSessions";
import { EVENT_TYPE_LABELS as EVENT_TYPE_LABELS_I18N } from "../lib/i18n";
import { ProcessFlowCard } from "../features/process-flow/ProcessFlowCard";
import { buildProcessFlowPageContext } from "../features/process-flow/page-context";
import { resolveProcessFlowContext } from "../features/process-flow/resolve";
import type { ProcessFlowContext } from "../features/process-flow/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";
const TOKEN_KEY = "finance-taxation-v2-token";
const STORAGE_KEY = "ft-assistant-history";
const FLOW_CONTEXT_STORAGE_KEY = `${STORAGE_KEY}:flow-context`;
const BOSS_ROLES = new Set(["role-chairman", "role-finance-director"]);

const ROLE_LABELS: Record<string, string> = {
  "role-chairman": "创始人/董事长",
  "role-finance-director": "财务负责人",
  "role-accountant": "会计",
  "role-viewer": "查看者"
};

interface SuggestedEvent {
  type: string;
  title: string;
  amount: number | null;
  currency: string;
  occurredOn: string | null;
  description: string;
}

interface OcrPreview {
  base64: string;
  mimeType: string;
  previewUrl: string;
  recognizedText: string;
  isPdf: boolean;
  originalFile: File;
}

interface AssistantFlowContext extends ProcessFlowContext {
  businessEventId?: string;
  eventTitle?: string;
}

const EVENT_TYPE_LABELS = EVENT_TYPE_LABELS_I18N;

const STAFF_QUICK_PROMPTS = [
  "本月工资已发放，请帮我整理工资相关的财税事项",
  "我们刚签了一笔采购合同，金额50万，请问需要做哪些财税处理？",
  "帮我看一下公司当前的税务风险",
  "有笔销售收款100万进来了，如何入账？",
  "研发费用如何加计扣除？"
];

const BOSS_QUICK_PROMPTS = [
  "本月资金状况如何？现金够用吗？",
  "我们最大的财务风险是什么？",
  "本月利润估算，与上月比如何？",
  "目前有哪些税要缴？金额多少？",
  "应收账款有多少？有逾期风险吗？"
];

function parseSuggestedEvents(text: string): SuggestedEvent[] {
  const blocks = [...text.matchAll(/```action\s*([\s\S]*?)```/g)];
  const results: SuggestedEvent[] = [];
  for (const block of blocks) {
    try {
      results.push(JSON.parse(block[1]!.trim()) as SuggestedEvent);
    } catch {
      // skip malformed blocks
    }
  }
  return results;
}

function stripActionBlock(text: string): string {
  return text.replace(/```action[\s\S]*?```/g, "").trim();
}

function formatMessage(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4f8ef7;text-decoration:underline;">$1</a>')
    .replace(/\n/g, "<br/>");
}

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

function buildAssistantFlowContext(input: {
  id?: string;
  type: string;
  title: string;
  description?: string;
  detail?: {
    tasks?: Array<{ id: string }>;
    generatedDocuments?: Array<{ id: string }>;
    vouchers?: Array<{ id: string }>;
    taxItems?: Array<{ id: string }>;
  };
}): AssistantFlowContext {
  const context = resolveProcessFlowContext({
    event: {
      id: input.id ?? "assistant-preview",
      type: input.type,
      title: input.title,
      description: input.description ?? "",
      status: "analyzed"
    },
    detail: {
      tasks: input.detail?.tasks ?? [],
      generatedDocuments: input.detail?.generatedDocuments ?? [],
      vouchers: input.detail?.vouchers ?? [],
      taxItems: input.detail?.taxItems ?? []
    }
  });

  const pageContext = context.branch === "common"
    ? buildProcessFlowPageContext({
      currentNodeId: context.currentNodeId,
      businessEventId: input.id
    })
    : null;

  return {
    ...context,
    nodes: pageContext?.nodes ?? context.nodes,
    businessEventId: input.id,
    eventTitle: input.title
  };
}

function readStoredFlowContexts() {
  try {
    const raw = localStorage.getItem(FLOW_CONTEXT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AssistantFlowContext>) : {};
  } catch {
    return {};
  }
}

function writeStoredFlowContexts(contexts: Record<string, AssistantFlowContext>) {
  try {
    localStorage.setItem(FLOW_CONTEXT_STORAGE_KEY, JSON.stringify(contexts));
  } catch {
    // ignore storage quota errors for assistant flow snapshots
  }
}

export function AssistantPage() {
  const { messages, setMessages, persistMessages, sessions, activeId, newSession, loadSession, deleteSession } =
    useChatSessions(STORAGE_KEY);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  // Role / view mode
  const [isBoss, setIsBoss] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [viewMode, setViewMode] = useState<"boss" | "staff">("staff");
  const [approverRoleLabel, setApproverRoleLabel] = useState("创始人/董事长");

  const [status, setStatus] = useState(
    messages.length > 0 ? "已恢复历史对话，可继续提问。" : "AI 助手已就绪，请输入您的问题。"
  );
  const [suggestedEvents, setSuggestedEvents] = useState<SuggestedEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [ocrPreview, setOcrPreview] = useState<OcrPreview | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<{ phase: "reading" | "uploading" | "ai"; pct: number } | null>(null);
  const [flowContext, setFlowContext] = useState<AssistantFlowContext | null>(null);
  const aiProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        const boss = user.roleIds.some((r) => BOSS_ROLES.has(r));
        setIsBoss(boss);
        setCompanyId(user.companyId);
        const savedMode = localStorage.getItem(`ft-view-mode-${user.companyId}`) as "boss" | "staff" | null;
        setViewMode(boss ? (savedMode ?? "boss") : "staff");
      })
      .catch(() => {});

    getCompanyProfile()
      .then((p) => {
        if (p.financeApproverRole) {
          setApproverRoleLabel(ROLE_LABELS[p.financeApproverRole] ?? p.financeApproverRole);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeId) {
      return;
    }

    const contexts = readStoredFlowContexts();
    setFlowContext(contexts[activeId] ?? null);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      return;
    }

    const contexts = readStoredFlowContexts();
    if (flowContext) {
      contexts[activeId] = flowContext;
    } else {
      delete contexts[activeId];
    }
    writeStoredFlowContexts(contexts);
  }, [activeId, flowContext]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  function toggleViewMode() {
    const next = viewMode === "boss" ? "staff" : "boss";
    setViewMode(next);
    if (companyId) localStorage.setItem(`ft-view-mode-${companyId}`, next);
    setSuggestedEvents([]);
    setFlowContext(null);
    setStatus(next === "boss" ? "已切换为决策视角" : "已切换为操作视角");
  }

  const isOpMode = viewMode === "staff";

  async function sendMessage(userText: string, modeOverride?: "boss" | "staff") {
    if (!userText.trim() || sending) return;
    setSending(true);
    setSuggestedEvents([]);
    setFlowContext(null);
    setShowHistory(false);
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

  async function handleCreateEvent() {
    if (suggestedEvents.length === 0) return;
    setCreating(true);
    const captured = [...suggestedEvents];
    const capturedOcrPreview = ocrPreview;
    const isMulti = captured.length > 1;
    try {
      const results: { id: string; title: string; amount: number | null; occurredOn: string | null }[] = [];
      for (const ev of captured) {
        const created = await createEvent({
          type: ev.type as Parameters<typeof createEvent>[0]["type"],
          title: ev.title,
          description: ev.description,
          department: "财务部",
          occurredOn: ev.occurredOn ?? new Date().toISOString().slice(0, 10),
          amount: ev.amount !== null ? String(ev.amount) : null,
          currency: ev.currency || "CNY",
          source: "ai"
        });
        results.push({ id: created.id, title: ev.title, amount: ev.amount, occurredOn: ev.occurredOn });
      }
      setSuggestedEvents([]);
      setFlowContext(buildAssistantFlowContext({
        id: results[0]?.id,
        type: captured[0]!.type,
        title: captured[0]!.title,
        description: captured[0]!.description
      }));

      // Auto-analyze all created events
      let totalTasks = 0;
      for (const r of results) {
        try {
          const analyzed = await analyzeEvent(r.id);
          totalTasks += analyzed.generatedTasks;
        } catch {
          // analyze failure is non-critical
        }
      }

      // Auto-attach OCR file to all generated documents
      let attachedCount = 0;
      if (capturedOcrPreview?.originalFile) {
        for (const r of results) {
          try {
            const docs = await listDocuments({ businessEventId: r.id });
            for (const doc of docs.items) {
              await uploadDocumentFileRaw(doc.id, capturedOcrPreview.originalFile);
              attachedCount++;
            }
          } catch {
            // attachment is best-effort
          }
        }
        if (capturedOcrPreview.previewUrl) URL.revokeObjectURL(capturedOcrPreview.previewUrl);
        setOcrPreview(null);
      }

      const firstType = EVENT_TYPE_LABELS[captured[0]!.type] ?? captured[0]!.type;
      const summaryLines = results.map((r, i) =>
        `  ${i + 1}. ${r.title}${r.amount != null ? ` ¥${r.amount}` : ""}${r.occurredOn ? ` (${r.occurredOn})` : ""}`
      );

      const attachNote = attachedCount > 0
        ? `**第3步 ✅** 已自动将上传文件作为原始凭证挂载到 **${attachedCount}** 份单据`
        : `**第3步 📎** 原始凭证建议上传：银行电子发票/纸质发票/银行对账单/交易流水（证明扣款事实）`;

      const confirmMsg = [
        `✅ **全流程处理已启动**`,
        ``,
        isMulti
          ? `**第1步 ✅** 已批量创建 **${results.length}** 条[${firstType}]经营事项（按月分拆）：\n${summaryLines.join("\n")}`
          : `**第1步 ✅** 经营事项已创建：[${firstType}] ${results[0]!.title}`,
        `**第2步 ✅** 自动分析完成：共生成 **${totalTasks}** 个执行任务 + ${results.length} 张凭证草稿`,
        attachNote,
        `**第4步 ⏳** 等待${approverRoleLabel}审核确认凭证`,
        ``,
        `**操作导航：**`,
        `• [查看经营事项](/events)`,
        `• [查看待处理任务](/tasks)`,
        `• [审核并过账凭证](/vouchers)`,
        `• [查看单据及附件](/documents)`,
        ``,
        `> 凭证草稿已就绪，请${approverRoleLabel}前往「凭证中心」逐一确认过账。`
      ].join("\n");

      setMessages((prev) => {
        const updated = [...prev, { role: "assistant" as const, content: confirmMsg }];
        persistMessages(updated);
        return updated;
      });
      setStatus(isMulti ? `已批量创建 ${results.length} 条经营事项` : `已创建并自动分析：${captured[0]!.title}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  function clearAiProgress() {
    if (aiProgressRef.current) { clearInterval(aiProgressRef.current); aiProgressRef.current = null; }
    setUploadPhase(null);
  }

  function startAiProgressSimulation() {
    setUploadPhase({ phase: "ai", pct: 0 });
    aiProgressRef.current = setInterval(() => {
      setUploadPhase((prev) => {
        if (!prev || prev.phase !== "ai") return prev;
        const next = prev.pct + 1;
        return next >= 90 ? { phase: "ai", pct: 90 } : { phase: "ai", pct: next };
      });
    }, 400);
  }

  function xhrPost(url: string, token: string, body: string, onUploadPct: (pct: number) => void): Promise<{ status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 180000;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onUploadPct(Math.round(e.loaded / e.total * 100)); };
      xhr.upload.onload = () => onUploadPct(100);
      xhr.onload = () => {
        try { resolve({ status: xhr.status, data: JSON.parse(xhr.responseText) }); }
        catch { resolve({ status: xhr.status, data: { error: xhr.responseText } }); }
      };
      xhr.onerror = () => reject(new Error("网络连接失败"));
      xhr.ontimeout = () => reject(new Error("请求超时（3分钟），请检查网络或 AI 配置后重试"));
      xhr.send(body);
    });
  }

  async function handleImageFile(file: File) {
    const isPdf = file.type === "application/pdf";
    if (file.size > 20 * 1024 * 1024) {
      setStatus("文件过大（最大 20MB）");
      return;
    }
    setOcrLoading(true);
    setUploadPhase({ phase: "reading", pct: 0 });
    setStatus(`正在读取${isPdf ? " PDF" : "图片"}文件...`);

    const objectUrl = isPdf ? "" : URL.createObjectURL(file);

    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) setUploadPhase({ phase: "reading", pct: Math.round(e.loaded / e.total * 100) });
    };
    reader.readAsDataURL(file);

    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const commaIdx = dataUrl.indexOf(",");
        const base64 = dataUrl.slice(commaIdx + 1);
        const mimeType = isPdf ? "application/pdf" : (dataUrl.slice(5, commaIdx).split(";")[0] ?? "image/jpeg");
        const body = JSON.stringify({ imageBase64: base64, mimeType });

        setUploadPhase({ phase: "uploading", pct: 0 });
        setStatus("正在上传文件...");

        let token = window.localStorage.getItem(TOKEN_KEY) ?? "";
        let result = await xhrPost(`${API_BASE_URL}/api/assistant/ocr`, token, body,
          (pct) => setUploadPhase({ phase: "uploading", pct })
        );

        if (result.status === 401) {
          try {
            await refreshSession();
            token = window.localStorage.getItem(TOKEN_KEY) ?? "";
            setUploadPhase({ phase: "uploading", pct: 0 });
            result = await xhrPost(`${API_BASE_URL}/api/assistant/ocr`, token, body,
              (pct) => setUploadPhase({ phase: "uploading", pct })
            );
          } catch { /* fall through */ }
        }

        startAiProgressSimulation();
        setStatus(`AI 正在识别${isPdf ? " PDF" : "图片"}凭证...`);

        const data = result.data as { text?: string; error?: string };
        if (data.error || !data.text) throw new Error(data.error ?? "识别失败");

        clearAiProgress();
        setOcrPreview({ base64, mimeType, previewUrl: objectUrl, recognizedText: data.text, isPdf, originalFile: file });
        setInput(`【${isPdf ? "PDF凭证" : "图片凭证"}识别结果】\n${data.text}\n\n请根据以上凭证信息，给出财税处理建议。`);
        setStatus("识别完成，请确认内容后发送");
      } catch (err) {
        clearAiProgress();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setStatus(err instanceof Error ? err.message : "文件识别失败");
      } finally {
        setOcrLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      clearAiProgress();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setStatus("文件读取失败");
      setOcrLoading(false);
    };
  }

  function clearOcrPreview() {
    clearAiProgress();
    if (ocrPreview?.previewUrl) URL.revokeObjectURL(ocrPreview.previewUrl);
    setOcrPreview(null);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleNewSession() {
    abortRef.current?.abort();
    setSuggestedEvents([]);
    setOcrPreview(null);
    setFlowContext(null);
    newSession();
    setStatus("新对话已开始，请输入您的问题。");
    setShowHistory(false);
  }

  function handleLoadSession(id: string) {
    abortRef.current?.abort();
    setSuggestedEvents([]);
    loadSession(id);
    const contexts = readStoredFlowContexts();
    setFlowContext(contexts[id] ?? null);
    setStatus(contexts[id] ? "已恢复历史对话和流程位置，可继续提问。" : "已恢复历史对话，可继续提问。");
    setShowHistory(false);
  }

  function handleDeleteSession(id: string) {
    const contexts = readStoredFlowContexts();
    delete contexts[id];
    writeStoredFlowContexts(contexts);
    deleteSession(id);
  }

  const panelBg = {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)"
  } as const;

  const quickPrompts = isOpMode ? STAFF_QUICK_PROMPTS : BOSS_QUICK_PROMPTS;
  const sessionGroups = groupByDate(sessions);
  const isLoading = sending || ocrLoading;
  const flowTitle = useMemo(() => {
    if (!flowContext?.eventTitle) {
      return "标准业务处理流程";
    }

    return `当前事项流程：${flowContext.eventTitle}`;
  }, [flowContext]);
  const flowSubtitle = flowContext
    ? "根据 AI 已识别的事项上下文高亮当前处理位置，可继续点击节点进入相关业务页。"
    : "覆盖外购物品与业务招待，从事项识别到税务归档，可在提交前后持续查看。";
  const currentFlowNode = flowContext?.nodes.find((node) => node.id === flowContext.currentNodeId);
  const nextFlowNode = flowContext?.nodes.find((node) => node.status === "pending");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "calc(100vh - 180px)", maxHeight: "800px", position: "relative" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>AI 财税助手</h2>
            {/* View mode toggle — visible only to boss users */}
            {isBoss && (
              <button
                onClick={toggleViewMode}
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
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{status}</div>
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
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => sessions.length > 0 && setShowHistory((v) => !v)}
            style={{
              background: showHistory ? "#1e2a37" : "#eef0f3",
              color: showHistory ? "#fff" : sessions.length > 0 ? "#1e2a37" : "#bcc5ce",
              border: "none", borderRadius: "8px", padding: "6px 14px",
              cursor: sessions.length > 0 ? "pointer" : "default", fontSize: "13px"
            }}
          >
            历史记录{sessions.length > 0 ? ` (${sessions.length})` : ""}
          </button>
          <button
            onClick={handleNewSession}
            style={{
              background: "#eef0f3", color: "#1e2a37", border: "none",
              borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontSize: "13px"
            }}
          >
            + 新对话
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div style={{
          ...panelBg,
          padding: "16px",
          maxHeight: "240px",
          overflowY: "auto",
          background: "rgba(248,249,250,0.95)"
        }}>
          {sessionGroups.length === 0 ? (
            <div style={{ color: "#aab5c0", fontSize: "13px", textAlign: "center", padding: "16px 0" }}>暂无历史记录</div>
          ) : (
            sessionGroups.map((group) => (
              <div key={group.label} style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "11px", color: "#aab5c0", fontWeight: 600, letterSpacing: "0.5px", marginBottom: "6px" }}>
                  {group.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
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
                          : hoveredSession === s.id ? "rgba(30,42,55,0.04)" : "transparent",
                        transition: "background 0.15s"
                      }}
                    >
                      <div onClick={() => handleLoadSession(s.id)} style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{
                          fontSize: "13px", color: "#1e2a37", fontWeight: activeId === s.id ? 600 : 400,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                        }}>
                          {activeId === s.id && "● "}{s.title}
                        </div>
                        <div style={{ fontSize: "11px", color: "#aab5c0", marginTop: "2px" }}>
                          {new Date(s.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}{s.messages.length / 2 | 0} 轮对话
                        </div>
                      </div>
                      {hoveredSession === s.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
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
            ))
          )}
        </div>
      )}

      {/* Decision mode hint */}
      {!isOpMode && (
        <div style={{
          ...panelBg, padding: "10px 16px",
          background: "rgba(255,249,235,0.8)",
          border: "1px solid rgba(217,119,6,0.15)",
          fontSize: "13px", color: "#92400e"
        }}>
          📊 决策视角：基于实时财务快照（资金/收支/税负/风险）回答，每次提问自动刷新。
        </div>
      )}

      {/* Operation mode hint for boss */}
      {isOpMode && isBoss && (
        <div style={{
          ...panelBg, padding: "10px 16px",
          background: "rgba(240,247,255,0.8)",
          border: "1px solid rgba(79,142,247,0.2)",
          fontSize: "13px", color: "#1e4a8c"
        }}>
          ⚙ 操作视角：可处理报销、入账等实际财务操作，AI 将给出账务处理建议并自动生成凭证草稿。
        </div>
      )}

      <ProcessFlowCard
        mode="inline"
        title={flowTitle}
        subtitle={flowSubtitle}
        activeBranch={flowContext?.branch === "common" ? undefined : flowContext?.branch}
        currentNodeId={flowContext?.currentNodeId}
        nodes={flowContext?.nodes}
        businessEventId={flowContext?.businessEventId}
      />
      {flowContext && currentFlowNode && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">本次事项摘要</span>
          </div>
          <div
            className="card-body"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}
          >
            <div>
              <div className="text-muted text-sm">当前步骤</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{currentFlowNode.title}</div>
            </div>
            <div>
              <div className="text-muted text-sm">涉及部门</div>
              <div style={{ marginTop: 4 }}>{currentFlowNode.departments.join(" / ") || "无"}</div>
            </div>
            <div>
              <div className="text-muted text-sm">关键单据</div>
              <div style={{ marginTop: 4 }}>{currentFlowNode.documents.join(" / ") || "无"}</div>
            </div>
            <div>
              <div className="text-muted text-sm">税务要点</div>
              <div style={{ marginTop: 4 }}>{currentFlowNode.taxes.join(" / ") || "无"}</div>
            </div>
            <div>
              <div className="text-muted text-sm">凭证线索</div>
              <div style={{ marginTop: 4 }}>{currentFlowNode.vouchers.join(" / ") || "无"}</div>
            </div>
            <div>
              <div className="text-muted text-sm">下一步骤</div>
              <div style={{ marginTop: 4 }}>{nextFlowNode?.title ?? "当前已到流程末端"}</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick prompts */}
      {messages.length === 0 && !showHistory && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {quickPrompts.map((p) => (
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

      {/* OCR preview card */}
      {ocrPreview && (
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
            onClick={clearOcrPreview}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9aa5b4", fontSize: "16px", flexShrink: 0, padding: "0 4px" }}
            title="清除"
          >
            ✕
          </button>
        </div>
      )}

      {/* Suggested event card — operation mode only */}
      {suggestedEvents.length > 0 && isOpMode && (
        <div style={{
          ...panelBg, padding: "16px",
          background: "rgba(232,244,239,0.95)",
          border: "1px solid rgba(26,127,90,0.2)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px"
        }}>
          <div style={{ fontSize: "13px", flex: 1 }}>
            <span style={{ fontWeight: 600, color: "#1a7f5a" }}>
              📋 建议创建经营事项{suggestedEvents.length > 1 ? `（共 ${suggestedEvents.length} 条，按月分拆）` : ""}：
            </span>
            {suggestedEvents.length === 1 ? (
              <span style={{ marginLeft: "8px" }}>
                [{EVENT_TYPE_LABELS[suggestedEvents[0]!.type] ?? suggestedEvents[0]!.type}] {suggestedEvents[0]!.title}
                {suggestedEvents[0]!.amount !== null && ` · ¥${suggestedEvents[0]!.amount.toLocaleString()}`}
                {suggestedEvents[0]!.occurredOn && ` · ${suggestedEvents[0]!.occurredOn}`}
              </span>
            ) : (
              <ul style={{ margin: "6px 0 0 0", paddingLeft: "20px", lineHeight: 1.8 }}>
                {suggestedEvents.map((ev, i) => (
                  <li key={i} style={{ fontSize: "12.5px" }}>
                    [{EVENT_TYPE_LABELS[ev.type] ?? ev.type}] {ev.title}
                    {ev.amount !== null && ` · ¥${ev.amount.toLocaleString()}`}
                    {ev.occurredOn && ` · ${ev.occurredOn}`}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ fontSize: "12px", color: "#6c7a89", marginTop: "6px" }}>
              确认后将分别自动生成执行任务和凭证草稿，由 <strong>{approverRoleLabel}</strong> 审核过账
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0, paddingTop: "2px" }}>
            <button
              onClick={() => void handleCreateEvent()}
              disabled={creating}
              style={{
                background: "#1a7f5a", color: "#fff", border: "none",
                borderRadius: "8px", padding: "6px 16px", cursor: "pointer",
                fontSize: "13px", opacity: creating ? 0.6 : 1
              }}
            >
              {creating ? "处理中..." : suggestedEvents.length > 1 ? `批量创建 ${suggestedEvents.length} 条` : "一键处理"}
            </button>
            <button
              onClick={() => {
                setSuggestedEvents([]);
                setFlowContext(null);
              }}
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
        {/* Image upload button — operation mode only */}
        {isOpMode && (
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
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageFile(file);
              }}
            />
            {ocrLoading ? "⏳" : "📎"}
          </label>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={isOpMode
            ? "描述经营事项、报销内容等，或点击 📎 上传凭证图片/PDF 直接识别（Enter 发送）"
            : "直接提问财务经营问题（Enter 发送，Shift+Enter 换行）"}
          disabled={isLoading}
          style={{
            flex: 1, border: "1px solid rgba(20,40,60,0.12)", borderRadius: "12px",
            padding: "10px 14px", fontSize: "14px", resize: "none", outline: "none",
            fontFamily: "inherit", lineHeight: "1.5",
            background: isLoading ? "#f8f9fa" : "#fff"
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          style={{
            background: "#1e2a37", color: "#fff", border: "none",
            borderRadius: "12px", padding: "10px 20px", cursor: "pointer",
            fontSize: "14px", flexShrink: 0,
            opacity: isLoading || !input.trim() ? 0.5 : 1
          }}
        >
          {sending ? "发送中" : "发送"}
        </button>
      </div>
    </div>
  );
}
