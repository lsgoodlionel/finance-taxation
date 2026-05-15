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
  | "submitted";

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
  "settings.manage"
] as const;

export type PermissionKey = (typeof permissionCatalog)[number];
