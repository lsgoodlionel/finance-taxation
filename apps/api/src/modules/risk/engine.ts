import type {
  BusinessEvent,
  GeneratedDocument,
  LedgerEntry,
  RiskFinding,
  RndProject,
  TaxFilingBatch,
  TaxItem,
  Task,
  Voucher
} from "@finance-taxation/domain-model";

interface RiskEvaluationInput {
  now: string;
  event: BusinessEvent;
  events: BusinessEvent[];
  tasks: Task[];
  taxItems: TaxItem[];
  taxFilingBatches: TaxFilingBatch[];
  generatedDocuments: GeneratedDocument[];
  generatedDocumentsAll: GeneratedDocument[];
  vouchers: Voucher[];
  ledgerEntries: LedgerEntry[];
  rndProjects: RndProject[];
}

function buildFinding(
  event: BusinessEvent,
  now: string,
  ruleCode: string,
  severity: RiskFinding["severity"],
  title: string,
  detail: string
): RiskFinding {
  return {
    id: `${ruleCode.toLowerCase()}-${event.id}`,
    companyId: event.companyId,
    businessEventId: event.id,
    ruleCode,
    severity,
    status: "open",
    title,
    detail,
    createdAt: now,
    updatedAt: now
  };
}

function isVatTaxItem(item: TaxItem): boolean {
  return item.taxType.includes("增值税") || item.taxType.toLowerCase().includes("vat");
}

function isPayrollRelevantTaxItem(item: TaxItem, keyword: string): boolean {
  return item.taxType.includes(keyword) || item.treatment.includes(keyword) || item.basis.includes(keyword);
}

export function evaluateRiskFindings(input: RiskEvaluationInput): RiskFinding[] {
  const { event, now } = input;
  const findings: RiskFinding[] = [];
  const eventLedgerEntries = input.ledgerEntries.filter((entry) => entry.businessEventId === event.id);
  const eventVouchers = input.vouchers.filter((voucher) => voucher.businessEventId === event.id);
  const eventDocuments = input.generatedDocuments.filter((document) => document.businessEventId === event.id);
  const eventTaxItems = input.taxItems.filter((item) => item.businessEventId === event.id);
  const eventTasks = input.tasks.filter((task) => task.businessEventId === event.id);

  const hasRevenuePosted = eventLedgerEntries.some((entry) =>
    entry.accountCode.startsWith("6001") || entry.accountCode.startsWith("6051")
  );
  if (event.type === "sales" && hasRevenuePosted && !eventTaxItems.some(isVatTaxItem)) {
    findings.push(
      buildFinding(
        event,
        now,
        "SALES_WITHOUT_VAT_ITEM",
        "high",
        "销售收入已入账但未形成增值税事项",
        "已检测到收入类总账分录，但未找到对应增值税税务事项，需补充开票/销项税处理。"
      )
    );
  }

  if (event.type === "sales" && hasRevenuePosted) {
    const hasContractDocument = eventDocuments.some((item) =>
      item.documentType.includes("contract") || item.title.includes("合同")
    );
    if (!hasContractDocument) {
      findings.push(
        buildFinding(
          event,
          now,
          "SALES_WITHOUT_CONTRACT_DOCUMENT",
          "high",
          "销售收入缺少合同依据",
          "已确认销售收入，但未找到合同类单据，需补充合同、订单或框架协议。"
        )
      );
    }

    const hasReceiptEvidence = eventDocuments.some((item) =>
      item.documentType.includes("receipt") ||
      item.documentType.includes("payment") ||
      item.title.includes("回款") ||
      item.title.includes("收款")
    ) || eventLedgerEntries.some((entry) => entry.accountCode.startsWith("1002") || entry.accountCode.startsWith("1122"));

    if (!hasReceiptEvidence) {
      findings.push(
        buildFinding(
          event,
          now,
          "SALES_WITHOUT_RECEIPT_EVIDENCE",
          "medium",
          "销售收入缺少回款或应收依据",
          "已确认销售收入，但未找到回款、应收或收款支持资料，需补充银行回单或应收对账资料。"
        )
      );
    }
  }

  if (eventVouchers.some((voucher) => voucher.status === "posted") && eventDocuments.length === 0) {
    findings.push(
      buildFinding(
        event,
        now,
        "POSTED_VOUCHER_WITHOUT_DOCUMENT",
        "high",
        "已过账凭证缺少关联原始单据",
        "该事项已有过账凭证，但未找到已生成单据或附件记录，需补齐原始依据。"
      )
    );
  }

  if (event.type === "procurement" && eventVouchers.some((voucher) => voucher.status === "posted")) {
    if (!eventTaxItems.some((item) => item.treatment.includes("进项"))) {
      findings.push(
        buildFinding(
          event,
          now,
          "PROCUREMENT_WITHOUT_INPUT_VAT_ITEM",
          "medium",
          "采购事项缺少进项税处理",
          "采购事项已经过账，但未找到进项税额或税务处理事项，需复核发票和进项抵扣口径。"
        )
      );
    }
    if (!eventDocuments.some((item) =>
      item.documentType.includes("invoice") ||
      item.documentType.includes("payment") ||
      item.title.includes("发票") ||
      item.title.includes("付款")
    )) {
      findings.push(
        buildFinding(
          event,
          now,
          "PROCUREMENT_WITHOUT_PAYMENT_SUPPORT",
          "medium",
          "采购事项缺少发票或付款依据",
          "采购事项已经过账，但未找到发票、付款单或回单等支持资料。"
        )
      );
    }
  }

  const overdueBlockedTask = eventTasks.find((task) =>
    task.status === "blocked" && task.dueAt && task.dueAt < now
  );
  if (overdueBlockedTask) {
    findings.push(
      buildFinding(
        event,
        now,
        "OVERDUE_BLOCKED_TASK",
        "medium",
        "存在逾期且阻塞的执行任务",
        `任务“${overdueBlockedTask.title}”已逾期且仍处于阻塞状态，需要立即处理。`
      )
    );
  }

  const relatedRndEvent = input.events.find((item) => item.type === "rnd" && item.id === event.id);
  const hasRndSpending = eventLedgerEntries.some((entry) =>
    entry.accountCode.startsWith("1801001") ||
    entry.accountCode.startsWith("1801002") ||
    entry.accountCode.startsWith("6301e06")
  );
  if (relatedRndEvent && hasRndSpending && !input.rndProjects.some((project) => project.businessEventId === event.id)) {
    findings.push(
      buildFinding(
        event,
        now,
        "RND_EVENT_WITHOUT_PROJECT",
        "high",
        "研发支出未归集到研发项目辅助账",
        "该研发事项存在研发支出分录，但未绑定研发项目，后续加计扣除和辅助账将缺口。"
      )
    );
  }

  const filingPeriod = event.occurredOn.slice(0, 7);
  const hasPendingTax = eventTaxItems.some((item) => item.status !== "ready");
  const hasBatch = input.taxFilingBatches.some(
    (batch) => batch.filingPeriod === filingPeriod && batch.itemIds.some((id) => eventTaxItems.some((item) => item.id === id))
  );
  if (hasPendingTax && !hasBatch) {
    findings.push(
      buildFinding(
        event,
        now,
        "TAX_ITEM_WITHOUT_BATCH",
        "medium",
        "税务事项未进入申报批次",
        "该事项已形成税务处理建议，但尚未进入任何申报批次，需补入申报工作流。"
      )
    );
  }

  const hasPayrollSpending = eventLedgerEntries.some((entry) =>
    entry.accountCode.startsWith("22110101") ||
    entry.accountCode.startsWith("6301e01") ||
    entry.accountCode.startsWith("6601")
  );
  if (event.type === "payroll" && hasPayrollSpending) {
    if (!eventTaxItems.some((item) => isPayrollRelevantTaxItem(item, "个人所得税"))) {
      findings.push(
        buildFinding(
          event,
          now,
          "PAYROLL_WITHOUT_IIT_ITEM",
          "high",
          "工资事项缺少个税处理",
          "已检测到工资薪酬相关分录，但未找到个人所得税处理事项。"
        )
      );
    }
    if (!eventTaxItems.some((item) => isPayrollRelevantTaxItem(item, "社保"))) {
      findings.push(
        buildFinding(
          event,
          now,
          "PAYROLL_WITHOUT_SOCIAL_OBLIGATION",
          "medium",
          "工资事项缺少社保处理",
          "已检测到工资薪酬相关分录，但未找到社保相关处理事项或资料。"
        )
      );
    }
    if (!eventDocuments.some((item) => item.title.includes("公积金") || item.documentType.includes("housing_fund"))) {
      findings.push(
        buildFinding(
          event,
          now,
          "PAYROLL_WITHOUT_HOUSING_FUND_SUPPORT",
          "medium",
          "工资事项缺少公积金支持资料",
          "工资事项未检测到公积金相关单据或辅助资料，需要补齐。"
        )
      );
    }
  }

  return findings;
}
