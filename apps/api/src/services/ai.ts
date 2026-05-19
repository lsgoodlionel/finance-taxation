import type { ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { queryOne } from "../db/client.js";
import { env } from "../config/env.js";

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
    defaultBaseUrl: "https://api.deepseek.com",
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
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
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
