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
