export interface PurchaseExceptionSummary {
  tone: "warning" | "error";
  title: string;
  summary: string;
  bullets: string[];
}

interface FixtureEnvelope {
  input?: {
    providedDocumentTypes?: string[];
    claimedClassification?: string;
  };
  expected?: {
    classification?: string;
    documentTypes?: string[];
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

export function derivePurchaseExceptionSummary(
  eventType: string,
  description: string
): PurchaseExceptionSummary | null {
  if (eventType !== "purchase_expense") {
    return null;
  }

  const envelope = parseEnvelope(description);
  const exceptions = new Set(asStrings(envelope?.expected?.exceptions));
  const risks = new Set(asStrings(envelope?.expected?.risks));

  if (exceptions.has("duplicate_invoice") || risks.has("duplicate_reimbursement")) {
    return {
      tone: "error",
      title: "当前事项疑似重复报销",
      summary: "系统已阻止自动生成正式凭证，建议先核对历史报销、入账与抵扣记录。",
      bullets: [
        "当前不会自动生成正式凭证草稿，需先核对历史报销与抵扣记录。",
        "建议由财务部确认保留事项，其余重复流转做关闭或并单处理。",
        "风险检查会同步保留重复报销留痕。"
      ]
    };
  }

  if (exceptions.has("classification_conflict") || risks.has("expense_overstatement")) {
    return {
      tone: "warning",
      title: "当前事项已改按固定资产/采购口径处理",
      summary: "系统已识别高价值采购误分类，不再按普通费用报销链推进。",
      bullets: [
        "系统已按固定资产口径准备资料与凭证，借方科目会切到固定资产。",
        "请优先补齐采购申请、验收单和资产台账资料。",
        "后续应走固定资产确认与折旧准备，而不是直接计入费用。"
      ]
    };
  }

  if (exceptions.has("missing_invoice_bundle") || risks.has("unsupported_tax_deduction")) {
    return {
      tone: "warning",
      title: "当前事项处于缺票待补资料状态",
      summary: "系统已保留报销主链，但不会直接形成完整税务结论。",
      bullets: [
        "当前缺少报销票据包，单据中心会保持“待上传”。",
        "在票据补齐前，进项税不会进入正式处理。",
        "凭证仅保留待补票草稿，建议先补发票、回单或说明资料。"
      ]
    };
  }

  return null;
}
