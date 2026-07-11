import type {
  BusinessEvent,
  BusinessEventMappingBundle,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft
} from "@finance-taxation/domain-model";

type PurchaseExpenseClassification =
  | "low_value_consumable"
  | "sales_expense"
  | "fixed_asset";

interface PurchaseExpenseFixtureInput {
  providedDocumentTypes?: string[];
  claimedClassification?: string;
}

interface PurchaseExpenseFixtureExpected {
  classification?: string;
  documentTypes?: string[];
  exceptions?: string[];
  risks?: string[];
  tax?: string;
}

interface PurchaseExpenseFixtureEnvelope {
  input?: PurchaseExpenseFixtureInput;
  expected?: PurchaseExpenseFixtureExpected;
}

export interface PurchaseExpenseScenario {
  classification: PurchaseExpenseClassification;
  documentTypes: string[];
  providedDocumentTypes: string[];
  duplicateInvoice: boolean;
  missingInvoiceBundle: boolean;
  classificationConflict: boolean;
  risks: string[];
  taxSummary: string;
}

function parseFixtureEnvelope(description: string): PurchaseExpenseFixtureEnvelope | null {
  if (!description.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(description) as PurchaseExpenseFixtureEnvelope;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function eventAmount(event: BusinessEvent): number {
  const amount = Number(event.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function inferClassification(event: BusinessEvent, envelope: PurchaseExpenseFixtureEnvelope | null): PurchaseExpenseClassification {
  const fixtureClassification = envelope?.expected?.classification;
  if (fixtureClassification === "fixed_asset") return "fixed_asset";
  if (fixtureClassification === "sales_expense") return "sales_expense";
  if (fixtureClassification === "low_value_consumable") return "low_value_consumable";

  if (eventAmount(event) >= 20000 || /(工作站|服务器|设备|机器|电脑)/.test(event.title)) {
    return "fixed_asset";
  }
  if (/(客户|活动|市场|销售|招待)/.test(event.title)) {
    return "sales_expense";
  }
  return "low_value_consumable";
}

function inferDocumentTypes(
  classification: PurchaseExpenseClassification,
  envelope: PurchaseExpenseFixtureEnvelope | null
): string[] {
  const fromFixture = normalizeStringArray(envelope?.expected?.documentTypes);
  if (fromFixture.length > 0) {
    return fromFixture;
  }
  if (classification === "fixed_asset") {
    return ["purchase_request", "invoice_bundle", "acceptance_record"];
  }
  return ["expense_claim", "invoice_bundle"];
}

function documentTitle(documentType: string, classification: PurchaseExpenseClassification): string {
  switch (documentType) {
    case "expense_claim":
      return "费用报销单";
    case "invoice_bundle":
      return "报销票据包";
    case "purchase_request":
      return classification === "fixed_asset" ? "资产购置申请单" : "采购申请单";
    case "acceptance_record":
      return classification === "fixed_asset" ? "资产验收单" : "采购验收单";
    default:
      return documentType;
  }
}

function inferTaxSummary(envelope: PurchaseExpenseFixtureEnvelope | null, fallback: string): string {
  const summary = envelope?.expected?.tax;
  return typeof summary === "string" && summary.trim() ? summary : fallback;
}

export function resolvePurchaseExpenseScenario(event: BusinessEvent): PurchaseExpenseScenario {
  const envelope = parseFixtureEnvelope(event.description);
  const classification = inferClassification(event, envelope);
  const documentTypes = inferDocumentTypes(classification, envelope);
  const providedDocumentTypes = normalizeStringArray(envelope?.input?.providedDocumentTypes);
  const exceptions = new Set(normalizeStringArray(envelope?.expected?.exceptions));
  const risks = normalizeStringArray(envelope?.expected?.risks);
  const claimedClassification = String(envelope?.input?.claimedClassification ?? "");

  const duplicateInvoice =
    exceptions.has("duplicate_invoice") ||
    /重复提交|重复报销|重复发票|重复/.test(event.title);
  const missingInvoiceBundle =
    exceptions.has("missing_invoice_bundle") ||
    (/invoice_bundle/.test(documentTypes.join(",")) && !providedDocumentTypes.includes("invoice_bundle")) ||
    /缺少发票|缺票|无票/.test(event.title);
  const classificationConflict =
    exceptions.has("classification_conflict") ||
    (classification === "fixed_asset" && /office|办公用品|耗材/i.test(claimedClassification || event.title));

  return {
    classification,
    documentTypes,
    providedDocumentTypes,
    duplicateInvoice,
    missingInvoiceBundle,
    classificationConflict,
    risks,
    taxSummary: inferTaxSummary(envelope, "复核采购报销相关税务口径。")
  };
}

function documentStatus(documentType: string, scenario: PurchaseExpenseScenario) {
  if (scenario.providedDocumentTypes.includes(documentType)) {
    return "generated" as const;
  }
  if (documentType === "invoice_bundle" && scenario.missingInvoiceBundle) {
    return "missing" as const;
  }
  return "required" as const;
}

function expenseDebitAccount(classification: PurchaseExpenseClassification) {
  switch (classification) {
    case "sales_expense":
      return { code: "6601", name: "销售费用" };
    case "fixed_asset":
      return { code: "1601", name: "固定资产" };
    default:
      return { code: "6602", name: "管理费用" };
  }
}

export function buildPurchaseExpenseBundle(event: BusinessEvent): BusinessEventMappingBundle {
  const scenario = resolvePurchaseExpenseScenario(event);
  const amount = event.amount || "0.00";
  const documentMappings: EventDocumentMapping[] = scenario.documentTypes.map((documentType) => ({
    id: `doc-map-${event.id}-${documentType}`,
    companyId: event.companyId,
    businessEventId: event.id,
    documentType,
    title: documentTitle(documentType, scenario.classification),
    status: documentStatus(documentType, scenario),
    ownerDepartment: documentType === "invoice_bundle" ? "财务部" : event.department,
    notes:
      documentType === "invoice_bundle" && scenario.missingInvoiceBundle
        ? "当前缺少可抵扣或税前扣除所需票据，需补齐发票、回单或说明资料。"
        : "采购报销异常场景自动生成的资料要求。"
  }));

  const taxMappings: EventTaxMapping[] = [];
  if (!scenario.duplicateInvoice) {
    if (!scenario.missingInvoiceBundle) {
      taxMappings.push({
        id: `tax-map-${event.id}-vat`,
        companyId: event.companyId,
        businessEventId: event.id,
        taxType: "增值税",
        treatment:
          scenario.classification === "fixed_asset"
            ? "复核固定资产购置发票与进项抵扣条件。"
            : "复核报销事项进项税抵扣条件。",
        status: "attention",
        basis: scenario.taxSummary,
        filingPeriod: event.occurredOn.slice(0, 7)
      });
    }
    taxMappings.push({
      id: `tax-map-${event.id}-eit`,
      companyId: event.companyId,
      businessEventId: event.id,
      taxType: "企业所得税",
      treatment:
        scenario.classification === "fixed_asset"
          ? "改按固定资产折旧口径准备所得税扣除资料。"
          : "复核税前扣除凭证完整性和费用归属口径。",
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
      treatment: "阻止同票重复抵扣，需先复核重复报销线索。",
      status: "attention",
      basis: scenario.taxSummary,
      filingPeriod: event.occurredOn.slice(0, 7)
    });
  }

  const voucherDrafts: EventVoucherDraft[] = [];
  if (!scenario.duplicateInvoice) {
    const debitAccount = expenseDebitAccount(scenario.classification);
    voucherDrafts.push({
      id: `vou-map-${event.id}-${scenario.classification}`,
      companyId: event.companyId,
      businessEventId: event.id,
      voucherType: "payment",
      status: scenario.missingInvoiceBundle ? "draft" : "review_required",
      summary:
        scenario.classification === "fixed_asset"
          ? `${event.title} 固定资产入账草稿`
          : scenario.missingInvoiceBundle
            ? `${event.title} 待补票报销草稿`
            : `${event.title} 费用报销草稿`,
      lines: [
        {
          id: `vou-line-${event.id}-debit`,
          summary: scenario.classification === "fixed_asset" ? "确认固定资产" : "确认费用",
          accountCode: debitAccount.code,
          accountName: debitAccount.name,
          debit: amount,
          credit: "0.00"
        },
        {
          id: `vou-line-${event.id}-credit`,
          summary: "确认员工垫付款",
          accountCode: "2241",
          accountName: "其他应付款",
          debit: "0.00",
          credit: amount
        }
      ]
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
