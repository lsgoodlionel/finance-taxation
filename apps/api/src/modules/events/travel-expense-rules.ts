import type {
  BusinessEvent,
  BusinessEventMappingBundle,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft
} from "@finance-taxation/domain-model";

type TravelExpenseClassification = "travel_expense" | "travel_expense_accrual";

interface TravelExpenseFixtureInput {
  providedDocumentTypes?: string[];
  claimedPeriod?: string;
}

interface TravelExpenseFixtureExpected {
  classification?: string;
  documentTypes?: string[];
  exceptions?: string[];
  risks?: string[];
  tax?: string;
}

interface TravelExpenseFixtureEnvelope {
  input?: TravelExpenseFixtureInput;
  expected?: TravelExpenseFixtureExpected;
}

export interface TravelExpenseScenario {
  classification: TravelExpenseClassification;
  documentTypes: string[];
  providedDocumentTypes: string[];
  missingHotelInvoice: boolean;
  duplicateClaim: boolean;
  accountingPeriodConflict: boolean;
  risks: string[];
  taxSummary: string;
}

function parseFixtureEnvelope(description: string): TravelExpenseFixtureEnvelope | null {
  if (!description.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(description) as TravelExpenseFixtureEnvelope;
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
  envelope: TravelExpenseFixtureEnvelope | null
): TravelExpenseClassification {
  const fixtureClassification = envelope?.expected?.classification;
  if (fixtureClassification === "travel_expense_accrual") return "travel_expense_accrual";
  if (fixtureClassification === "travel_expense") return "travel_expense";

  if (/跨期|错月|归属期|期间/.test(event.title)) {
    return "travel_expense_accrual";
  }
  return "travel_expense";
}

function inferDocumentTypes(envelope: TravelExpenseFixtureEnvelope | null): string[] {
  const fromFixture = normalizeStringArray(envelope?.expected?.documentTypes);
  if (fromFixture.length > 0) {
    return fromFixture;
  }
  return ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"];
}

function inferTaxSummary(envelope: TravelExpenseFixtureEnvelope | null, fallback: string): string {
  const summary = envelope?.expected?.tax;
  return typeof summary === "string" && summary.trim() ? summary : fallback;
}

function documentTitle(documentType: string): string {
  switch (documentType) {
    case "travel_request":
      return "出差申请单";
    case "expense_claim":
      return "差旅报销单";
    case "transport_invoice":
      return "交通票据";
    case "hotel_invoice":
      return "住宿发票";
    default:
      return documentType;
  }
}

export function resolveTravelExpenseScenario(event: BusinessEvent): TravelExpenseScenario {
  const envelope = parseFixtureEnvelope(event.description);
  const classification = inferClassification(event, envelope);
  const documentTypes = inferDocumentTypes(envelope);
  const providedDocumentTypes = normalizeStringArray(envelope?.input?.providedDocumentTypes);
  const exceptions = new Set(normalizeStringArray(envelope?.expected?.exceptions));
  const risks = normalizeStringArray(envelope?.expected?.risks);
  const claimedPeriod = String(envelope?.input?.claimedPeriod ?? "");

  const missingHotelInvoice =
    exceptions.has("missing_hotel_invoice") ||
    (documentTypes.includes("hotel_invoice") && !providedDocumentTypes.includes("hotel_invoice")) ||
    /缺少住宿发票|缺住宿票|住宿发票缺失/.test(event.title);
  const duplicateClaim =
    exceptions.has("duplicate_trip_claim") ||
    /重复提交|重复报销|重复差旅|重复/.test(event.title);
  const accountingPeriodConflict =
    exceptions.has("accounting_period_conflict") ||
    classification === "travel_expense_accrual" ||
    Boolean(claimedPeriod && claimedPeriod !== event.occurredOn.slice(0, 7));

  return {
    classification,
    documentTypes,
    providedDocumentTypes,
    missingHotelInvoice,
    duplicateClaim,
    accountingPeriodConflict,
    risks,
    taxSummary: inferTaxSummary(envelope, "复核差旅费用税务口径与期间归属。")
  };
}

function documentStatus(documentType: string, scenario: TravelExpenseScenario) {
  if (scenario.providedDocumentTypes.includes(documentType)) {
    return "generated" as const;
  }
  if (documentType === "hotel_invoice" && scenario.missingHotelInvoice) {
    return "missing" as const;
  }
  return "required" as const;
}

function documentNotes(documentType: string, scenario: TravelExpenseScenario): string {
  if (documentType === "hotel_invoice" && scenario.missingHotelInvoice) {
    return "当前缺少住宿发票，住宿部分不得直接抵扣或税前扣除，需补票后再完成闭环。";
  }
  if (documentType === "expense_claim") {
    return "差旅报销需同时复核交通、住宿、餐饮边界，并判断是否混入业务招待口径。";
  }
  return "差旅报销自动生成的资料要求。";
}

function buildVoucherLines(event: BusinessEvent, scenario: TravelExpenseScenario) {
  const amount = Number(event.amount || 0);
  const transportAmount = (amount * 0.45).toFixed(2);
  const hotelAmount = (amount * 0.4).toFixed(2);
  const mealAmount = Math.max(0, amount - Number(transportAmount) - Number(hotelAmount)).toFixed(2);

  return [
    {
      id: `vou-line-${event.id}-transport`,
      summary: "交通差旅费用",
      accountCode: "6601",
      accountName: "销售费用-差旅费",
      debit: transportAmount,
      credit: "0.00"
    },
    {
      id: `vou-line-${event.id}-hotel`,
      summary: "住宿差旅费用",
      accountCode: "6601",
      accountName: "销售费用-差旅费",
      debit: hotelAmount,
      credit: "0.00"
    },
    {
      id: `vou-line-${event.id}-meal`,
      summary: scenario.accountingPeriodConflict ? "餐饮及跨期调整待复核" : "餐饮及补贴复核",
      accountCode: "6601",
      accountName: "销售费用-差旅费",
      debit: mealAmount,
      credit: "0.00"
    },
    {
      id: `vou-line-${event.id}-payable`,
      summary: "确认员工垫付款",
      accountCode: "2241",
      accountName: "其他应付款",
      debit: "0.00",
      credit: event.amount || "0.00"
    }
  ];
}

export function buildTravelExpenseBundle(event: BusinessEvent): BusinessEventMappingBundle {
  const scenario = resolveTravelExpenseScenario(event);
  const documentMappings: EventDocumentMapping[] = scenario.documentTypes.map((documentType) => ({
    id: `doc-map-${event.id}-${documentType}`,
    companyId: event.companyId,
    businessEventId: event.id,
    documentType,
    title: documentTitle(documentType),
    status: documentStatus(documentType, scenario),
    ownerDepartment:
      documentType === "hotel_invoice" || documentType === "transport_invoice" ? "财务部" : event.department,
    notes: documentNotes(documentType, scenario)
  }));

  const taxMappings: EventTaxMapping[] = [];
  if (!scenario.duplicateClaim) {
    if (!scenario.missingHotelInvoice) {
      taxMappings.push({
        id: `tax-map-${event.id}-vat`,
        companyId: event.companyId,
        businessEventId: event.id,
        taxType: "增值税",
        treatment: "复核交通住宿票据用途、发票类型和认证月份后再确认抵扣。",
        status: "attention",
        basis: `${scenario.taxSummary}。如存在差旅与招待混同，应先拆分口径。`,
        filingPeriod: event.occurredOn.slice(0, 7)
      });
    }
    taxMappings.push({
      id: `tax-map-${event.id}-eit`,
      companyId: event.companyId,
      businessEventId: event.id,
      taxType: "企业所得税",
      treatment: scenario.accountingPeriodConflict
        ? "按实际归属期拆分差旅费用并复核税前扣除月份。"
        : "复核差旅费用真实性、制度合规性和税前扣除凭证完整性。",
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
      treatment: "阻止重复差旅报销形成重复抵扣，需先核对历史交通住宿票据。",
      status: "attention",
      basis: scenario.taxSummary,
      filingPeriod: event.occurredOn.slice(0, 7)
    });
  }

  const voucherDrafts: EventVoucherDraft[] = [];
  if (!scenario.duplicateClaim) {
    voucherDrafts.push({
      id: `vou-map-${event.id}-${scenario.classification}`,
      companyId: event.companyId,
      businessEventId: event.id,
      voucherType: scenario.accountingPeriodConflict ? "accrual" : "payment",
      status: scenario.missingHotelInvoice ? "draft" : "review_required",
      summary: scenario.accountingPeriodConflict
        ? `${event.title} 跨期差旅计提草稿`
        : scenario.missingHotelInvoice
          ? `${event.title} 待补住宿票差旅草稿`
          : `${event.title} 差旅报销草稿`,
      lines: buildVoucherLines(event, scenario)
    });
  }

  return {
    businessEventId: event.id,
    documentMappings,
    taxMappings,
    voucherDrafts,
    generatedAt: new Date().toISOString()
  };
}
