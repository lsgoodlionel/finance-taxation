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
  source: "voucher_posting";
  postedAt: string;
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
    expenses: string;
    totalProfit: string;
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
  "settings.manage"
] as const;

export type PermissionKey = (typeof permissionCatalog)[number];
