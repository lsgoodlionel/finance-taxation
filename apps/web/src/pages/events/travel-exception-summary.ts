export interface TravelExceptionSummary {
  tone: "warning" | "error";
  title: string;
  summary: string;
  bullets: string[];
}

interface FixtureEnvelope {
  expected?: {
    exceptions?: string[];
    risks?: string[];
  };
}

function parseEnvelope(description: string): FixtureEnvelope | null {
  if (!description.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(description) as FixtureEnvelope;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function deriveTravelExceptionSummary(
  eventType: string,
  description: string
): TravelExceptionSummary | null {
  if (eventType !== "travel_expense") {
    return null;
  }

  const envelope = parseEnvelope(description);
  const exceptions = new Set(asStrings(envelope?.expected?.exceptions));
  const risks = new Set(asStrings(envelope?.expected?.risks));

  if (exceptions.has("duplicate_trip_claim") || risks.has("duplicate_reimbursement")) {
    return {
      tone: "error",
      title: "当前差旅事项疑似重复报销",
      summary: "系统已阻止继续生成正式凭证，建议先核对历史行程、票据和入账记录。",
      bullets: [
        "交通和住宿票据当前不应继续进入正式抵扣。",
        "建议由财务部确认保留哪条报销主链，其余重复事项关闭或并单。",
        "风险检查会保留重复差旅报销留痕。"
      ]
    };
  }

  if (exceptions.has("accounting_period_conflict") || risks.has("cutoff_misstatement")) {
    return {
      tone: "warning",
      title: "当前差旅事项已切到跨期归属处理",
      summary: "系统已识别跨期差旅报销，不再按提交月份整体入账。",
      bullets: [
        "需要按交通、住宿、餐饮的实际归属月份拆分费用。",
        "增值税认证月份与企业所得税费用归属期需要分别复核。",
        "建议负责人确认跨期口径后再进入正式过账。"
      ]
    };
  }

  if (exceptions.has("missing_hotel_invoice") || risks.has("unsupported_travel_cost")) {
    return {
      tone: "warning",
      title: "当前差旅事项处于缺住宿票待补状态",
      summary: "系统已保留差旅主链，但住宿部分不会直接形成完整税务结论。",
      bullets: [
        "住宿发票在单据中心会保持待上传状态。",
        "补票前仅对已合规部分暂估，完整抵扣和税前扣除暂缓。",
        "建议先补齐住宿发票、入住凭证和差旅行程。"
      ]
    };
  }

  return null;
}
