import type { ServerResponse } from "node:http";
import { query } from "../../db/client.js";
import { searchKnowledgeForAi } from "../knowledge/routes.js";
import { json } from "../../utils/http.js";
import { streamChat, ocrImage, isAiConfigured } from "../../services/ai.js";
import type { ChatMessage } from "../../services/ai.js";
import type { ApiRequest } from "../../types.js";
import { buildDeterministicAssistantReply, buildDeterministicOcrText } from "./fallback.js";

const BOSS_ROLES = new Set(["role-chairman", "role-finance-director"]);
const TEST_ASSISTANT_FALLBACK = process.env.NODE_ENV === "test";

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

function streamDeterministicAssistant(
  res: ServerResponse,
  messages: ChatMessage[],
  mode: "boss" | "staff"
): void {
  startSseResponse(res);
  const reply = buildDeterministicAssistantReply(messages, mode);
  const fullText = reply.actionText ? `${reply.content}\n\n${reply.actionText}` : reply.content;
  writeSse(res, { type: "delta", text: fullText });
  writeSse(res, { type: "done", fullText });
  res.end();
}

function isBossUser(roleCodes: string[]): boolean {
  return roleCodes.some((r) => BOSS_ROLES.has(r));
}

// ─── Staff (财税秘书) mode ──────────────────────────────────────────────────

function buildStaffSystemPrompt(ctx: {
  companyName: string;
  today: string;
  recentEvents: string;
  pendingTasks: string;
  knowledgeContext: string;
}): string {
  return `你是「AI财税助手」，一个专为中国中小企业设计的 AI 财税助手。你服务于 ${ctx.companyName}。

今天是 ${ctx.today}。

## 近期经营事项（最多 5 条）
${ctx.recentEvents || "暂无数据"}

## 待处理任务（最多 5 条）
${ctx.pendingTasks || "暂无数据"}${ctx.knowledgeContext}

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
- 如果识别出经营事项，在回复末尾用如下格式附上建议动作（每个事项一个 action 块）：

\`\`\`action
{"type":"sales|procurement|expense|payroll|tax|asset|financing|rnd|general","title":"事项简述","amount":数字或null,"currency":"CNY","occurredOn":"YYYY-MM-DD或null","description":"补充说明"}
\`\`\`

**重要规则：**
- 如果用户描述的是跨多个月份的重复性收付款（如"2月/3月/4月/5月各25元"），必须为每个月份分别输出一个独立的 action 块，每块对应一个月份，occurredOn 设为该月最后一天（如2026-02-28）。不要合并为一笔汇总金额。
- 如果没有可识别的经营事项，不要输出 action 块。`;
}

async function loadStaffContext(companyId: string) {
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

// ─── Boss (老板) mode ───────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function buildBossSystemPrompt(ctx: {
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
  cashForecast: string;
}): string {
  const profitEstimate = ctx.revenueThisMonth - ctx.expenseThisMonth;
  return `你是「AI财税助手」，专为 ${ctx.companyName} 的董事长/总经理提供即席财务问答。

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

## 资金前瞻
${ctx.cashForecast}

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

async function loadBossContext(companyId: string) {
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
      `select count(*)::int as cnt from tasks
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
    .filter((e) =>
      e.account_code.startsWith("6601") ||
      e.account_code.startsWith("6602") ||
      e.account_code.startsWith("6603")
    )
    .reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);

  const riskEventCount = eventsRes.filter((e) => e.status === "blocked").length;
  const pendingTaskCount = Number(pendingTasksRes[0]?.cnt ?? 0);

  // P7-B1：资金前瞻（注入老板问答上下文，可回答「还能发工资吗」）
  let cashForecast = "暂无资金前瞻数据";
  try {
    const { gatherCashForecastInput } = await import("../forecast/routes.js");
    const { buildCashForecast } = await import("../forecast/cash-forecast.js");
    const fc = buildCashForecast(await gatherCashForecastInput(companyId, currentMonth));
    cashForecast = `- 可动用资金 ¥${fmt(fc.cashBalance)}，本期工资社保刚性支出 ¥${fmt(fc.salaryNeed)}\n- ${fc.verdict}`;
  } catch { /* 前瞻失败不阻塞问答 */ }

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
    recentEvents,
    cashForecast
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function chat(req: ApiRequest, res: ServerResponse): Promise<void> {
  if (!req.auth) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  const body = (req.body ?? {}) as { messages?: ChatMessage[]; mode?: "boss" | "staff" };
  const messages: ChatMessage[] = body.messages ?? [];
  if (messages.length === 0) {
    json(res, 400, { error: "messages 不能为空" });
    return;
  }

  const boss = body.mode === "boss" ? true : body.mode === "staff" ? false : isBossUser(req.auth.roleCodes);
  if (TEST_ASSISTANT_FALLBACK) {
    streamDeterministicAssistant(res, messages, boss ? "boss" : "staff");
    return;
  }

  if (!(await isAiConfigured(req.auth.companyId))) {
    json(res, 503, { error: "AI 服务未配置，请在系统设置中配置 AI 后端。" });
    return;
  }

  let systemPrompt: string;

  if (boss) {
    const ctx = await loadBossContext(req.auth.companyId);
    systemPrompt = buildBossSystemPrompt(ctx);
  } else {
    const lastUserMessage = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const [ctx, knowledgeContext] = await Promise.all([
      loadStaffContext(req.auth.companyId),
      searchKnowledgeForAi(req.auth.companyId, lastUserMessage).catch(() => "")
    ]);
    systemPrompt = buildStaffSystemPrompt({
      companyName: ctx.companyName,
      today: new Date().toLocaleDateString("zh-CN"),
      recentEvents: ctx.recentEvents,
      pendingTasks: ctx.pendingTasks,
      knowledgeContext
    });
  }

  await streamChat(res, systemPrompt, messages, req.auth.companyId);
}

export async function ocr(req: ApiRequest, res: ServerResponse): Promise<void> {
  if (!req.auth) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  if (TEST_ASSISTANT_FALLBACK) {
    const body = (req.body ?? {}) as { mimeType?: string };
    json(res, 200, { text: buildDeterministicOcrText(body.mimeType ?? "image/jpeg") });
    return;
  }

  if (!(await isAiConfigured(req.auth.companyId))) {
    json(res, 503, { error: "AI 服务未配置，请在系统设置中配置 AI 后端。" });
    return;
  }

  const body = (req.body ?? {}) as { imageBase64?: string; mimeType?: string };
  if (!body.imageBase64) {
    json(res, 400, { error: "imageBase64 不能为空" });
    return;
  }

  const mimeType = body.mimeType ?? "image/jpeg";
  if (body.imageBase64.length > 20 * 1024 * 1024) {
    json(res, 400, { error: "图片数据过大（最大 15MB）" });
    return;
  }

  try {
    const text = await ocrImage(body.imageBase64, mimeType, req.auth.companyId);
    json(res, 200, { text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "图片识别失败";
    json(res, 500, { error: msg });
  }
}
