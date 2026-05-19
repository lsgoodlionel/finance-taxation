import { useEffect, useRef, useState } from "react";

export interface PersistedMessage {
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
}

const MAX_MESSAGES = 200;

export function useChatHistory(storageKey: string) {
  const [messages, setMessages] = useState<PersistedMessage[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      return JSON.parse(raw) as PersistedMessage[];
    } catch {
      return [];
    }
  });

  const pendingSave = useRef(false);

  // Debounced save: write to localStorage after stream completes
  function saveMessages(msgs: PersistedMessage[]) {
    if (pendingSave.current) return;
    pendingSave.current = true;
    setTimeout(() => {
      try {
        const capped = msgs.slice(-MAX_MESSAGES);
        localStorage.setItem(storageKey, JSON.stringify(capped));
      } catch {
        // storage quota exceeded — ignore
      }
      pendingSave.current = false;
    }, 300);
  }

  function clearHistory() {
    setMessages([]);
    localStorage.removeItem(storageKey);
  }

  return { messages, setMessages, saveMessages, clearHistory };
}
