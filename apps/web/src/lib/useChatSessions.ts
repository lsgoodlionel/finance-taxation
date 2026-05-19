import { useCallback, useState } from "react";

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: SessionMessage[];
}

const MAX_SESSIONS = 30;

function sessionsKey(base: string) { return `${base}:sessions`; }
function activeKey(base: string) { return `${base}:active`; }

function readSessions(base: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(sessionsKey(base));
    return raw ? (JSON.parse(raw) as ChatSession[]) : [];
  } catch {
    return [];
  }
}

function writeSessions(base: string, sessions: ChatSession[]) {
  try {
    localStorage.setItem(sessionsKey(base), JSON.stringify(sessions));
  } catch {
    try {
      localStorage.setItem(sessionsKey(base), JSON.stringify(sessions.slice(0, 10)));
    } catch { /* quota exceeded, give up */ }
  }
}

function deriveTitle(msgs: SessionMessage[]): string {
  const first = msgs.find((m) => m.role === "user");
  if (!first) return "新对话";
  const t = first.content.trim();
  return t.length > 45 ? t.slice(0, 45) + "…" : t;
}

function readActive(base: string): string | null {
  return localStorage.getItem(activeKey(base));
}

function writeActive(base: string, id: string | null) {
  if (id) localStorage.setItem(activeKey(base), id);
  else localStorage.removeItem(activeKey(base));
}

export function useChatSessions(storageKey: string) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const all = readSessions(storageKey);

    // Migrate old single-session data (from useChatHistory)
    const oldRaw = localStorage.getItem(storageKey);
    if (oldRaw && all.length === 0) {
      try {
        const oldMsgs = JSON.parse(oldRaw) as SessionMessage[];
        if (Array.isArray(oldMsgs) && oldMsgs.length > 0) {
          const now = new Date().toISOString();
          const migrated: ChatSession = {
            id: `sess-migrated-${Date.now()}`,
            title: deriveTitle(oldMsgs),
            createdAt: now,
            updatedAt: now,
            messages: oldMsgs,
          };
          writeSessions(storageKey, [migrated]);
          localStorage.removeItem(storageKey);
          return [migrated];
        }
      } catch { /* ignore malformed old data */ }
    }
    return all;
  });

  const [activeId, setActiveId] = useState<string | null>(() => readActive(storageKey));

  const [messages, setMessages] = useState<SessionMessage[]>(() => {
    const aid = readActive(storageKey);
    if (!aid) return [];
    const found = readSessions(storageKey).find((s) => s.id === aid);
    return found?.messages ?? [];
  });

  // Save current messages into the active session (or create a new session)
  const persistMessages = useCallback((msgs: SessionMessage[]) => {
    if (msgs.length === 0) return;
    const now = new Date().toISOString();

    setSessions((prev) => {
      const currentId = readActive(storageKey);
      let updated: ChatSession[];

      if (currentId && prev.some((s) => s.id === currentId)) {
        updated = prev.map((s) =>
          s.id === currentId
            ? { ...s, messages: msgs, title: deriveTitle(msgs), updatedAt: now }
            : s
        );
      } else {
        const newId = `sess-${Date.now()}`;
        writeActive(storageKey, newId);
        setActiveId(newId);
        const newSession: ChatSession = {
          id: newId,
          title: deriveTitle(msgs),
          createdAt: now,
          updatedAt: now,
          messages: msgs,
        };
        updated = [newSession, ...prev].slice(0, MAX_SESSIONS);
      }

      updated = [...updated].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      writeSessions(storageKey, updated);
      return updated;
    });
  }, [storageKey]);

  const newSession = useCallback(() => {
    setMessages([]);
    setActiveId(null);
    writeActive(storageKey, null);
  }, [storageKey]);

  const loadSession = useCallback((id: string) => {
    const all = readSessions(storageKey);
    const found = all.find((s) => s.id === id);
    if (!found) return;
    setMessages(found.messages);
    setActiveId(id);
    writeActive(storageKey, id);
  }, [storageKey]);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      writeSessions(storageKey, updated);
      return updated;
    });
    if (readActive(storageKey) === id) {
      setMessages([]);
      setActiveId(null);
      writeActive(storageKey, null);
    }
  }, [storageKey]);

  return {
    messages,
    setMessages,
    persistMessages,
    sessions,
    activeId,
    newSession,
    loadSession,
    deleteSession,
  };
}
