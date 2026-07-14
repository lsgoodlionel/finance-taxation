import type { SessionMessage } from "../../lib/useChatSessions";
import type { SuggestedEvent } from "./types";

export function parseSuggestedEvents(text: string): SuggestedEvent[] {
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

export function stripActionBlock(text: string): string {
  return text.replace(/```action[\s\S]*?```/g, "").trim();
}

export function formatMessage(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4f8ef7;text-decoration:underline;">$1</a>')
    .replace(/\n/g, "<br/>");
}

export function groupByDate(sessions: { id: string; title: string; updatedAt: string; messages: SessionMessage[] }[]) {
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
