import type {
  BusinessEvent,
  BusinessEventMappingBundle,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft
} from "@finance-taxation/domain-model";

type ContractRevenueClassification =
  | "service_revenue"
  | "deferred_service_revenue"
  | "deferred_subscription_revenue";

interface ContractRevenueFixtureInput {
  providedDocumentTypes?: string[];
  contractNo?: string;
  duplicateOf?: string;
  serviceStart?: string;
  serviceEnd?: string;
  claimedRecognition?: string;
}

interface ContractRevenueFixtureExpected {
  classification?: string;
  documentTypes?: string[];
  exceptions?: string[];
  risks?: string[];
  tax?: string;
}

interface ContractRevenueFixtureEnvelope {
  input?: ContractRevenueFixtureInput;
  expected?: ContractRevenueFixtureExpected;
}

export interface ContractRevenueScenario {
  classification: ContractRevenueClassification;
  documentTypes: string[];
  providedDocumentTypes: string[];
  missingAcceptanceRecord: boolean;
  duplicateContract: boolean;
  revenueTimingConflict: boolean;
  risks: string[];
  taxSummary: string;
}

function parseFixtureEnvelope(description: string): ContractRevenueFixtureEnvelope | null {
  if (!description.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(description) as ContractRevenueFixtureEnvelope;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function inferClassification(
  event: BusinessEvent,
  envelope: ContractRevenueFixtureEnvelope | null
): ContractRevenueClassification {
  const fixtureClassification = envelope?.expected?.classification;
  if (fixtureClassification === "deferred_subscription_revenue") return "deferred_subscription_revenue";
  if (fixtureClassification === "deferred_service_revenue") return "deferred_service_revenue";
  if (fixtureClassification === "service_revenue") return "service_revenue";

  if (/订阅|分期|跨期/.test(event.title)) return "deferred_subscription_revenue";
  if (/缺少验收|验收单/.test(event.title)) return "deferred_service_revenue";
  return "service_revenue";
}

function inferDocumentTypes(classification: ContractRevenueClassification, envelope: ContractRevenueFixtureEnvelope | null): string[] {
  const fromFixture = normalizeStringArray(envelope?.expected?.documentTypes);
  if (fromFixture.length > 0) return fromFixture;
  if (classification === "deferred_subscription_revenue") {
    return ["service_contract", "billing_schedule", "output_invoice"];
  }
  return ["service_contract", "acceptance_record", "output_invoice"];
}

function inferTaxSummary(envelope: ContractRevenueFixtureEnvelope | null, fallback: string): string {
  const summary = envelope?.expected?.tax;
  return typeof summary === "string" && summary.trim() ? summary : fallback;
}

function documentTitle(documentType: string): string {
  switch (documentType) {
    case "service_contract":
      return "服务合同";
    case "acceptance_record":
      return "验收单";
    case "output_invoice":
      return "销项发票";
    case "billing_schedule":
      return "开票与履约计划";
    default:
      return documentType;
  }
}

function splitGrossAmount(amountText: string | null, vatRate = 0.06) {
  const gross = Number(amountText || 0);
  if (!Number.isFinite(gross) || gross <= 0) {
    return { gross: "0.00", net: "0.00", vat: "0.00" };
  }
  const net = Number((gross / (1 + vatRate)).toFixed(2));
  const vat = Number((gross - net).toFixed(2));
  return {
    gross: gross.toFixed(2),
    net: net.toFixed(2),
    vat: vat.toFixed(2)
  };
}

export function resolveContractRevenueScenario(event: BusinessEvent): ContractRevenueScenario {
  const envelope = parseFixtureEnvelope(event.description);
  const classification = inferClassification(event, envelope);
  const documentTypes = inferDocumentTypes(classification, envelope);
  const providedDocumentTypes = normalizeStringArray(envelope?.input?.providedDocumentTypes);
  const exceptions = new Set(normalizeStringArray(envelope?.expected?.exceptions));
  const risks = normalizeStringArray(envelope?.expected?.risks);
  const claimedRecognition = String(envelope?.input?.claimedRecognition ?? "");

  const missingAcceptanceRecord =
    exceptions.has("missing_acceptance_record") ||
    (documentTypes.includes("acceptance_record") && !providedDocumentTypes.includes("acceptance_record")) ||
    /缺少验收单|未验收|缺验收/.test(event.title);
  const duplicateContract =
    exceptions.has("duplicate_contract") ||
    /重复导入|重复合同|重复确认|重复/.test(event.title);
  const revenueTimingConflict =
    exceptions.has("revenue_timing_conflict") ||
    classification === "deferred_subscription_revenue" ||
    claimedRecognition === "upfront";

  return {
    classification,
    documentTypes,
    providedDocumentTypes,
    missingAcceptanceRecord,
    duplicateContract,
    revenueTimingConflict,
    risks,
    taxSummary: inferTaxSummary(envelope, "复核合同收入确认时点与税会差异。")
  };
}

function documentStatus(documentType: string, scenario: ContractRevenueScenario) {
  if (scenario.providedDocumentTypes.includes(documentType)) {
    return "generated" as const;
  }
  if (documentType === "acceptance_record" && scenario.missingAcceptanceRecord) {
    return "missing" as const;
  }
  return "required" as const;
}

function documentNotes(documentType: string, scenario: ContractRevenueScenario): string {
  if (documentType === "acceptance_record" && scenario.missingAcceptanceRecord) {
    return "当前缺少履约验收证据，不应直接确认主营业务收入，需补齐验收单后再闭环。";
  }
  if (documentType === "billing_schedule" && scenario.revenueTimingConflict) {
    return "当前事项涉及跨期履约，应按服务期间与开票计划分期核验收入。";
  }
  return "合同收入场景自动生成的资料要求。";
}

function buildRevenueVoucherDraft(event: BusinessEvent, scenario: ContractRevenueScenario): EventVoucherDraft | null {
  if (scenario.duplicateContract) {
    return null;
  }

  const { gross, net, vat } = splitGrossAmount(event.amount);
  const deferred = scenario.missingAcceptanceRecord || scenario.revenueTimingConflict;
  return {
    id: `vou-map-${event.id}-${scenario.classification}`,
    companyId: event.companyId,
    businessEventId: event.id,
    voucherType: "accrual",
    status: scenario.missingAcceptanceRecord ? "draft" : "review_required",
    summary: scenario.revenueTimingConflict
      ? `${event.title} 合同负债分期确认草稿`
      : scenario.missingAcceptanceRecord
        ? `${event.title} 待补验收收入草稿`
        : `${event.title} 收入确认草稿`,
    lines: [
      {
        id: `vou-line-${event.id}-receivable`,
        summary: "确认应收账款",
        accountCode: "1122",
        accountName: "应收账款",
        debit: gross,
        credit: "0.00"
      },
      {
        id: `vou-line-${event.id}-revenue-or-liability`,
        summary: deferred ? "确认合同负债/预收" : "确认主营业务收入",
        accountCode: deferred ? "2203" : "6001",
        accountName: deferred ? "预收账款" : "主营业务收入",
        debit: "0.00",
        credit: net
      },
      {
        id: `vou-line-${event.id}-vat`,
        summary: "确认销项税额",
        accountCode: "222101",
        accountName: "应交税费-应交增值税（销项）",
        debit: "0.00",
        credit: vat
      }
    ]
  };
}

export function buildContractRevenueBundle(event: BusinessEvent): BusinessEventMappingBundle {
  const scenario = resolveContractRevenueScenario(event);
  const documentMappings: EventDocumentMapping[] = scenario.documentTypes.map((documentType) => ({
    id: `doc-map-${event.id}-${documentType}`,
    companyId: event.companyId,
    businessEventId: event.id,
    documentType,
    title: documentTitle(documentType),
    status: documentStatus(documentType, scenario),
    ownerDepartment: documentType === "output_invoice" ? "财务部" : event.department,
    notes: documentNotes(documentType, scenario)
  }));

  const taxMappings: EventTaxMapping[] = [];
  if (!scenario.duplicateContract) {
    taxMappings.push({
      id: `tax-map-${event.id}-vat`,
      companyId: event.companyId,
      businessEventId: event.id,
      taxType: "增值税",
      treatment: scenario.revenueTimingConflict
        ? "按开票或收款义务时点确认销项税额，并与分期收入口径分开留痕。"
        : "复核销项税确认时点、税率和开票节点。",
      status: "attention",
      basis: scenario.taxSummary,
      filingPeriod: event.occurredOn.slice(0, 7)
    });
    taxMappings.push({
      id: `tax-map-${event.id}-eit`,
      companyId: event.companyId,
      businessEventId: event.id,
      taxType: "企业所得税",
      treatment: scenario.missingAcceptanceRecord || scenario.revenueTimingConflict
        ? "复核会计确认与所得税收入归属时点，必要时按履约期间分期核验。"
        : "复核收入真实性、履约完成证据和所得税收入确认时点。",
      status: "attention",
      basis: scenario.taxSummary,
      filingPeriod: event.occurredOn.slice(0, 7)
    });
  } else {
    taxMappings.push({
      id: `tax-map-${event.id}-vat-duplicate`,
      companyId: event.companyId,
      businessEventId: event.id,
      taxType: "增值税",
      treatment: "阻止重复合同收入形成重复销项税额，需先核对合同主档与既有收入链。",
      status: "attention",
      basis: scenario.taxSummary,
      filingPeriod: event.occurredOn.slice(0, 7)
    });
  }

  const voucherDraft = buildRevenueVoucherDraft(event, scenario);

  return {
    businessEventId: event.id,
    documentMappings,
    taxMappings,
    voucherDrafts: voucherDraft ? [voucherDraft] : [],
    generatedAt: new Date().toISOString()
  };
}
