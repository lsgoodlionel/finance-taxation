import type { ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";
import { query } from "../../db/client.js";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";

const MODEL = "claude-sonnet-4-6";

interface FinancialContext {
  companyName: string;
  today: string;
  cashBalance: number;
  receivables: number;
  taxLiability: number;
  revenueThisMonth: number;
  expenseThisMonth: number;
  riskEventCount: number;
  pendingTaskCount: number;
  recentEvents: string;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function buildBossSystemPrompt(ctx: FinancialContext): string {
  const profitEstimate = ctx.revenueThisMonth - ctx.expenseThisMonth;
  return `你是「老板专线」AI 财务顾问，专为 ${ctx.companyName} 的董事长/总经理提供即席财务问答。

## 今日（${ctx.today}）财务快照

| 指标 | 金额（元）|
|------|---------|
| 可动用资金（现金/银行） | ¥${fmt(ctx.cashBalance)} |
| 待回款金额（应收账款） | ¥${fmt(ctx.receivables)} |
| 本月预计税负 | ¥${fmt(ctx.taxLiability)} |
| 本月收入 | ¥${fmt(ctx.revenueThisMonth)} |
| 本月支出 | ¥${fmt(ctx.expenseThisMonth)} |
| 本月利润估算 | ¥${fmt(profitEstimate)} |
| 高风险事项数 | ${ctx.riskEventCount} 件 |
| 待处理任务数 | ${ctx.pendingTaskCount} 件 |

## 近期经营事项（最多 10 条）
${ctx.recentEvents || "暂无数据"}

## 回答规范

1. **直接回答**：老板提问通常很精简，直接给出数字和结论，无需铺垫
2. **数字优先**：关键财务数字加粗，明确单位（元/万元）
3. **风险提示**：如发现潜在风险或异常，主动提醒
4. **行动建议**：每次回答末尾附 1-3 条可执行的建议动作
5. **语言风格**：简洁专业，避免财务术语堆砌，用老板听得懂的语言
6. **长度控制**：简单问题 50-150 字，复杂问题不超过 400 字

如果问题超出当前财务数据范围，坦诚告知并建议查询路径。`;
}

async function loadBossContext(companyId: string): Promise<FinancialContext> {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [companyRes, eventsRes, pendingTasksRes, ledgerRes] = await Promise.all([
    query<{ name: string }>("select name from companies where id = $1 limit 1", [companyId]),
    query<{ title: string; type: string; amount: string | null; status: string; occurred_on: string }>(
      `select title, type, amount::text, status, occurred_on::text
       from business_events where company_id = $1
       order by created_at desc limit 10`,
      [companyId]
    ),
    query<{ cnt: string }>(
      `select count(*)::int as cnt from tasks_v2
       where company_id = $1 and status not in ('done', 'cancelled')`,
      [companyId]
    ),
    query<{ account_code: string; debit: string; credit: string }>(
      `select account_code, debit::text, credit::text from ledger_entries
       where company_id = $1`,
      [companyId]
    )
  ]);

  const companyName = companyRes[0]?.name ?? "未知公司";

  function sumPrefix(prefix: string): number {
    return ledgerRes
      .filter((e) => e.account_code.startsWith(prefix))
      .reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
  }

  const cashBalance = sumPrefix("1002");
  const receivables = sumPrefix("1122");
  const taxLiability = -sumPrefix("2221");

  const monthLedger = await query<{ account_code: string; debit: string; credit: string }>(
    `select account_code, debit::text, credit::text from ledger_entries
     where company_id = $1 and entry_date >= $2`,
    [companyId, currentMonth + "-01"]
  );

  const revenueThisMonth = monthLedger
    .filter((e) => e.account_code.startsWith("6001") || e.account_code.startsWith("6002"))
    .reduce((acc, e) => acc + Number(e.credit || 0) - Number(e.debit || 0), 0);

  const expenseThisMonth = monthLedger
    .filter((e) => e.account_code.startsWith("6601") || e.account_code.startsWith("6602") || e.account_code.startsWith("6603"))
    .reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);

  const riskEventCount = eventsRes.filter((e) => e.status === "blocked").length;
  const pendingTaskCount = Number(pendingTasksRes[0]?.cnt ?? 0);

  const recentEvents = eventsRes.length === 0
    ? ""
    : eventsRes
        .map((e) => `- [${e.type}/${e.status}] ${e.title}${e.amount ? ` ¥${e.amount}` : ""} (${e.occurred_on})`)
        .join("\n");

  return {
    companyName,
    today: new Date().toLocaleDateString("zh-CN"),
    cashBalance,
    receivables,
    taxLiability,
    revenueThisMonth,
    expenseThisMonth,
    riskEventCount,
    pendingTaskCount,
    recentEvents
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function bossChat(req: ApiRequest, res: ServerResponse): Promise<void> {
  if (!req.auth) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  if (!env.anthropicApiKey) {
    json(res, 503, { error: "ANTHROPIC_API_KEY 未配置，老板问答暂不可用。" });
    return;
  }

  const body = (req.body ?? {}) as { messages?: ChatMessage[] };
  const messages: ChatMessage[] = body.messages ?? [];
  if (messages.length === 0) {
    json(res, 400, { error: "messages 不能为空" });
    return;
  }

  const ctx = await loadBossContext(req.auth.companyId);
  const systemPrompt = buildBossSystemPrompt(ctx);
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
      max_tokens: 1024,
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
