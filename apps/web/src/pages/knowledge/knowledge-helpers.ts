import type { KnowledgeItem } from "@finance-taxation/domain-model";
import { CATEGORIES, type Category } from "./types";

export interface CategoryBreakdown {
  category: Category;
  label: string;
  count: number;
}

export interface KnowledgeSummary {
  total: number;
  activeCount: number;
  inactiveCount: number;
  breakdown: CategoryBreakdown[];
}

/**
 * 汇总制度库条目：总数、启用/停用数、按分类计数。
 * summary-first 工作台的核心数据，保持为纯函数以便测试。
 */
export function buildKnowledgeSummary(items: KnowledgeItem[]): KnowledgeSummary {
  const activeCount = items.filter((item) => item.isActive).length;

  const breakdown = CATEGORIES
    .filter((c): c is { value: Category; label: string } => c.value !== "")
    .map(({ value, label }) => ({
      category: value,
      label,
      count: items.filter((item) => item.category === value).length
    }));

  return {
    total: items.length,
    activeCount,
    inactiveCount: items.length - activeCount,
    breakdown
  };
}

/** 把逗号/空格分隔的标签字符串解析为去重后的标签数组。 */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t || seen.has(t)) return false;
      seen.add(t);
      return true;
    });
}
