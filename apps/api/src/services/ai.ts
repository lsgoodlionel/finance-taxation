import { createRequire } from "node:module";
import type { ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { queryOne } from "../db/client.js";
import { env } from "../config/env.js";

const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type SseWriter = (event: object) => void;

// ─── Provider definitions ────────────────────────────────────────────────────

export interface AiProviderInfo {
  id: string;
  name: string;
  authType: "apiKey" | "none";
  models: { id: string; name: string }[];
  defaultBaseUrl: string;
  keyPlaceholder: string;
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    authType: "apiKey",
    models: [
      { id: "claude-opus-4-7", name: "Claude Opus 4.7（最强推理）" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6（推荐）" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5（快速）" }
    ],
    defaultBaseUrl: "https://api.anthropic.com",
    keyPlaceholder: "sk-ant-api03-..."
  },
  {
    id: "openai",
    name: "OpenAI",
    authType: "apiKey",
    models: [
      { id: "gpt-4o", name: "GPT-4o（推荐）" },
      { id: "gpt-4o-mini", name: "GPT-4o mini（快速低价）" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" }
    ],
    defaultBaseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-..."
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    authType: "apiKey",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3（推荐）" },
      { id: "deepseek-reasoner", name: "DeepSeek R1（推理）" }
    ],
    defaultBaseUrl: "https://api.deepseek.com/v1",
    keyPlaceholder: "sk-..."
  },
  {
    id: "zhipu",
    name: "智谱 AI（GLM）",
    authType: "apiKey",
    models: [
      { id: "glm-4", name: "GLM-4（旗舰）" },
      { id: "glm-4-flash", name: "GLM-4 Flash（免费）" },
      { id: "glm-4-air", name: "GLM-4 Air（轻量）" }
    ],
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyPlaceholder: "API Key"
  },
  {
    id: "qwen",
    name: "通义千问（阿里云）",
    authType: "apiKey",
    models: [
      { id: "qwen-max", name: "Qwen Max（旗舰）" },
      { id: "qwen-plus", name: "Qwen Plus（推荐）" },
      { id: "qwen-turbo", name: "Qwen Turbo（快速）" },
      { id: "qwen-long", name: "Qwen Long（长文档）" }
    ],
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyPlaceholder: "sk-..."
  },
  {
    id: "moonshot",
    name: "月之暗面（Kimi）",
    authType: "apiKey",
    models: [
      { id: "moonshot-v1-8k", name: "Moonshot v1 8k" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32k（推荐）" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128k（长文档）" }
    ],
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    keyPlaceholder: "sk-..."
  },
  {
    id: "ollama",
    name: "Ollama（本地）",
    authType: "none",
    models: [],
    defaultBaseUrl: "http://localhost:11434",
    keyPlaceholder: ""
  }
];

// Build the full /chat/completions URL, appending /v1 when the base URL has no version segment.
// This fixes providers like DeepSeek whose legacy stored base_url lacks /v1.
function buildChatUrl(base: string): string {
  const b = base.replace(/\/+$/, "");
  // Already versioned: /v1, /v4, /compatible-mode/v1, /api/paas/v4, etc.
  if (/\/v\d+$/.test(b) || /\/compatible-mode\/v\d+$/.test(b) || /\/paas\/v\d+$/.test(b)) {
    return `${b}/chat/completions`;
  }
  return `${b}/v1/chat/completions`;
}

// ─── DB config ───────────────────────────────────────────────────────────────

export interface AiConfig {
  provider: string;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
  extraConfig: Record<string, string> | null;
}

interface AiConfigRow {
  provider: string;
  model: string;
  api_key: string | null;
  base_url: string | null;
  extra_config: Record<string, string> | null;
}

export async function loadAiConfig(companyId: string): Promise<AiConfig> {
  const row = await queryOne<AiConfigRow>(
    "select provider, model, api_key, base_url, extra_config from ai_configs where company_id = $1",
    [companyId]
  );

  if (row) {
    return {
      provider: row.provider,
      model: row.model,
      apiKey: row.api_key,
      baseUrl: row.base_url,
      extraConfig: row.extra_config
    };
  }

  // Fall back to env vars
  if (env.anthropicApiKey) {
    return { provider: "anthropic", model: "claude-sonnet-4-6", apiKey: env.anthropicApiKey, baseUrl: null, extraConfig: null };
  }
  return { provider: "ollama", model: env.ollamaModel, apiKey: null, baseUrl: env.ollamaBaseUrl, extraConfig: null };
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function writeSse(res: ServerResponse, payload: object): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function startSseResponse(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
}

// ─── Provider streaming ───────────────────────────────────────────────────────

async function streamAnthropic(
  res: ServerResponse,
  systemPrompt: string,
  messages: ChatMessage[],
  apiKey: string,
  model: string
): Promise<void> {
  const client = new Anthropic({ apiKey });
  let fullText = "";

  const stream = client.messages.stream({
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content }))
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const chunk = event.delta.text;
      fullText += chunk;
      writeSse(res, { type: "delta", text: chunk });
    }
  }

  writeSse(res, { type: "done", fullText });
}

async function streamOpenAiCompat(
  res: ServerResponse,
  systemPrompt: string,
  messages: ChatMessage[],
  baseUrl: string,
  model: string,
  apiKey: string
): Promise<void> {
  const url = buildChatUrl(baseUrl);
  const body = JSON.stringify({
    model,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ]
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => "");
    throw new Error(`${url} 请求失败: HTTP ${response.status} ${errText.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw) as {
          choices?: { delta?: { content?: string } }[];
        };
        const chunk = parsed.choices?.[0]?.delta?.content;
        if (chunk) {
          fullText += chunk;
          writeSse(res, { type: "delta", text: chunk });
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  writeSse(res, { type: "done", fullText });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function streamChat(
  res: ServerResponse,
  systemPrompt: string,
  messages: ChatMessage[],
  companyId: string
): Promise<void> {
  startSseResponse(res);

  try {
    const cfg = await loadAiConfig(companyId);

    if (cfg.provider === "anthropic") {
      if (!cfg.apiKey) throw new Error("Anthropic API Key 未配置");
      await streamAnthropic(res, systemPrompt, messages, cfg.apiKey, cfg.model);
    } else if (cfg.provider === "ollama") {
      const base = cfg.baseUrl || env.ollamaBaseUrl;
      await streamOpenAiCompat(res, systemPrompt, messages, `${base}/v1`, cfg.model, "ollama");
    } else {
      // OpenAI-compatible providers
      const providerInfo = AI_PROVIDERS.find((p) => p.id === cfg.provider);
      const base = cfg.baseUrl || providerInfo?.defaultBaseUrl || "";
      if (!base) throw new Error(`未知 provider: ${cfg.provider}`);
      if (!cfg.apiKey) throw new Error(`${cfg.provider} API Key 未配置`);
      await streamOpenAiCompat(res, systemPrompt, messages, base, cfg.model, cfg.apiKey);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI 调用失败";
    writeSse(res, { type: "error", error: msg });
  }

  res.end();
}

export async function isAiConfigured(companyId: string): Promise<boolean> {
  const cfg = await loadAiConfig(companyId);
  if (cfg.provider === "ollama") return Boolean(cfg.baseUrl || env.ollamaBaseUrl);
  return Boolean(cfg.apiKey);
}

export function isAiAvailable(): boolean {
  return Boolean(env.anthropicApiKey) || Boolean(env.ollamaBaseUrl);
}

// ─── OCR (multimodal, non-streaming) ─────────────────────────────────────────

const OCR_PROMPT = `你是一个专业的财务凭证识别助手。请仔细识别这张图片中的凭证信息，按以下格式输出：

凭证类型：（增值税发票/普通发票/银行回单/收据/报销单/其他）
开票/签发日期：
含税金额：
税额：（如有）
对方单位名称：
商品/服务内容：
发票号码/流水号：（如有）
备注：（其他重要信息）

最后用一句话总结：这是一张[类型]，金额[X元]，日期[X]，来自[对方单位]，涉及[内容]。

如果图片不清晰或无法识别，请说明原因。`;

async function ocrAnthropic(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  model: string
): Promise<string> {
  const client = new Anthropic({ apiKey });

  type AnthropicContent =
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
    | { type: "text"; text: string };

  const fileBlock: AnthropicContent = mimeType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imageBase64 } };

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [fileBlock, { type: "text", text: OCR_PROMPT }]
    }]
  });
  const block = response.content[0];
  return block?.type === "text" ? block.text : "识别失败";
}

async function ocrOpenAiCompat(
  imageBase64: string,
  mimeType: string,
  baseUrl: string,
  model: string,
  apiKey: string
): Promise<string> {
  const url = buildChatUrl(baseUrl);

  let userContent: unknown[];
  if (mimeType === "application/pdf") {
    // Extract text from PDF and send as plain text (works with all providers)
    const buffer = Buffer.from(imageBase64, "base64");
    const parsed = await pdfParse(buffer);
    const pdfText = parsed.text.slice(0, 4000);
    userContent = [{ type: "text", text: `${OCR_PROMPT}\n\n以下是从 PDF 提取的文字内容：\n${pdfText}` }];
  } else {
    userContent = [
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      { type: "text", text: OCR_PROMPT }
    ];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: userContent }] }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OCR 请求失败: HTTP ${response.status} ${errText.slice(0, 200)}`);
  }
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "识别失败";
}

export async function ocrImage(
  imageBase64: string,
  mimeType: string,
  companyId: string
): Promise<string> {
  const cfg = await loadAiConfig(companyId);

  if (cfg.provider === "anthropic") {
    if (!cfg.apiKey) throw new Error("Anthropic API Key 未配置");
    return ocrAnthropic(imageBase64, mimeType, cfg.apiKey, cfg.model);
  }

  if (cfg.provider === "ollama") {
    const base = cfg.baseUrl || env.ollamaBaseUrl;
    return ocrOpenAiCompat(imageBase64, mimeType, `${base}/v1`, cfg.model, "ollama");
  }

  const providerInfo = AI_PROVIDERS.find((p) => p.id === cfg.provider);
  const base = cfg.baseUrl || providerInfo?.defaultBaseUrl || "";
  if (!base) throw new Error(`未知 provider: ${cfg.provider}`);
  if (!cfg.apiKey) throw new Error(`${cfg.provider} API Key 未配置`);
  return ocrOpenAiCompat(imageBase64, mimeType, base, cfg.model, cfg.apiKey);
}

// ─── Knowledge extraction ────────────────────────────────────────────────────

export interface KnowledgeExtractResult {
  title: string;
  category: "regulation" | "policy" | "faq" | "template";
  content: string;
  tags: string[];
}

const KNOWLEDGE_EXTRACT_PROMPT = `你是企业制度库智能录入助手。请分析文档内容，提取关键信息，严格按 JSON 格式输出。

字段说明：
- title：文档标题（不超过50字）
- category：必须是以下之一 regulation（法律法规/国家政策）、policy（企业内部制度/流程/规定）、faq（常见问题解答）、template（表格模板/范本）
- content：核心内容摘要（300-800字，保留关键要点、金额、比例、时间节点等重要数字）
- tags：关键标签数组（3-8个词，如["增值税","小规模纳税人","申报"]）

仅输出合法 JSON，不要任何其他文字：
{"title":"...","category":"...","content":"...","tags":["..."]}`;

export async function extractKnowledgeFromDocument(
  input: { type: "pdf"; base64: string } | { type: "text"; text: string },
  companyId: string
): Promise<KnowledgeExtractResult> {
  const cfg = await loadAiConfig(companyId);

  let rawJson: string;

  if (cfg.provider === "anthropic") {
    if (!cfg.apiKey) throw new Error("Anthropic API Key 未配置");
    const client = new Anthropic({ apiKey: cfg.apiKey });

    type ContentBlock =
      | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
      | { type: "text"; text: string };

    const contentBlocks: ContentBlock[] =
      input.type === "pdf"
        ? [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } },
            { type: "text", text: KNOWLEDGE_EXTRACT_PROMPT }
          ]
        : [{ type: "text", text: `${KNOWLEDGE_EXTRACT_PROMPT}\n\n文档内容：\n${input.text}` }];

    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: contentBlocks as Parameters<typeof client.messages.create>[0]["messages"][0]["content"] }]
    });
    rawJson = (response.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined)?.text ?? "";
  } else {
    const providerInfo = AI_PROVIDERS.find((p) => p.id === cfg.provider);
    const base = cfg.provider === "ollama"
      ? (cfg.baseUrl || env.ollamaBaseUrl)
      : (cfg.baseUrl || providerInfo?.defaultBaseUrl || "");
    if (!base) throw new Error(`未知 provider: ${cfg.provider}`);
    const apiKey = cfg.provider === "ollama" ? "ollama" : cfg.apiKey;
    if (!apiKey) throw new Error(`${cfg.provider} API Key 未配置`);

    const userText = input.type === "pdf"
      ? `${KNOWLEDGE_EXTRACT_PROMPT}\n\n（注：PDF 文件内容请通过文件中的文字提取）`
      : `${KNOWLEDGE_EXTRACT_PROMPT}\n\n文档内容：\n${input.text.slice(0, 8000)}`;

    const chatUrl = buildChatUrl(base);
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        messages: [{ role: "user", content: userText }]
      }),
      signal: AbortSignal.timeout(180000)
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`AI 调用失败 (${response.status})：${errText.slice(0, 200) || "请检查 AI 配置中的 Base URL 和 API Key"}`);
    }
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    rawJson = data.choices?.[0]?.message?.content ?? "";
  }

  const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 未返回有效 JSON");

  const parsed = JSON.parse(jsonMatch[0]) as {
    title?: string;
    category?: string;
    content?: string;
    tags?: unknown;
  };

  const validCategories = ["regulation", "policy", "faq", "template"];
  return {
    title: String(parsed.title ?? "").trim() || "未知标题",
    category: validCategories.includes(parsed.category ?? "") ? parsed.category as KnowledgeExtractResult["category"] : "policy",
    content: String(parsed.content ?? "").trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).filter(Boolean) : []
  };
}

// ─── Ollama model list ────────────────────────────────────────────────────────

export interface OllamaModel {
  name: string;
  size: number;
  modifiedAt: string;
}

export async function listOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Ollama ${url} 响应 ${response.status}`);
  const data = (await response.json()) as {
    models?: { name: string; size: number; modified_at: string }[];
  };
  return (data.models ?? []).map((m) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at
  }));
}
