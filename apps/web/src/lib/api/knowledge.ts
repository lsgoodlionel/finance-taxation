/**
 * 知识库 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import type {
  KnowledgeItem
} from "@finance-taxation/domain-model";
import {
  request,
  requestMultipart
} from "./client";

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export async function listKnowledgeItems(params?: {
  category?: string;
  q?: string;
  includeInactive?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.q) q.set("q", params.q);
  if (params?.includeInactive) q.set("includeInactive", "true");
  const qs = q.toString();
  return request<{ items: KnowledgeItem[]; total: number }>(
    `/api/knowledge${qs ? "?" + qs : ""}`
  );
}

export async function createKnowledgeItem(data: {
  category: string;
  title: string;
  content: string;
  tags?: string[];
}) {
  return request<KnowledgeItem>("/api/knowledge", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateKnowledgeItem(id: string, data: Partial<{
  category: string;
  title: string;
  content: string;
  tags: string[];
  isActive: boolean;
}>) {
  return request<KnowledgeItem>(`/api/knowledge/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function deleteKnowledgeItem(id: string) {
  return request<{ ok: boolean }>(`/api/knowledge/${id}`, { method: "DELETE" });
}

export interface ParsedKnowledgeItem {
  fileName: string;
  title: string;
  category: "regulation" | "policy" | "faq" | "template";
  content: string;
  tags: string[];
  error?: string;
}

export async function parseKnowledgeDocuments(files: File[]): Promise<{ items: ParsedKnowledgeItem[] }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file, file.name);
  }
  return requestMultipart<{ items: ParsedKnowledgeItem[] }>("/api/knowledge/parse-documents", formData);
}
