import type { ChatMessage } from "../../services/ai.js";

export interface DeterministicAssistantReply {
  content: string;
  actionText: string | null;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function stripTrailingActionPhrases(input: string): string {
  return normalizeWhitespace(
    input
      .replace(
        /\s*(?:准备|申请|提交|发起|进行|需要|待|安排)?(?:报销|入账|处理|审批|开票|付款|报税|申报|归档)$/u,
        ""
      )
      .replace(/\s*(?:用于|需要)\s*$/u, "")
  );
}

function inferEventType(input: string) {
  if (/(工资|社保|公积金|个税)/.test(input)) return "payroll";
  if (/(研发|加计扣除)/.test(input)) return "rnd";
  if (/(合同|开票|回款|收入)/.test(input)) return "sales";
  if (/(固定资产|电脑|显示器|办公用品|采购|报销|发票|购置)/.test(input)) return "expense";
  if (/(税|申报|纳税)/.test(input)) return "tax";
  return "general";
}

function inferAmount(input: string): number | null {
  const withUnit = [...input.matchAll(/(\d+(?:\.\d+)?)\s*(万|万元|元)/g)];
  const match = withUnit.at(-1) ?? input.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (match[2] === "万" || match[2] === "万元") {
    return amount * 10000;
  }
  return amount;
}

function inferOccurredOn(input: string): string | null {
  const isoDate = input.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDate?.[1]) return isoDate[1];

  const zhDate = input.match(/\b(20\d{2})年(\d{1,2})月(\d{1,2})日\b/);
  if (!zhDate) return null;
  const [, year, month, day] = zhDate;
  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

function inferTitle(input: string, eventType: string): string {
  const cleaned = stripTrailingActionPhrases(
    normalizeWhitespace(
      input
      .replace(/\b(20\d{2}-\d{2}-\d{2})\b/g, "")
      .replace(/\b(20\d{2})年(\d{1,2})月(\d{1,2})日\b/g, "")
      .replace(/(\d+(?:\.\d+)?)\s*(万|万元|元)/g, "")
      .replace(/[，。；：,.!?！？]/g, " ")
    )
  );
  if (cleaned) return cleaned.slice(0, 40);

  switch (eventType) {
    case "expense":
      return "办公采购报销事项";
    case "payroll":
      return "工资与个税处理事项";
    case "sales":
      return "合同开票回款事项";
    case "tax":
      return "税务申报复核事项";
    default:
      return "经营事项";
  }
}

function buildStaffAction(messages: ChatMessage[]): DeterministicAssistantReply {
  const lastUserMessage = normalizeWhitespace(
    messages.filter((message) => message.role === "user").at(-1)?.content ?? ""
  );
  const eventType = inferEventType(lastUserMessage);
  const occurredOn = inferOccurredOn(lastUserMessage);
  const amount = inferAmount(lastUserMessage);
  const title = inferTitle(lastUserMessage, eventType);
  const action = {
    type: eventType,
    title,
    amount,
    currency: "CNY",
    occurredOn,
    description: `测试环境 deterministic assistant 已识别事项：${title}`
  };

  const actionText = `\`\`\`action\n${JSON.stringify(action, null, 2)}\n\`\`\``;
  const content = [
    "已识别一条可落地的经营事项，建议直接创建并进入自动分析。",
    "",
    "建议动作：",
    "1. 创建经营事项并自动生成任务、单据、税务事项与凭证草稿。",
    "2. 财务复核报销资料完整性、费用口径与进项税处理。",
    "3. 如有发票或回单附件，创建后自动挂载到生成单据。"
  ].join("\n");

  return { content, actionText };
}

function buildBossReply(messages: ChatMessage[]): DeterministicAssistantReply {
  const lastUserMessage = normalizeWhitespace(
    messages.filter((message) => message.role === "user").at(-1)?.content ?? ""
  );
  return {
    content: `测试环境老板视角回复：已收到问题「${lastUserMessage || "未提供内容"}」。当前建议先查看现金、税务与待办三项指标，再决定是否下钻到具体事项。`,
    actionText: null
  };
}

export function buildDeterministicAssistantReply(
  messages: ChatMessage[],
  mode: "boss" | "staff"
): DeterministicAssistantReply {
  return mode === "boss" ? buildBossReply(messages) : buildStaffAction(messages);
}

export function buildDeterministicOcrText(mimeType: string): string {
  const docType = mimeType === "application/pdf" ? "PDF票据" : "图片票据";
  return [
    `凭证类型：${docType}`,
    "开票/签发日期：2026-06-26",
    "含税金额：1999.00",
    "税额：259.87",
    "对方单位名称：测试供应商",
    "商品/服务内容：办公显示器",
    "发票号码/流水号：TEST-20260626-001",
    "备注：测试环境 OCR fallback 结果",
    "",
    `最后用一句话总结：这是一张${docType}，金额1999元，日期2026-06-26，来自测试供应商，涉及办公显示器。`
  ].join("\n");
}
