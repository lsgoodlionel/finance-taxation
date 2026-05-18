import type { ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type SseWriter = (event: object) => void;

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

async function streamAnthropic(
  res: ServerResponse,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<void> {
  const client = new Anthropic({ apiKey: env.anthropicApiKey! });
  let fullText = "";

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content }))
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const chunk = event.delta.text;
      fullText += chunk;
      writeSse(res, { type: "delta", text: chunk });
    }
  }

  writeSse(res, { type: "done", fullText });
}

async function streamOllama(
  res: ServerResponse,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<void> {
  const url = `${env.ollamaBaseUrl}/v1/chat/completions`;
  const body = JSON.stringify({
    model: env.ollamaModel,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ]
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama 请求失败: HTTP ${response.status}`);
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

export async function streamChat(
  res: ServerResponse,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<void> {
  startSseResponse(res);

  try {
    if (env.anthropicApiKey) {
      await streamAnthropic(res, systemPrompt, messages);
    } else {
      await streamOllama(res, systemPrompt, messages);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI 调用失败";
    writeSse(res, { type: "error", error: msg });
  }

  res.end();
}

export function isAiAvailable(): boolean {
  return Boolean(env.anthropicApiKey) || Boolean(env.ollamaBaseUrl);
}
