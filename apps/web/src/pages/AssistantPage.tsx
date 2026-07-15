import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getCurrentUser, getCompanyProfile } from "../lib/api";
import { useChatSessions } from "../lib/useChatSessions";
import { useDrawer } from "../hooks/useDrawer";
import { useQueryState } from "../hooks/useQueryState";
import { AssistantShell } from "./assistant/AssistantShell";
import { AssistantHistoryPanel } from "./assistant/AssistantHistoryPanel";
import { AssistantComposer } from "./assistant/AssistantComposer";
import { AssistantSessionList } from "./assistant/AssistantSessionList";
import { AssistantSuggestedEventsCard } from "./assistant/AssistantSuggestedEventsCard";
import { AssistantInputBar } from "./assistant/AssistantInputBar";
import { AssistantHeaderBar } from "./assistant/AssistantHeaderBar";
import { AssistantStatusBanners } from "./assistant/AssistantStatusBanners";
import { AssistantFlowSection } from "./assistant/AssistantFlowSection";
import { AssistantOcrPreviewCard } from "./assistant/AssistantOcrPreviewCard";
import { AssistantChatMessages } from "./assistant/AssistantChatMessages";
import { BOSS_ROLES, BOSS_QUICK_PROMPTS, EVENT_TYPE_LABELS, ROLE_LABELS, STAFF_QUICK_PROMPTS, STORAGE_KEY } from "./assistant/constants";
import { groupByDate } from "./assistant/message-utils";
import { readStoredFlowContexts, writeStoredFlowContexts } from "./assistant/flow-context-utils";
import { useAssistantChatStream } from "./assistant/useAssistantChatStream";
import { useOcrUpload } from "./assistant/useOcrUpload";
import { useSuggestedEventActions } from "./assistant/useSuggestedEventActions";
import type { AssistantFlowContext, AssistantViewMode, OcrPreview, SuggestedEvent } from "./assistant/types";

export function AssistantPage() {
  const { messages, setMessages, persistMessages, sessions, activeId, newSession, loadSession, deleteSession } =
    useChatSessions(STORAGE_KEY);
  const [sessionIdState, setSessionIdState] = useQueryState("session", "");
  const [modeState, setModeState] = useQueryState("mode", "");
  const [historyState, setHistoryState] = useQueryState("history", "");

  const [input, setInput] = useState("");

  // Role / view mode
  const [isBoss, setIsBoss] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [requestDepartment, setRequestDepartment] = useState("财务部");
  const [viewMode, setViewMode] = useState<AssistantViewMode>("staff");
  const [approverRoleLabel, setApproverRoleLabel] = useState("创始人/董事长");

  const [status, setStatus] = useState(
    messages.length > 0 ? "已恢复历史对话，可继续提问。" : "AI 助手已就绪，请输入您的问题。"
  );
  const [suggestedEvents, setSuggestedEvents] = useState<SuggestedEvent[]>([]);
  const ocrPreviewDrawer = useDrawer<OcrPreview>();
  const [showHistory, setShowHistory] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [flowContext, setFlowContext] = useState<AssistantFlowContext | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // V7 K1：老板工作台「问 AI」经 navigate state 带入初始问题，自动填入输入框（仅生效一次）。
  const location = useLocation();
  const initialPromptApplied = useRef(false);
  useEffect(() => {
    if (initialPromptApplied.current) return;
    const state = location.state as { initialPrompt?: unknown } | null;
    const prompt = typeof state?.initialPrompt === "string" ? state.initialPrompt.trim() : "";
    if (!prompt) return;
    initialPromptApplied.current = true;
    setInput(prompt);
    setStatus("已带入您的问题，按回车或点击发送即可。");
  }, [location.state]);
  const ocrPreview = ocrPreviewDrawer.value;
  const setOcrPreview = (next: OcrPreview | null) => {
    if (next) {
      ocrPreviewDrawer.open(next);
      return;
    }
    ocrPreviewDrawer.close();
  };

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        const boss = user.roleIds.some((r) => BOSS_ROLES.has(r));
        setIsBoss(boss);
        setCompanyId(user.companyId);
        setRequestDepartment(user.departmentName || "财务部");
        const savedMode = localStorage.getItem(`ft-view-mode-${user.companyId}`) as AssistantViewMode | null;
        const nextMode = boss
          ? (modeState === "boss" || modeState === "staff" ? modeState : (savedMode ?? "boss"))
          : "staff";
        setViewMode(nextMode);
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
    setShowHistory(historyState === "open");
  }, [historyState]);

  useEffect(() => {
    if (!activeId) {
      return;
    }

    const contexts = readStoredFlowContexts();
    setFlowContext(contexts[activeId] ?? null);
  }, [activeId]);

  useEffect(() => {
    if ((activeId ?? "") !== sessionIdState) {
      setSessionIdState(activeId ?? "");
    }
  }, [activeId, sessionIdState, setSessionIdState]);

  useEffect(() => {
    if (!sessionIdState || !sessions.some((session) => session.id === sessionIdState) || activeId === sessionIdState) {
      return;
    }

    loadSession(sessionIdState);
  }, [activeId, loadSession, sessionIdState, sessions]);

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

  function toggleViewMode() {
    const next = viewMode === "boss" ? "staff" : "boss";
    setViewMode(next);
    if (companyId) localStorage.setItem(`ft-view-mode-${companyId}`, next);
    setModeState(next);
    setSuggestedEvents([]);
    setFlowContext(null);
    setStatus(next === "boss" ? "已切换为决策视角" : "已切换为操作视角");
  }

  const isOpMode = viewMode === "staff";

  const { sending, sendMessage, abortRef } = useAssistantChatStream({
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
  });

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const { ocrLoading, uploadPhase, handleImageFile, clearOcrPreview } = useOcrUpload({
    ocrPreview,
    setOcrPreview,
    setInput,
    setStatus,
    fileInputRef
  });

  const { creating, handleCreateEvent } = useSuggestedEventActions({
    suggestedEvents,
    setSuggestedEvents,
    setFlowContext,
    ocrPreview,
    setOcrPreview,
    requestDepartment,
    approverRoleLabel,
    setMessages,
    persistMessages,
    setStatus
  });

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
    setSessionIdState("");
    setStatus("新对话已开始，请输入您的问题。");
    setHistoryState("");
  }

  function handleLoadSession(id: string) {
    abortRef.current?.abort();
    setSuggestedEvents([]);
    loadSession(id);
    setSessionIdState(id);
    const contexts = readStoredFlowContexts();
    setFlowContext(contexts[id] ?? null);
    setStatus(contexts[id] ? "已恢复历史对话和流程位置，可继续提问。" : "已恢复历史对话，可继续提问。");
    setHistoryState("");
  }

  function handleDeleteSession(id: string) {
    const contexts = readStoredFlowContexts();
    delete contexts[id];
    writeStoredFlowContexts(contexts);
    deleteSession(id);
  }

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

  const header = (
    <AssistantHeaderBar
      sessionsCount={sessions.length}
      showHistory={showHistory}
      onToggleHistory={() => sessions.length > 0 && setHistoryState(showHistory ? "" : "open")}
      onNewSession={handleNewSession}
      isBoss={isBoss}
      isOpMode={isOpMode}
      onToggleViewMode={toggleViewMode}
      status={status}
      uploadPhase={uploadPhase}
    />
  );

  const statusPanels = (
    <AssistantStatusBanners
      isOpMode={isOpMode}
      isBoss={isBoss}
      suggestedEventsCount={suggestedEvents.length}
      hasBusinessEvent={Boolean(flowContext?.businessEventId)}
      nextRouteLabel={nextFlowNode?.routes[0]}
    />
  );

  const flowSection = (
    <AssistantFlowSection
      flowContext={flowContext}
      flowTitle={flowTitle}
      flowSubtitle={flowSubtitle}
      currentFlowNode={currentFlowNode}
      nextFlowNode={nextFlowNode}
    />
  );

  const historySection = (
    <AssistantHistoryPanel visible={showHistory}>
      <AssistantSessionList
        activeId={activeId}
        hoveredSession={hoveredSession}
        groups={sessionGroups}
        onHover={setHoveredSession}
        onLoad={handleLoadSession}
        onDelete={handleDeleteSession}
      />
    </AssistantHistoryPanel>
  );

  const composer = (
    <AssistantComposer>
      {ocrPreview && (
        <AssistantOcrPreviewCard ocrPreview={ocrPreview} onClear={clearOcrPreview} />
      )}

      <AssistantSuggestedEventsCard
        approverRoleLabel={approverRoleLabel}
        creating={creating}
        eventTypeLabels={EVENT_TYPE_LABELS}
        events={suggestedEvents}
        onConfirm={() => void handleCreateEvent()}
        onDismiss={() => {
          setSuggestedEvents([]);
          setFlowContext(null);
        }}
      />

      <AssistantInputBar
        disabled={isLoading}
        input={input}
        isOperationMode={isOpMode}
        ocrLoading={ocrLoading}
        sending={sending}
        fileInputRef={fileInputRef}
        onChange={setInput}
        onKeyDown={handleKeyDown}
        onSend={() => void sendMessage(input)}
        onPickFile={(file) => { void handleImageFile(file); }}
      />
    </AssistantComposer>
  );

  const chat = (
    <AssistantChatMessages
      messages={messages}
      showHistory={showHistory}
      quickPrompts={quickPrompts}
      isOpMode={isOpMode}
      bottomRef={bottomRef}
      onQuickPrompt={(p) => sendMessage(p)}
    />
  );

  return (
    <AssistantShell
      header={header}
      history={historySection}
      status={statusPanels}
      flow={flowSection}
      chat={chat}
      composer={composer}
    />
  );
}
