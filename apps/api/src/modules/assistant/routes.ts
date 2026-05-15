import type { ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";
import { query } from "../../db/client.js";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";

const MODEL = "claude-sonnet-4-6";

function buildSystemPrompt(ctx: {
  companyName: string;
  today: string;
  recentEvents: string;
  pendingTasks: string;
}): string {
  return `你是「财税秘书」，一个专为中国中小企业设计的 AI 财税助手。你服务于 ${ctx.companyName}。

今天是 ${ctx.today}。

## 近期经营事项（最多 5 条）
${ctx.recentEvents || "暂无数据"}

## 待处理任务（最多 5 条）
${ctx.pendingTasks || "暂无数据"}

## 你的职责

1. **经营事项识别**：识别用户描述中的销售、采购、费用、工资、税务、资产等经营事项，提取关键要素（金额、日期、对方、币种）。
2. **会计建议**：给出科目参考、借贷方向、凭证摘要建议，遵循小企业会计准则。
3. **税务建议**：识别增值税、个税、印花税、企业所得税影响，提示申报期限和注意事项。
4. **风险提示**：识别可能的财税风险，如缺票、超限、口径不一致等。
5. **任务拆解**：将复杂事项拆解为若干可执行的财务任务，并指明负责岗位。
6. **资料清单**：列出所需的单据、合同、发票、银行流水等原始凭证。

## 回复规范

- 语言：简体中文，专业但清晰
- 格式：善用结构化输出（标题、列表），重要数字加粗
- 长度：通常 200–600 字，复杂事项不超过 1000 字
- 如果识别出经营事项，在回复末尾用如下格式附上建议动作：

\`\`\`action
{"type":"sales|procurement|expense|payroll|tax|asset|financing|rnd|general","title":"事项简述","amount":数字或null,"currency":"CNY","occurredOn":"YYYY-MM-DD或null","description":"补充说明"}
\`\`\`

如果没有可识别的经营事项，不要输出 action 块。`;
}

async function loadContext(companyId: string): Promise<{
  companyName: string;
  recentEvents: string;
  pendingTasks: string;
}> {
  const [companyRes, eventsRes, tasksRes] = await Promise.all([
    query<{ name: string }>(
      "select name from companies where id = $1 limit 1",
      [companyId]
    ),
    query<{ title: string; type: string; amount: string | null; occurred_on: string }>(
      `select title, type, amount::text, occurred_on::text
       from business_events
       where company_id = $1
       order by created_at desc limit 5`,
      [companyId]
    ),
    query<{ title: string; status: string }>(
      `select title, status
       from tasks
       where company_id = $1 and status not in ('done','cancelled')
       order by created_at desc limit 5`,
      [companyId]
    )
  ]);

  const companyName = companyRes[0]?.name ?? "未知公司";
  const recentEvents = eventsRes.length === 0
    ? ""
    : eventsRes
        .map((e) => `- [${e.type}] ${e.title}${e.amount ? ` ¥${e.amount}` : ""} (${e.occurred_on})`)
        .join("\n");
  const pendingTasks = tasksRes.length === 0
    ? ""
    : tasksRes.map((t) => `- [${t.status}] ${t.title}`).join("\n");

  return { companyName, recentEvents, pendingTasks };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chat(req: ApiRequest, res: ServerResponse): Promise<void> {
  if (!req.auth) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  if (!env.anthropicApiKey) {
    json(res, 503, { error: "ANTHROPIC_API_KEY 未配置，AI 助手暂不可用。" });
    return;
  }

  const body = (req.body ?? {}) as { messages?: ChatMessage[] };
  const messages: ChatMessage[] = body.messages ?? [];
  if (messages.length === 0) {
    json(res, 400, { error: "messages 不能为空" });
    return;
  }

  const ctx = await loadContext(req.auth.companyId);
  const systemPrompt = buildSystemPrompt({
    companyName: ctx.companyName,
    today: new Date().toLocaleDateString("zh-CN"),
    recentEvents: ctx.recentEvents,
    pendingTasks: ctx.pendingTasks
  });

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });

  let fullText = "";

  try {
    const stream = client.messages.stream({
      model: MODEL,
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
        res.write(`data: ${JSON.stringify({ type: "delta", text: chunk })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done", fullText })}\n\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI 调用失败";
    res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`);
  }

  res.end();
}
