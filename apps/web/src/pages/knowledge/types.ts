import type { ParsedKnowledgeItem } from "../../lib/api";

export type Category = "regulation" | "policy" | "faq" | "template";

export const CATEGORIES: { value: Category | ""; label: string }[] = [
  { value: "", label: "全部" },
  { value: "regulation", label: "法规" },
  { value: "policy", label: "制度" },
  { value: "faq", label: "问答" },
  { value: "template", label: "模板" }
];

export const CATEGORY_COLORS: Record<string, string> = {
  regulation: "#1d4ed8",
  policy: "#15803d",
  faq: "#b45309",
  template: "#7c3aed"
};

export interface KnowledgeForm {
  category: Category;
  title: string;
  content: string;
  tags: string;
}

export const BLANK_FORM: KnowledgeForm = {
  category: "policy",
  title: "",
  content: "",
  tags: ""
};

export interface FileParseState {
  file: File;
  status: "pending" | "parsing" | "done" | "error";
  result?: ParsedKnowledgeItem;
  error?: string;
}

export function categoryLabel(category: string): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
