export interface ContractRevenueSummary {
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
  if (!description.trim().startsWith("{")) return null;
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

export function deriveContractRevenueSummary(
  eventType: string,
  description: string
): ContractRevenueSummary | null {
  if (eventType !== "contract_revenue") {
    return null;
  }

  const envelope = parseEnvelope(description);
  const exceptions = new Set(asStrings(envelope?.expected?.exceptions));
  const risks = new Set(asStrings(envelope?.expected?.risks));

  if (exceptions.has("duplicate_contract") || risks.has("revenue_overstatement")) {
    return {
      tone: "error",
      title: "当前合同收入事项疑似重复确认",
      summary: "系统已阻止继续生成正式收入凭证，建议先核对合同主档、应收与销项税主链。",
      bullets: [
        "当前不会继续形成正式收入凭证草稿。",
        "建议先确认保留哪条合同收入主链，其余重复流转关闭处理。",
        "风险检查会同步保留重复收入确认留痕。"
      ]
    };
  }

  if (exceptions.has("revenue_timing_conflict") || risks.has("tax_accounting_timing_difference")) {
    return {
      tone: "warning",
      title: "当前合同收入事项已切到分期确认口径",
      summary: "系统已识别跨期或分期履约场景，不再按一次性收入确认推进。",
      bullets: [
        "需要先确认合同负债或预收，再按履约期间分期结转收入。",
        "增值税义务与所得税收入归属期需要分别复核。",
        "建议负责人确认税会差异说明后再正式过账。"
      ]
    };
  }

  if (exceptions.has("missing_acceptance_record") || risks.has("premature_revenue_recognition")) {
    return {
      tone: "warning",
      title: "当前合同收入事项处于缺验收待补状态",
      summary: "系统已保留合同主链，但在补齐履约证据前不会正式确认主营业务收入。",
      bullets: [
        "验收单在单据中心会保持待上传状态。",
        "正式收入确认会冻结，仅保留待复核草稿。",
        "建议先补齐验收单、交付证明和客户确认资料。"
      ]
    };
  }

  return null;
}
