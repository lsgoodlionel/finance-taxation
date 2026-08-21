/**
 * 事项及其派生对象的落库与读取（V15/P2 自 routes.ts 拆出）。
 *
 * 每个 insert 都接 `DbExecutor` 而不是直接用全局 query：调用方要能把它们
 * 串在同一个事务里——一条事项和它派生的单据、税项、凭证草稿必须一起成功
 * 或一起失败，半成品事项比没有事项更难收拾。
 */
import type {
  BusinessEvent,
  BusinessEventActivity,
  ContractObjectLink,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  GeneratedDocument,
  Task,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";
import { query } from "../../db/client.js";
import { toDateOnly } from "../../db/date-column.js";
import {
  BusinessEventRow,
  DbExecutor,
  TaskRow,
  mapEventRow,
  mapTaskRow
} from "./event-rows.js";

export async function listCompanyEvents(companyId: string): Promise<BusinessEvent[]> {
  const rows = await query<BusinessEventRow>(
    `
      select
        id,
        company_id,
        type,
        title,
        description,
        department,
        owner_id,
        occurred_on,
        amount,
        currency,
        status,
        source,
        contract_id,
        counterparty_id,
        project_id,
        created_at,
        updated_at
      from business_events
      where company_id = $1
      order by occurred_on desc, created_at desc
    `,
    [companyId]
  );
  return rows.map(mapEventRow);
}

export async function listCompanyTasks(companyId: string): Promise<Task[]> {
  const rows = await query<TaskRow>(
    `
      select
        id,
        company_id,
        business_event_id,
        parent_task_id,
        title,
        description,
        status,
        priority,
        owner_id,
        due_at,
        assignee_department,
        source,
        created_at,
        updated_at
      from tasks
      where company_id = $1
      order by
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
        created_at desc
    `,
    [companyId]
  );
  return rows.map(mapTaskRow);
}

export async function insertActivities(executor: DbExecutor, activities: BusinessEventActivity[]) {
  for (const activity of activities) {
    await executor.query(
      `
        insert into business_event_activities (
          id,
          company_id,
          business_event_id,
          activity_type,
          actor_user_id,
          actor_name,
          summary,
          created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
      `,
      [
        activity.id,
        activity.companyId,
        activity.businessEventId,
        activity.activityType,
        activity.actorUserId,
        activity.actorName,
        activity.summary,
        activity.createdAt
      ]
    );
  }
}

export async function insertTasks(executor: DbExecutor, tasks: Task[]) {
  for (const task of tasks) {
    await executor.query(
      `
        insert into tasks (
          id,
          company_id,
          business_event_id,
          parent_task_id,
          title,
          description,
          status,
          priority,
          owner_id,
          due_at,
          assignee_department,
          source,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11, $12, $13::timestamptz, $14::timestamptz)
      `,
      [
        task.id,
        task.companyId,
        task.businessEventId,
        task.parentTaskId,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.ownerId,
        task.dueAt,
        task.assigneeDepartment,
        task.source,
        task.createdAt,
        task.updatedAt
      ]
    );
  }
}

export async function insertDocumentMappings(executor: DbExecutor, rows: EventDocumentMapping[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into event_document_mappings (
          id,
          company_id,
          business_event_id,
          document_type,
          title,
          status,
          owner_department,
          notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.documentType,
        row.title,
        row.status,
        row.ownerDepartment,
        row.notes
      ]
    );
  }
}

export async function insertTaxMappings(executor: DbExecutor, rows: EventTaxMapping[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into event_tax_mappings (
          id,
          company_id,
          business_event_id,
          tax_type,
          treatment,
          status,
          basis,
          filing_period
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.taxType,
        row.treatment,
        row.status,
        row.basis,
        row.filingPeriod
      ]
    );
  }
}

export async function insertVoucherDrafts(executor: DbExecutor, rows: EventVoucherDraft[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into event_voucher_drafts (
          id,
          company_id,
          business_event_id,
          voucher_type,
          status,
          summary
        ) values ($1, $2, $3, $4, $5, $6)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.voucherType,
        row.status,
        row.summary
      ]
    );
    for (const [index, line] of row.lines.entries()) {
      await executor.query(
        `
          insert into voucher_draft_lines (
            id,
            draft_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)
        `,
        [
          line.id,
          row.id,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index
        ]
      );
    }
  }
}

export async function insertGeneratedDocuments(executor: DbExecutor, rows: GeneratedDocument[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into generated_documents (
          id,
          company_id,
          business_event_id,
          mapping_id,
          document_type,
          title,
          owner_department,
          status,
          source,
          archived_at,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.mappingId,
        row.documentType,
        row.title,
        row.ownerDepartment,
        row.status,
        row.source,
        row.archivedAt,
        row.createdAt,
        row.updatedAt
      ]
    );
  }
}

export async function insertTaxItems(executor: DbExecutor, rows: TaxItem[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into tax_items (
          id,
          company_id,
          business_event_id,
          mapping_id,
          tax_type,
          treatment,
          basis,
          filing_period,
          status,
          source,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.mappingId,
        row.taxType,
        row.treatment,
        row.basis,
        row.filingPeriod,
        row.status,
        row.source,
        row.createdAt,
        row.updatedAt
      ]
    );
  }
}

export async function insertVouchers(executor: DbExecutor, rows: Voucher[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into vouchers (
          id,
          company_id,
          business_event_id,
          mapping_id,
          voucher_type,
          summary,
          status,
          source,
          approved_at,
          posted_at,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.mappingId,
        row.voucherType,
        row.summary,
        row.status,
        row.source,
        row.approvedAt,
        row.postedAt,
        row.createdAt,
        row.updatedAt
      ]
    );
    for (const [index, line] of row.lines.entries()) {
      await executor.query(
        `
          insert into voucher_lines (
            id,
            voucher_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)
        `,
        [
          line.id,
          row.id,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index
        ]
      );
    }
  }
}

export async function insertContractObjectLinks(executor: DbExecutor, rows: ContractObjectLink[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into contract_object_links (
          id,
          company_id,
          contract_id,
          business_event_id,
          object_type,
          object_id,
          relation_kind,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)
        on conflict (contract_id, object_type, object_id)
        do update set
          business_event_id = excluded.business_event_id,
          relation_kind = excluded.relation_kind,
          updated_at = excluded.updated_at
      `,
      [
        row.id,
        row.companyId,
        row.contractId,
        row.businessEventId,
        row.objectType,
        row.objectId,
        row.relationKind,
        row.createdAt,
        row.updatedAt
      ]
    );
  }
}
