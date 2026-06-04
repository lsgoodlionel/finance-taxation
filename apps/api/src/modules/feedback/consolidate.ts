/**
 * Phase9 任务2：反馈浓缩为升级需求建议（纯函数，可测）。
 * 按类别聚合开放反馈，生成一条结构化升级需求草案。
 */

export interface FeedbackItem {
  id: string;
  category: string;   // bug | suggestion | question
  title: string;
  module: string;
  votes: number;
}

export interface ConsolidatedProposal {
  title: string;
  summary: string;
  priority: "high" | "medium" | "low";
  sourceIds: string[];
  sourceCount: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: "缺陷修复", suggestion: "功能建议", question: "使用疑问",
};

export function consolidateFeedback(items: FeedbackItem[]): ConsolidatedProposal | null {
  if (items.length === 0) return null;

  const byCat = new Map<string, FeedbackItem[]>();
  for (const it of items) {
    const list = byCat.get(it.category) ?? [];
    list.push(it);
    byCat.set(it.category, list);
  }

  const bugCount = (byCat.get("bug") ?? []).length;
  const totalVotes = items.reduce((s, i) => s + i.votes, 0);

  // 优先级：缺陷多或总票数高 → 高
  const priority: ConsolidatedProposal["priority"] =
    bugCount >= 3 || totalVotes >= 20 ? "high"
    : items.length >= 5 || totalVotes >= 5 ? "medium"
    : "low";

  const lines: string[] = [];
  for (const [cat, list] of byCat) {
    const top = [...list].sort((a, b) => b.votes - a.votes).slice(0, 5);
    lines.push(`【${CATEGORY_LABEL[cat] ?? cat}｜${list.length} 条】`);
    for (const t of top) {
      lines.push(`  · ${t.title}${t.module ? `（${t.module}）` : ""}${t.votes ? ` [${t.votes}赞]` : ""}`);
    }
  }

  const title = `升级需求建议：${items.length} 条反馈浓缩（含 ${bugCount} 缺陷）`;
  const summary = lines.join("\n");

  return { title, summary, priority, sourceIds: items.map((i) => i.id), sourceCount: items.length };
}
