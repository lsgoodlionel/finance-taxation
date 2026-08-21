/**
 * 数据库行 → 领域对象的映射（V15/P2 自 routes.ts 拆出）。
 *
 * 这一层只做形状转换，**不带业务判断**。放在一起是因为它们共享一组
 * `*Row` 接口，而那组接口必须和 SQL 的 select 列一一对应——散在各处时
 * 加一列忘了改 mapper，字段会静默变成 undefined。
 */
import type {
  BusinessEvent,
  BusinessEventActivity,
  BusinessEventRelation,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  Task,
  VoucherDraftLine
} from "@finance-taxation/domain-model";
import { toDateOnly } from "../../db/date-column.js";

export interface BusinessEventRow {
  id: string;
  company_id: string;
  type: BusinessEvent["type"];
  title: string;
  description: string;
  department: string;
  owner_id: string | null;
  occurred_on: string | Date;
  amount: string | number | null;
  currency: string;
  status: BusinessEvent["status"];
  source: BusinessEvent["source"];
  contract_id: string | null;
  counterparty_id: string | null;
  project_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface BusinessEventRelationRow {
  id: string;
  company_id: string;
  business_event_id: string;
  relation_type: BusinessEventRelation["relationType"];
  target_id: string;
  label: string;
  created_at: string | Date;
}

export interface BusinessEventActivityRow {
  id: string;
  company_id: string;
  business_event_id: string;
  activity_type: BusinessEventActivity["activityType"];
  actor_user_id: string | null;
  actor_name: string;
  summary: string;
  created_at: string | Date;
}

export interface TaskRow {
  id: string;
  company_id: string;
  business_event_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  owner_id: string | null;
  due_at: string | Date | null;
  assignee_department: string | null;
  source: Task["source"];
  created_at: string | Date;
  updated_at: string | Date;
}

export interface EventDocumentMappingRow {
  id: string;
  company_id: string;
  business_event_id: string;
  document_type: string;
  title: string;
  status: EventDocumentMapping["status"];
  owner_department: string;
  notes: string;
  created_at: string | Date;
}

export interface EventTaxMappingRow {
  id: string;
  company_id: string;
  business_event_id: string;
  tax_type: string;
  treatment: string;
  status: EventTaxMapping["status"] | "required";
  basis: string;
  filing_period: string;
  created_at: string | Date;
}

export interface EventVoucherDraftRow {
  id: string;
  company_id: string;
  business_event_id: string;
  voucher_type: EventVoucherDraft["voucherType"];
  status: EventVoucherDraft["status"];
  summary: string;
  created_at: string | Date;
}

export interface VoucherDraftLineRow {
  id: string;
  draft_id: string;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  sort_order: number;
}

export interface DbExecutor {
  query<T extends object = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

export function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toAmountString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" ? value.toFixed(2) : String(value);
}

export function mapEventRow(row: BusinessEventRow): BusinessEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    type: row.type,
    title: row.title,
    description: row.description,
    department: row.department,
    ownerId: row.owner_id,
    // occurred_on 是 PG `date`：用 toDateOnly 保证结果与运行时时区无关。
    occurredOn: toDateOnly(row.occurred_on) ?? "",
    amount: toAmountString(row.amount),
    currency: row.currency,
    status: row.status,
    source: row.source,
    contractId: row.contract_id,
    counterpartyId: row.counterparty_id,
    projectId: row.project_id,
    createdAt: toIsoString(row.created_at) || undefined,
    updatedAt: toIsoString(row.updated_at) || undefined
  };
}

export function mapRelationRow(row: BusinessEventRelationRow): BusinessEventRelation {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    relationType: row.relation_type,
    targetId: row.target_id,
    label: row.label,
    createdAt: toIsoString(row.created_at) || new Date().toISOString()
  };
}

export function mapActivityRow(row: BusinessEventActivityRow): BusinessEventActivity {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    activityType: row.activity_type,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    summary: row.summary,
    createdAt: toIsoString(row.created_at) || new Date().toISOString()
  };
}

export function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    parentTaskId: row.parent_task_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    ownerId: row.owner_id,
    dueAt: toIsoString(row.due_at),
    assigneeDepartment: row.assignee_department,
    source: row.source,
    createdAt: toIsoString(row.created_at) || undefined,
    updatedAt: toIsoString(row.updated_at) || undefined
  };
}

export function mapDocumentMappingRow(row: EventDocumentMappingRow): EventDocumentMapping {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    documentType: row.document_type,
    title: row.title,
    status: row.status,
    ownerDepartment: row.owner_department,
    notes: row.notes
  };
}

export function mapTaxMappingRow(row: EventTaxMappingRow): EventTaxMapping {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    taxType: row.tax_type,
    treatment: row.treatment,
    status: row.status === "required" ? "attention" : row.status,
    basis: row.basis,
    filingPeriod: row.filing_period
  };
}

export function mapVoucherLineRow(row: VoucherDraftLineRow): VoucherDraftLine {
  return {
    id: row.id,
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: toAmountString(row.debit) || "0.00",
    credit: toAmountString(row.credit) || "0.00"
  };
}

export function buildVoucherDrafts(
  rows: EventVoucherDraftRow[],
  lineRows: VoucherDraftLineRow[]
): EventVoucherDraft[] {
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    voucherType: row.voucher_type,
    status: row.status,
    summary: row.summary,
    lines: lineRows
      .filter((line) => line.draft_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapVoucherLineRow)
  }));
}

/**
 * 公司级可见范围。实现搬到了 `visibility.ts`，这里只保留一层薄包装——
 * 角色清单有两份拷贝时，改了一份忘了另一份，就是一次静默的越权。
 *
 * tasks / runtime 仍从这里引用，签名不变。
 */
