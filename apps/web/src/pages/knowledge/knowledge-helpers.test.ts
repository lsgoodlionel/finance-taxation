import type { KnowledgeItem } from "@finance-taxation/domain-model";
import { buildKnowledgeSummary, parseTags } from "./knowledge-helpers";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: "k-1",
    companyId: "c-1",
    category: "policy",
    title: "标题",
    content: "内容",
    tags: [],
    isActive: true,
    createdAt: "",
    updatedAt: "",
    ...overrides
  } as KnowledgeItem;
}

// buildKnowledgeSummary — 计数与启用统计
const summary = buildKnowledgeSummary([
  makeItem({ id: "1", category: "regulation", isActive: true }),
  makeItem({ id: "2", category: "policy", isActive: false }),
  makeItem({ id: "3", category: "policy", isActive: true }),
  makeItem({ id: "4", category: "faq", isActive: true })
]);

assertEqual(summary.total, 4, "total 应为 4");
assertEqual(summary.activeCount, 3, "启用数应为 3");
assertEqual(summary.inactiveCount, 1, "停用数应为 1");
assertEqual(summary.breakdown.length, 4, "应有 4 个分类");
assertEqual(
  summary.breakdown.find((b) => b.category === "policy")?.count,
  2,
  "制度分类计数应为 2"
);
assertEqual(
  summary.breakdown.find((b) => b.category === "template")?.count,
  0,
  "模板分类计数应为 0"
);

// 空集合
const empty = buildKnowledgeSummary([]);
assertEqual(empty.total, 0, "空集合 total 为 0");
assertEqual(empty.activeCount, 0, "空集合启用数为 0");

// parseTags — 去重、分隔符、空白过滤
assertEqual(
  JSON.stringify(parseTags("增值税, 小规模，2024  增值税")),
  JSON.stringify(["增值税", "小规模", "2024"]),
  "parseTags 应去重并按多分隔符拆分"
);
assertEqual(JSON.stringify(parseTags("   ")), JSON.stringify([]), "纯空白应返回空数组");
