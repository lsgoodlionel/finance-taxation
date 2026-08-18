export type UserStatus = "active" | "invited" | "disabled";

export type PermissionScope =
  | "global"
  | "company"
  | "department"
  | "self"
  | "custom";

export interface RolePermission {
  key: string;
  scope: PermissionScope;
}

export interface Role {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description: string;
  permissions: RolePermission[];
}

export interface UserProfile {
  id: string;
  companyId: string;
  departmentId: string | null;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roleIds: string[];
}

export interface Department {
  id: string;
  companyId: string;
  parentDepartmentId: string | null;
  name: string;
  leaderUserId: string | null;
}

export type BusinessEventStatus =
  | "draft"
  | "analyzed"
  | "awaiting_documents"
  | "awaiting_approval"
  | "posted"
  | "archived"
  | "blocked";

export type BusinessEventType =
  | "sales"
  | "procurement"
  | "expense"
  | "payroll"
  | "tax"
  | "asset"
  | "financing"
  | "rnd"
  | "general";

export type BusinessEventSource = "manual" | "ai" | "import" | "integration";

export type BusinessEventRelationType =
  | "contract"
  | "invoice"
  | "payment"
  | "receipt"
  | "document"
  | "attachment"
  | "voucher"
  | "tax_item"
  | "project";

export interface BusinessEvent {
  id: string;
  companyId: string;
  type: BusinessEventType;
  title: string;
  description: string;
  department: string;
  ownerId: string | null;
  occurredOn: string;
  amount: string | null;
  currency: string;
  status: BusinessEventStatus;
  source: BusinessEventSource;
  contractId?: string | null;
  counterpartyId?: string | null;
  projectId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessEventRelation {
  id: string;
  companyId: string;
  businessEventId: string;
  relationType: BusinessEventRelationType;
  targetId: string;
  label: string;
  createdAt: string;
}

export interface BusinessEventActivity {
  id: string;
  companyId: string;
  businessEventId: string;
  activityType:
    | "created"
    | "updated"
    | "status_changed"
    | "analyzed"
    | "task_generated"
    | "commented";
  actorUserId: string | null;
  actorName: string;
  summary: string;
  createdAt: string;
}

export type EventDocumentMappingStatus =
  | "required"
  | "suggested"
  | "generated"
  | "missing";

export interface EventDocumentMapping {
  id: string;
  companyId: string;
  businessEventId: string;
  documentType: string;
  title: string;
  status: EventDocumentMappingStatus;
  ownerDepartment: string;
  notes: string;
}

export type EventTaxMappingStatus = "attention" | "pending" | "ready";

export interface EventTaxMapping {
  id: string;
  companyId: string;
  businessEventId: string;
  taxType: string;
  treatment: string;
  status: EventTaxMappingStatus;
  basis: string;
  filingPeriod: string;
}

export interface VoucherDraftLine {
  id: string;
  summary: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  /**
   * 往来核算维度（V12-C2）。只有往来科目（应收/应付/预付）需要，其余留空。
   * 过账时随分录进 `ledger_entries.counterparty_id`，账龄表按它分户 ——
   * 缺了它这笔就只是科目余额里的一个数字，看不出是谁欠的、欠了多久。
   */
  counterpartyId?: string | null;
  /**
   * 成本中心维度（V12-D1）。只有费用类与成本类科目需要，其余留空。
   * 缺了它这笔费用会落进部门费用报表的「未指定」一行——不丢弃也不摊派，
   * 但也就无法归到任何一个部门头上。
   */
  costCenterId?: string | null;
  /**
   * 外币原币信息（V12-D5）。三样要么都有、要么都没有，库上有 CHECK 约束强制。
   *
   * `debit` / `credit` 始终是**本位币**金额——外币业务在创建凭证时就按业务发生日
   * 的汇率折算好了，所以模板体系、借贷平衡校验、报表口径全都不必感知币种。
   *
   * 原币逐行金额由 `currency/foreign-allocation.ts` 按各行本位币比例分摊、末行扫尾，
   * 保证借贷两侧的原币之和都严格等于用户输入的那个数。
   */
  currency?: string | null;
  originalAmount?: string | null;
  exchangeRate?: number | null;
}

export type VoucherDraftStatus = "draft" | "review_required" | "ready";

export interface EventVoucherDraft {
  id: string;
  companyId: string;
  businessEventId: string;
  voucherType: "receipt" | "payment" | "accrual" | "adjustment" | "general";
  status: VoucherDraftStatus;
  summary: string;
  lines: VoucherDraftLine[];
}

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskSource = "manual" | "ai" | "workflow";

export interface Task {
  id: string;
  companyId: string;
  businessEventId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  ownerId: string | null;
  dueAt: string | null;
  assigneeDepartment: string | null;
  source: TaskSource;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskChecklistItem {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  required: boolean;
}

export interface TaskTreeNode extends Task {
  children: TaskTreeNode[];
}

export interface BusinessEventMappingBundle {
  businessEventId: string;
  documentMappings: EventDocumentMapping[];
  taxMappings: EventTaxMapping[];
  voucherDrafts: EventVoucherDraft[];
  generatedAt: string;
}

export type GeneratedDocumentStatus =
  | "draft"
  | "awaiting_upload"
  | "ready"
  | "archived";

export interface GeneratedDocument {
  id: string;
  companyId: string;
  businessEventId: string;
  mappingId: string;
  documentType: string;
  title: string;
  ownerDepartment: string;
  status: GeneratedDocumentStatus;
  attachmentIds: string[];
  archivedAt: string | null;
  source: "analysis";
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAttachmentRecord {
  id: string;
  companyId: string;
  documentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

export type TaxItemStatus = "pending" | "review_required" | "ready";

export interface TaxItem {
  id: string;
  companyId: string;
  businessEventId: string;
  mappingId: string;
  taxType: string;
  treatment: string;
  basis: string;
  filingPeriod: string;
  status: TaxItemStatus;
  source: "analysis";
  createdAt: string;
  updatedAt: string;
}

export type TaxFilingBatchStatus =
  | "draft"
  | "review_required"
  | "ready"
  | "submitted"
  | "archived";

export interface TaxFilingBatch {
  id: string;
  companyId: string;
  taxType: string;
  filingPeriod: string;
  status: TaxFilingBatchStatus;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IndividualIncomeTaxMaterial {
  companyId: string;
  filingPeriod: string;
  payrollEventCount: number;
  withholdingItemCount: number;
  totalPayrollAmount: string;
  checklist: string[];
}

export interface StampAndSurtaxSummary {
  companyId: string;
  filingPeriod: string;
  stampDutyItems: TaxItem[];
  surtaxItems: TaxItem[];
  notes: string[];
}

export interface TaxFilingBatchReviewRecord {
  id: string;
  companyId: string;
  batchId: string;
  reviewedByUserId: string | null;
  reviewedByName: string;
  reviewResult: "approved" | "rejected";
  reviewNotes: string;
  reviewedAt: string;
}

export interface TaxFilingBatchArchiveRecord {
  id: string;
  companyId: string;
  batchId: string;
  archivedByUserId: string | null;
  archivedByName: string;
  archiveLabel: string;
  archiveNotes: string;
  archivedAt: string;
}

export type TaxpayerType =
  | "general_vat"
  | "small_scale"
  | "general_simplified";

export interface TaxpayerProfile {
  id: string;
  companyId: string;
  taxpayerType: TaxpayerType;
  effectiveFrom: string;
  status: "active" | "inactive";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxRuleProfile {
  taxType: string;
  taxpayerType: TaxpayerType;
  filingFrequency: "monthly" | "quarterly" | "yearly";
  defaultRate: string;
}

export interface VatWorkingPaperLine {
  id: string;
  sourceType: "output" | "input" | "adjustment";
  businessEventId: string | null;
  taxItemId: string | null;
  description: string;
  taxRate: string;
  taxableAmount: string;
  taxAmount: string;
}

export interface VatWorkingPaper {
  companyId: string;
  filingPeriod: string;
  taxpayerType: TaxpayerType;
  outputTaxAmount: string;
  inputTaxAmount: string;
  simplifiedTaxAmount: string;
  payableVatAmount: string;
  lines: VatWorkingPaperLine[];
}

export interface CorporateIncomeTaxPreparation {
  companyId: string;
  filingPeriod: string;
  accountingProfit: string;
  taxableIncomeEstimate: string;
  incomeTaxRate: string;
  prepaymentTaxEstimate: string;
  adjustmentHints: string[];
  checklist: string[];
}

export type VoucherStatus = "draft" | "review_required" | "posted";

export interface Voucher {
  id: string;
  companyId: string;
  businessEventId: string;
  mappingId: string;
  voucherType: "receipt" | "payment" | "accrual" | "adjustment" | "general";
  summary: string;
  status: VoucherStatus;
  lines: VoucherDraftLine[];
  /**
   * 会计日期（`YYYY-MM-DD`）：这笔账归属哪个期间。
   *
   * 与 `postedAt`（什么时候点的过账按钮）是两件事。过账时 `ledger_entries.entry_date`
   * 取的是它，期间锁也按它判 —— 6 月的业务 7 月过账，账要记在 6 月，且锁了 6 月就
   * 不该还能补记进去。此前两者混用同一个过账时间戳，导致报表错期且期间锁失效。
   */
  accountingDate: string;
  /**
   * 凭证号，如 `记-2026-06-0037`。**未过账凭证为 null** —— 号码在过账那一刻才
   * 被消耗，草稿不占号，否则删草稿会留下断号，而《会计基础工作规范》第五十一条
   * 要求记账凭证连续编号。
   */
  voucherNumber: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  source: "analysis";
  createdAt: string;
  updatedAt: string;
}

export interface VoucherPostingRecord {
  id: string;
  companyId: string;
  voucherId: string;
  businessEventId: string;
  postedByUserId: string | null;
  postedByName: string;
  postedAt: string;
}

export interface LedgerEntry {
  id: string;
  companyId: string;
  voucherId: string;
  businessEventId: string;
  entryDate: string;
  summary: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  /**
   * 分录来源。
   * - `voucher_posting`：凭证过账产生的业务分录；
   * - `period_closing`：期末结转损益产生的分录（`closePeriod` 写入）。
   *
   * 这个联合是**如实**的：类型此前只写 `voucher_posting`，而结转分录从一开始就
   * 在往库里写 `period_closing`，测试只能用 `as unknown as LedgerEntry` 绕过。
   * 两者的区别有实际后果 —— 损益聚合必须排除结转分录、账簿列示必须保留，
   * 判断依据见 apps/api 的 modules/ledger/closing-entries.ts。
   *
   * V12：补齐 `annual_closing`（年末结转）与 `opening_balance`（期初建账）。
   * 它们从批次 B 起就在往库里写，但类型一直停在两种——写 E6 的跨年用例时才
   * 暴露出来。取值集合与迁移 067 的 CHECK 约束、`ledger/closing-sources.ts`
   * 的判定三处必须一致。
   */
  source: "voucher_posting" | "period_closing" | "annual_closing" | "opening_balance";
  postedAt: string;
  /** 往来核算维度（V12-C2）。非往来科目为空，详见 VoucherDraftLine.counterpartyId。 */
  counterpartyId?: string | null;
  /** 成本中心维度（V12-D1）。非费用科目为空，详见 VoucherDraftLine.costCenterId。 */
  costCenterId?: string | null;
  /**
   * 科目的报表口径分类，从 `accounts` 表随分录一起取出（V12 残留 7）。
   *
   * **这是报表分类的事实来源。** 此前 `classifyProfitAccount` /
   * `classifyBalanceSheetAccount` 读的是硬编码的 `chart-of-accounts.ts`，
   * 而 049 早就把科目表落了库——两份数据靠 `chart-parity` 护栏防漂移，
   * 但报表实际读的始终是常量那份。
   *
   * 可选是因为分录不是只有报表在用：凭证详情、账簿列示等场景不需要它，
   * 也不该为此多 join 一次。取不到时分类会退回按前缀兜底，与历史行为一致。
   */
  accountCategory?: AccountCategory | null;
}

export interface LedgerPostingBatch {
  id: string;
  companyId: string;
  voucherId: string;
  businessEventId: string;
  entryIds: string[];
  postedAt: string;
}

export interface MenuNode {
  key: string;
  label: string;
  route: string;
  permissionKey: string;
  children?: MenuNode[];
}

export interface CreateBusinessEventInput {
  type: BusinessEventType;
  title: string;
  description: string;
  department: string;
  occurredOn: string;
  amount: string | null;
  currency: string;
  source: BusinessEventSource;
  contractId?: string | null;
  /**
   * 往来单位（V12-C2 补齐）。C2 做了往来核销与账龄，凭证从事项继承这个维度，
   * 但事项本身一直没有录入口——种子库实测 28 个事项 0 个有往来单位，于是账龄表
   * 与核销功能整条链路都是空的。
   */
  counterpartyId?: string | null;
}

export interface CreateTaskInput {
  businessEventId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string;
  priority: TaskPriority;
  dueAt: string | null;
}

export type AccountCategory =
  | "asset"
  | "liability"
  | "equity"
  | "cost"
  | "revenue"
  | "expense";

export type AccountDirection = "debit" | "credit";

export interface ChartAccount {
  code: string;
  name: string;
  category: AccountCategory;
  direction: AccountDirection;
  level: 1 | 2 | 3;
  parentCode: string | null;
  isLeaf: boolean;
}

export interface FinancialReportLine {
  code: string;
  label: string;
  amount: string;
}

export interface BalanceSheetReport {
  periodLabel: string;
  asOfDate: string;
  assets: FinancialReportLine[];
  liabilities: FinancialReportLine[];
  equity: FinancialReportLine[];
  /**
   * 无法归入资产/负债/权益、也不属于损益的科目（V12-A5）。
   *
   * 正常情况下恒为空数组。非空说明账上出现了报表口径覆盖不到的科目代码——此前
   * 这类科目（如 4 开头的生产成本）会被**静默丢弃**，资产负债表因此不平且无从
   * 察觉。现在显式列出来，金额照常给出，配合 `warnings` 让问题可见、可定位。
   *
   * 这些行**不计入任何合计**：把成因不明的余额掺进合计只会掩盖不平。
   */
  unclassified: FinancialReportLine[];
  /** 面向使用者的报表告警（当前只有未分类科目一种）。正常为空数组。 */
  warnings: string[];
  /**
   * 恒等式自检（V12 收尾接线）。
   *
   * 「资产 = 负债 + 权益」差在哪、能不能被未结转损益解释，此前只有单独调
   * `/api/ledger/balance-check` 才看得到——而看报表的人不会去调另一个接口。
   * 现在随报表一起返回，由界面直接列示。
   *
   * 可选是因为这是外部数据边界：旧版本 API 或缓存响应可能没有这个字段。
   */
  selfCheck?: {
    asOfDate: string;
    assets: number;
    liabilities: number;
    equity: number;
    /** 尚未结转到权益的损益净额——差额的正常来源。 */
    unclosedProfitLoss: number;
    unclassified: number;
    /** 资产 − 负债 − 权益。 */
    difference: number;
    /** 差额减去可解释部分后的残差；不为 0 说明总账借贷不平，是真错账。 */
    residual: number;
    balanced: boolean;
    openFiscalYears: { year: number; netProfit: number; currentYearProfitBalance: number }[];
    /** 可直接列示的一句话，无异常时为 null。 */
    notice: string | null;
  };
  totals: {
    assets: string;
    liabilities: string;
    equity: string;
    liabilitiesAndEquity: string;
  };
}

export interface ProfitStatementReport {
  periodLabel: string;
  revenues: FinancialReportLine[];
  costsAndExpenses: FinancialReportLine[];
  totals: {
    revenue: string;
    cost: string;
    grossProfit: string;
    /** 期间费用合计，**不含所得税费用**。grossProfit - expenses = totalProfit。 */
    expenses: string;
    /** 利润总额（税前）：按企业会计准则不扣除所得税费用。 */
    totalProfit: string;
    /** 所得税费用（6801）。totalProfit - incomeTax = netProfit。 */
    incomeTax: string;
    netProfit: string;
  };
}

export interface CashFlowReport {
  periodLabel: string;
  sections: {
    operating: FinancialReportLine[];
    investing: FinancialReportLine[];
    financing: FinancialReportLine[];
  };
  totals: {
    operatingNetCash: string;
    investingNetCash: string;
    financingNetCash: string;
    netCashChange: string;
  };
}

export type ReportType = "balance_sheet" | "profit_statement" | "cash_flow";
export type ReportPeriodType = "month" | "quarter" | "year";

export interface ReportSnapshot {
  id: string;
  companyId: string;
  reportType: ReportType;
  periodType: ReportPeriodType;
  periodLabel: string;
  snapshotDate: string;
  payload: BalanceSheetReport | ProfitStatementReport | CashFlowReport;
  createdAt: string;
}

export interface ReportDiffLine {
  code: string;
  label: string;
  fromAmount: string;
  toAmount: string;
  delta: string;
}

export interface ReportDiffResult {
  reportType: ReportType;
  fromSnapshotId: string;
  toSnapshotId: string;
  lines: ReportDiffLine[];
}

export interface ChairmanReportSummary {
  reportType: ReportType;
  periodLabel: string;
  headline: string;
  highlights: string[];
  risks: string[];
}

export type RndProjectStatus = "planning" | "active" | "closed";
export type RndCapitalizationPolicy = "expense" | "capitalize" | "mixed";

export interface RndProject {
  id: string;
  companyId: string;
  businessEventId: string | null;
  code: string;
  name: string;
  status: RndProjectStatus;
  capitalizationPolicy: RndCapitalizationPolicy;
  startedOn: string;
  endedOn: string | null;
  ownerId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type RndCostLineType =
  | "payroll"
  | "materials"
  | "service"
  | "software"
  | "equipment"
  | "other";

export type RndAccountingTreatment = "expensed" | "capitalized";

export interface RndCostLine {
  id: string;
  companyId: string;
  projectId: string;
  businessEventId: string | null;
  voucherId: string | null;
  costType: RndCostLineType;
  accountingTreatment: RndAccountingTreatment;
  amount: string;
  occurredOn: string;
  notes: string;
  createdAt: string;
}

export interface RndTimeEntry {
  id: string;
  companyId: string;
  projectId: string;
  businessEventId: string | null;
  userId: string | null;
  staffName: string;
  workDate: string;
  hours: string;
  notes: string;
  createdAt: string;
}

export interface RndProjectSummary {
  projectId: string;
  expenseAmount: string;
  capitalizedAmount: string;
  totalHours: string;
  superDeductionEligibleBase: string;
}

export interface RndAccountingPolicyReview {
  projectId: string;
  projectName: string;
  recommendedPolicy: RndCapitalizationPolicy;
  conflicts: string[];
  guidance: string[];
}

export interface RndPolicyGuidance {
  projectId: string;
  projectName: string;
  subsidyHints: string[];
  policyHints: string[];
  riskHints: string[];
}

export type RiskSeverity = "low" | "medium" | "high";
export type RiskFindingStatus = "open" | "resolved" | "dismissed";

export interface RiskFinding {
  id: string;
  companyId: string;
  businessEventId: string | null;
  ruleCode: string;
  severity: RiskSeverity;
  score?: number;
  priority?: "P1" | "P2" | "P3";
  status: RiskFindingStatus;
  title: string;
  detail: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskClosureRecord {
  id: string;
  companyId: string;
  findingId: string;
  closedByUserId: string | null;
  closedByName: string;
  resolution: string;
  reviewedAt: string;
}

export interface SuperDeductionPackage {
  projectId: string;
  projectName: string;
  expenseAmount: string;
  capitalizedAmount: string;
  eligibleBase: string;
  suggestedDeductionAmount: string;
  checklist: string[];
  generatedAt: string;
}

export interface ClosingPackageExport {
  kind: "month_end" | "audit" | "inspection";
  period: string;
  title: string;
  sections: Array<{
    heading: string;
    items: string[];
  }>;
}

export type ExportArtifactKind =
  | "payroll"
  | "report"
  | "tax"
  | "package"
  | "document"
  | "risk"
  | "rnd"
  | "voucher";

export type ExportJobStatus = "created" | "opened" | "completed" | "failed";

export interface ExportJob {
  id: string;
  companyId: string;
  kind: ExportArtifactKind;
  label: string;
  fileName: string;
  resourceType: string | null;
  resourceId: string | null;
  periodLabel: string | null;
  status: ExportJobStatus;
  retryCount: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  completedAt: string | null;
  createdByUserId: string | null;
  createdByName: string;
  createdAt: string;
}

export interface ExportArchiveEntry {
  id: string;
  companyId: string;
  jobId: string;
  archiveKey: string;
  kind: ExportArtifactKind;
  title: string;
  fileName: string;
  objectType: string;
  objectId: string | null;
  periodLabel: string | null;
  createdAt: string;
}

export type EmployeeStatus = "active" | "on_leave" | "resigned";

export interface Employee {
  id: string;
  companyId: string;
  departmentId: string | null;
  name: string;
  idCard: string;
  position: string;
  hireDate: string | null;
  leaveDate: string | null;
  baseSalary: number;
  status: EmployeeStatus;
  notes: string;
  salaryAccount?: string;
  salaryBank?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollPolicy {
  id: string;
  companyId: string;
  socialSecurityBaseMin: number;
  socialSecurityBaseMax: number;
  pensionEmployeeRate: number;
  pensionEmployerRate: number;
  medicalEmployeeRate: number;
  medicalEmployerRate: number;
  unemploymentEmployeeRate: number;
  unemploymentEmployerRate: number;
  housingFundEmployeeRate: number;
  housingFundEmployerRate: number;
  iitThreshold: number;
  updatedAt: string;
}

export type PayrollStatus = "draft" | "confirmed";

export interface PayrollRecord {
  id: string;
  companyId: string;
  period: string;
  employeeId: string;
  employeeName: string;
  grossSalary: number;
  socialSecurityEmployee: number;
  socialSecurityEmployer: number;
  housingFundEmployee: number;
  housingFundEmployer: number;
  iitWithheld: number;
  netPay: number;
  status: PayrollStatus;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  confirmedByName: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollPeriodSummary {
  period: string;
  headcount: number;
  totalGross: number;
  totalSocialSecurityEmployee: number;
  totalSocialSecurityEmployer: number;
  totalHousingFundEmployee: number;
  totalHousingFundEmployer: number;
  totalIit: number;
  totalNetPay: number;
  status: "draft" | "confirmed" | "mixed";
}

export type PayrollTaxReviewType = "iit" | "social_security" | "housing_fund";
export type PayrollTaxReviewStatus = "pending" | "ready" | "reviewed";

export interface PayrollTaxReviewLedger {
  id: string;
  companyId: string;
  period: string;
  reviewType: PayrollTaxReviewType;
  businessEventId: string | null;
  taxItemIds: string[];
  totalEmployeeAmount: string;
  totalEmployerAmount: string;
  status: PayrollTaxReviewStatus;
  notes: string;
  updatedAt: string;
}

export type ContractType = "sales" | "procurement" | "lease" | "service" | "other";
export type ContractStatus = "draft" | "active" | "fulfilled" | "terminated" | "expired";

export interface Contract {
  id: string;
  companyId: string;
  contractNo: string;
  contractType: ContractType;
  title: string;
  counterpartyName: string;
  counterpartyType: string;
  amount: number;
  currency: string;
  signedDate: string | null;
  startDate: string | null;
  endDate: string | null;
  status: ContractStatus;
  notes: string;
  createdByUserId: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractWithEventCount extends Contract {
  relatedEventCount: number;
}

export type ContractObjectLinkType = "task" | "document" | "tax_item" | "voucher";

export interface ContractObjectLink {
  id: string;
  companyId: string;
  contractId: string;
  businessEventId: string;
  objectType: ContractObjectLinkType;
  objectId: string;
  relationKind: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeItem {
  id: string;
  companyId: string;
  category: "regulation" | "policy" | "faq" | "template";
  title: string;
  content: string;
  tags: string[];
  isActive: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  companyId: string;
  userId: string | null;
  userName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

export type WorkflowResourceType =
  | "business_event"
  | "task"
  | "tax_filing_batch"
  | "contract"
  | "voucher"
  | "payroll"
  | "export_job"
  | "generic";

export type WorkflowState =
  | "draft"
  | "collecting_documents"
  | "ready_for_review"
  | "under_review"
  | "awaiting_authorization"
  | "executing"
  | "completed"
  | "blocked"
  | "cancelled"
  | "correcting";

export interface WorkflowMaterialReference {
  type: string;
  id: string;
  label: string;
}

export interface WorkflowRun {
  id: string;
  companyId: string;
  workflowKey: string;
  resourceType: WorkflowResourceType;
  resourceId: string;
  resourceLabel: string;
  currentState: WorkflowState;
  initiatorUserId: string | null;
  initiatorName: string;
  authorizerUserId: string | null;
  authorizerName: string | null;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTransitionRecord {
  id: string;
  companyId: string;
  workflowRunId: string;
  resourceType: WorkflowResourceType;
  resourceId: string;
  previousState: WorkflowState;
  nextState: WorkflowState;
  actorUserId: string | null;
  actorName: string;
  basis: string;
  ruleVersion: string;
  relatedMaterials: WorkflowMaterialReference[];
  occurredAt: string;
}

export type WorkflowCommandStatus =
  | "waiting"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface WorkflowRetryPolicy {
  maxAttempts: number;
  backoffMinutes: number;
}

export interface WorkflowTimeoutPolicy {
  timeoutSeconds: number;
}

export interface WorkflowCommandExecution {
  id: string;
  companyId: string;
  workflowRunId: string;
  commandType: string;
  resourceType: WorkflowResourceType;
  resourceId: string;
  idempotencyKey: string;
  objectVersion: string;
  status: WorkflowCommandStatus;
  progress: string;
  inputSnapshot: Record<string, unknown>;
  resultSnapshot: Record<string, unknown> | null;
  retryPolicy: WorkflowRetryPolicy;
  timeoutPolicy: WorkflowTimeoutPolicy;
  attemptCount: number;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  executorUserId: string | null;
  executorName: string;
  initiatorUserId: string | null;
  initiatorName: string;
  authorizerUserId: string | null;
  authorizerName: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export type WorkflowCompensationStatus = "open" | "in_progress" | "resolved" | "cancelled";

export interface WorkflowCompensationRecord {
  id: string;
  companyId: string;
  workflowRunId: string;
  commandExecutionId: string;
  actionType: string;
  status: WorkflowCompensationStatus;
  reason: string;
  handoffToUserId: string | null;
  handoffToName: string | null;
  notes: string;
  createdAt: string;
  resolvedAt: string | null;
}

export const permissionCatalog = [
  "dashboard.view",
  "events.view",
  "events.create",
  "events.assign",
  "tasks.view",
  "tasks.manage",
  "documents.view",
  "documents.manage",
  "ledger.view",
  "ledger.post",
  // 银行账户、流水导入/同步、对账确认自成一档：这些是出纳的本职工作，
  // 而 ledger.post 是记账权（出纳不持有）。此前整组 banking 写路由挂 ledger.post，
  // 等于把出纳挡在自己的活儿外面；再往回降到 ledger.view 又会让只读账号也能导流水。
  "banking.manage",
  "tax.view",
  "tax.manage",
  "rnd.view",
  "rnd.manage",
  "risk.view",
  "risk.manage",
  "contracts.view",
  "contracts.manage",
  "payroll.view",
  "payroll.manage",
  "audit.view",
  "workflow.view",
  "workflow.manage",
  // V13 费控。预算与费用标准分开授权：预算额度是管理层的决策数据（部门经理
  // 该看得到自己部门的预算执行），而费用标准是行政/HR 维护的制度配置，
  // 两者的持有人在多数公司里不是同一批人。
  "budget.view",
  "budget.manage",
  "expense.view",
  // 提交费用类单据（申请/借款/报销）。**与 expense.view 分开**：只读角色
  // 与审计要看得到费用标准和别人的单据，但不该能提单——V13-B 的权限护栏
  // 正是抓到「role-viewer 能建申请单」才拆出这个键。
  "expense.submit",
  "expense.manage",
  "knowledge.view",
  "knowledge.manage",
  "settings.manage"
] as const;

export type PermissionKey = (typeof permissionCatalog)[number];
