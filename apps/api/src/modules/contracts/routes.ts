import type { ServerResponse } from "node:http";
import type { Contract, ContractObjectLinkType, ContractWithEventCount, GeneratedDocument, Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import { query, queryOne, withTransaction } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { buildContractWorkspaceSummary } from "./summary.js";
import { getContractCloseEventStatus } from "./status-sync.js";
import { validateWorkflowAuthorization } from "../workflows/authorization.js";
import { buildWorkflowRun } from "../workflows/commands.js";
import { ensureWorkflowRun, insertWorkflowTransition, updateWorkflowRunState } from "../workflows/persistence.js";
import { buildWorkflowTransitionRecord, mapContractStatusToWorkflowState, validateWorkflowTransition } from "../workflows/runtime.js";

interface ContractRow {
  id: string;
  company_id: string;
  contract_no: string;
  contract_type: Contract["contractType"];
  title: string;
  counterparty_name: string;
  counterparty_type: string;
  amount: string | number;
  currency: string;
  signed_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: Contract["status"];
  notes: string;
  created_by_user_id: string | null;
  created_by_name: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface ContractRowWithCount extends ContractRow {
  related_event_count: string | number;
}

interface ContractDocumentSummaryRow {
  id: string;
  companyId: string;
  businessEventId: string;
  mappingId: string;
  documentType: string;
  title: string;
  ownerDepartment: string;
  status: GeneratedDocument["status"];
  attachmentIds: string[];
  archivedAt: string | null;
  source: GeneratedDocument["source"];
  createdAt: string;
  updatedAt: string;
}

export function buildGeneratedDocumentSelectQuery(): string {
  return `
    select
      id,
      company_id as "companyId",
      business_event_id as "businessEventId",
      mapping_id as "mappingId",
      document_type as "documentType",
      title,
      owner_department as "ownerDepartment",
      status,
      ARRAY[]::text[] as "attachmentIds",
      archived_at as "archivedAt",
      source,
      created_at as "createdAt",
      updated_at as "updatedAt"
    from generated_documents
    where company_id = $1
      and (
        business_event_id = any($2::text[])
        or id = any($3::text[])
      )
  `;
}

interface ContractTaxItemSummaryRow extends TaxItem {}

interface ContractVoucherSummaryRow extends Omit<Voucher, "lines"> {}
interface ContractTaskSummaryRow extends Task {}
interface ContractObjectLinkRow {
  objectType: ContractObjectLinkType;
  objectId: string;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: ContractRow): Contract {
  return {
    id: row.id,
    companyId: row.company_id,
    contractNo: row.contract_no,
    contractType: row.contract_type,
    title: row.title,
    counterpartyName: row.counterparty_name,
    counterpartyType: row.counterparty_type,
    amount: Number(row.amount),
    currency: row.currency,
    signedDate: row.signed_date ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    status: row.status,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? ""
  };
}

export async function listContracts(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url!, `http://x`);
  const companyId = req.auth!.companyId;
  const contractType = url.searchParams.get("contractType");
  const status = url.searchParams.get("status");

  const conditions: string[] = ["c.company_id = $1"];
  const params: unknown[] = [companyId];
  let idx = 2;

  if (contractType) {
    conditions.push(`c.contract_type = $${idx++}`);
    params.push(contractType);
  }
  if (status) {
    conditions.push(`c.status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.join(" and ");
  const rows = await query<ContractRowWithCount>(
    `
      select c.*,
             count(be.id)::int as related_event_count
      from contracts c
      left join business_events be on be.contract_id = c.id
      where ${where}
      group by c.id
      order by c.created_at desc
    `,
    params
  );

  const items: ContractWithEventCount[] = rows.map((row) => ({
    ...mapRow(row),
    relatedEventCount: Number(row.related_event_count)
  }));

  return json(res, 200, { items, total: items.length });
}

export async function createContract(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const body = req.body as Partial<{
    contractNo: string;
    contractType: string;
    title: string;
    counterpartyName: string;
    counterpartyType: string;
    amount: number;
    currency: string;
    signedDate: string;
    startDate: string;
    endDate: string;
    status: string;
    notes: string;
  }>;

  if (!body.title || !body.contractType || !body.counterpartyName) {
    return json(res, 400, { error: "title, contractType and counterpartyName are required" });
  }

  const id = `contract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const contractNo = body.contractNo || `CNT-${Date.now()}`;
  const displayName = req.auth!.username || "系统";

  const row = await queryOne<ContractRow>(
    `
      insert into contracts (
        id, company_id, contract_no, contract_type, title,
        counterparty_name, counterparty_type,
        amount, currency,
        signed_date, start_date, end_date,
        status, notes,
        created_by_user_id, created_by_name
      ) values (
        $1,$2,$3,$4,$5,
        $6,$7,
        $8,$9,
        $10,$11,$12,
        $13,$14,
        $15,$16
      )
      returning *
    `,
    [
      id, companyId, contractNo,
      body.contractType, body.title,
      body.counterpartyName, body.counterpartyType ?? "external",
      body.amount ?? 0, body.currency ?? "CNY",
      body.signedDate ?? null, body.startDate ?? null, body.endDate ?? null,
      body.status ?? "active", body.notes ?? "",
      req.auth!.userId ?? null, displayName
    ]
  );

  const created = mapRow(row!);
  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username || req.auth!.username,
    action: "create",
    resourceType: "contract",
    resourceId: created.id,
    resourceLabel: created.title,
    changes: { data: { contractType: created.contractType, amount: created.amount } }
  });
  return json(res, 201, { contract: created });
}

export async function getContractDetail(req: ApiRequest, res: ServerResponse, contractId: string) {
  const companyId = req.auth!.companyId;

  const row = await queryOne<ContractRow>(
    `select * from contracts where id = $1 and company_id = $2`,
    [contractId, companyId]
  );
  if (!row) return json(res, 404, { error: "Contract not found" });

  const events = await query<{ id: string; title: string; status: string; created_at: Date }>(
    `select id, title, status, created_at from business_events where contract_id = $1 and company_id = $2 order by created_at desc`,
    [contractId, companyId]
  );
  const eventIds = events.map((event) => event.id);
  const links = await query<ContractObjectLinkRow>(
    `
      select object_type as "objectType", object_id as "objectId"
      from contract_object_links
      where contract_id = $1 and company_id = $2
    `,
    [contractId, companyId]
  );
  const linkedDocumentIds = links.filter((item) => item.objectType === "document").map((item) => item.objectId);
  const linkedTaxItemIds = links.filter((item) => item.objectType === "tax_item").map((item) => item.objectId);
  const linkedVoucherIds = links.filter((item) => item.objectType === "voucher").map((item) => item.objectId);
  const linkedTaskIds = links.filter((item) => item.objectType === "task").map((item) => item.objectId);

  const documents = eventIds.length || linkedDocumentIds.length
    ? await query<ContractDocumentSummaryRow>(
        buildGeneratedDocumentSelectQuery(),
        [companyId, eventIds, linkedDocumentIds]
      )
    : [];
  const taxItems = eventIds.length || linkedTaxItemIds.length
    ? await query<ContractTaxItemSummaryRow>(
        `
          select
            id,
            company_id as "companyId",
            business_event_id as "businessEventId",
            mapping_id as "mappingId",
            tax_type as "taxType",
            treatment,
            basis,
            filing_period as "filingPeriod",
            status,
            source,
            created_at as "createdAt",
            updated_at as "updatedAt"
          from tax_items
          where company_id = $1
            and (
              business_event_id = any($2::text[])
              or id = any($3::text[])
            )
        `,
        [companyId, eventIds, linkedTaxItemIds]
      )
    : [];
  const vouchers = eventIds.length || linkedVoucherIds.length
    ? await query<ContractVoucherSummaryRow>(
        `
          select
            id,
            company_id as "companyId",
            business_event_id as "businessEventId",
            mapping_id as "mappingId",
            voucher_type as "voucherType",
            summary,
            status,
            approved_at as "approvedAt",
            posted_at as "postedAt",
            source,
            created_at as "createdAt",
            updated_at as "updatedAt"
          from vouchers
          where company_id = $1
            and (
              business_event_id = any($2::text[])
              or id = any($3::text[])
            )
        `,
        [companyId, eventIds, linkedVoucherIds]
      )
    : [];
  const tasks = eventIds.length || linkedTaskIds.length
    ? await query<ContractTaskSummaryRow>(
        `
          select
            id,
            company_id as "companyId",
            business_event_id as "businessEventId",
            parent_task_id as "parentTaskId",
            title,
            description,
            status,
            priority,
            owner_id as "ownerId",
            due_at as "dueAt",
            assignee_department as "assigneeDepartment",
            source,
            created_at as "createdAt",
            updated_at as "updatedAt"
          from tasks
          where company_id = $1
            and (
              business_event_id = any($2::text[])
              or id = any($3::text[])
            )
          order by created_at desc
        `,
        [companyId, eventIds, linkedTaskIds]
      )
    : [];
  const workspaceSummary = buildContractWorkspaceSummary({
    relatedEventIds: eventIds,
    linkedObjectIds: {
      documentIds: linkedDocumentIds,
      taxItemIds: linkedTaxItemIds,
      voucherIds: linkedVoucherIds,
      taskIds: linkedTaskIds
    },
    documents,
    taxItems,
    vouchers: vouchers.map((voucher) => ({ ...voucher, lines: [] })),
    tasks
  });

  return json(res, 200, {
    contract: mapRow(row),
    relatedEvents: events.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      createdAt: toIso(e.created_at)
    })),
    relatedTasks: workspaceSummary.tasks,
    relatedDocuments: workspaceSummary.documents,
    relatedTaxItems: workspaceSummary.taxItems,
    relatedVouchers: workspaceSummary.vouchers
  });
}

export async function updateContract(req: ApiRequest, res: ServerResponse, contractId: string) {
  const companyId = req.auth!.companyId;
  const body = req.body as Partial<{
    title: string;
    counterpartyName: string;
    counterpartyType: string;
    amount: number;
    currency: string;
    signedDate: string;
    startDate: string;
    endDate: string;
    status: string;
    notes: string;
  }>;

  const existing = await queryOne<ContractRow>(
    `select * from contracts where id = $1 and company_id = $2`,
    [contractId, companyId]
  );
  if (!existing) return json(res, 404, { error: "Contract not found" });

  const row = await queryOne<ContractRow>(
    `
      update contracts set
        title             = $1,
        counterparty_name = $2,
        counterparty_type = $3,
        amount            = $4,
        currency          = $5,
        signed_date       = $6,
        start_date        = $7,
        end_date          = $8,
        status            = $9,
        notes             = $10,
        updated_at        = now()
      where id = $11 and company_id = $12
      returning *
    `,
    [
      body.title ?? existing.title,
      body.counterpartyName ?? existing.counterparty_name,
      body.counterpartyType ?? existing.counterparty_type,
      body.amount ?? existing.amount,
      body.currency ?? existing.currency,
      body.signedDate ?? existing.signed_date,
      body.startDate ?? existing.start_date,
      body.endDate ?? existing.end_date,
      body.status ?? existing.status,
      body.notes ?? existing.notes,
      contractId, companyId
    ]
  );

  return json(res, 200, { contract: mapRow(row!) });
}

export async function closeContract(req: ApiRequest, res: ServerResponse, contractId: string) {
  const companyId = req.auth!.companyId;
  const body = req.body as {
    status?: "fulfilled" | "terminated";
    authorizerUserId?: string;
    authorizerName?: string;
  };
  const newStatus = body.status ?? "fulfilled";
  const nextEventStatus = getContractCloseEventStatus(newStatus);
  const authorizerUserId = body.authorizerUserId ?? req.auth!.userId;
  const authorizerName = body.authorizerName ?? req.auth!.username;
  const existing = await queryOne<ContractRow>(
    `select * from contracts where id = $1 and company_id = $2`,
    [contractId, companyId]
  );
  if (!existing) return json(res, 404, { error: "Contract not found" });
  const authCheck = validateWorkflowAuthorization({
    action: "contract.close",
    requesterUserId: req.auth!.userId,
    executorUserId: req.auth!.userId,
    authorizerUserId
  });
  if (!authCheck.ok) {
    return json(res, 400, { error: authCheck.message, code: authCheck.errorCode });
  }
  const previousState = mapContractStatusToWorkflowState(existing.status);
  const nextState = mapContractStatusToWorkflowState(newStatus);
  const transitionValidation = validateWorkflowTransition(previousState, nextState);
  if (!transitionValidation.ok) {
    return json(res, 400, { error: transitionValidation.message, code: transitionValidation.errorCode });
  }

  const row = await withTransaction(async (client) => {
    const result = await client.query<ContractRow>(
      `
        update contracts set status = $1, updated_at = now()
        where id = $2 and company_id = $3
        returning *
      `,
      [newStatus, contractId, companyId]
    );
    const updated = result.rows[0] ?? null;
    if (!updated) return null;
    await client.query(
      `
        update business_events
        set status = $1, updated_at = now()
        where contract_id = $2
          and company_id = $3
          and status in ('draft', 'analyzed', 'awaiting_documents', 'awaiting_approval')
      `,
      [nextEventStatus, contractId, companyId]
    );
    const closed = mapRow(updated);
    const run = await ensureWorkflowRun(
      client,
      buildWorkflowRun({
        companyId,
        workflowKey: "contract.lifecycle",
        resourceType: "contract",
        resourceId: contractId,
        resourceLabel: closed.title,
        currentState: previousState,
        initiatorUserId: req.auth!.userId,
        initiatorName: req.auth!.username,
        authorizerUserId,
        authorizerName
      })
    );
    const transition = buildWorkflowTransitionRecord({
      companyId,
      workflowRunId: run.id,
      resourceType: "contract",
      resourceId: contractId,
      previousState,
      nextState,
      actorUserId: req.auth!.userId,
      actorName: req.auth!.username,
      basis: `contract.close:${newStatus}`,
      ruleVersion: "v4-1a"
    });
    await insertWorkflowTransition(client, transition);
    await updateWorkflowRunState(client, run.id, nextState, null, transition.occurredAt);
    return updated;
  });
  if (!row) return json(res, 404, { error: "Contract not found" });

  const closed = mapRow(row);
  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username || req.auth!.username,
    action: "close",
    resourceType: "contract",
    resourceId: contractId,
    resourceLabel: closed.title,
    changes: { after: { status: newStatus } }
  });
  return json(res, 200, { contract: closed });
}

export async function getContractEvents(req: ApiRequest, res: ServerResponse, contractId: string) {
  const companyId = req.auth!.companyId;

  const exists = await queryOne<{ id: string }>(
    `select id from contracts where id = $1 and company_id = $2`,
    [contractId, companyId]
  );
  if (!exists) return json(res, 404, { error: "Contract not found" });

  const events = await query<{ id: string; title: string; type: string; status: string; amount: string; created_at: Date }>(
    `
      select id, title, type, status, amount, created_at
      from business_events
      where contract_id = $1 and company_id = $2
      order by created_at desc
    `,
    [contractId, companyId]
  );

  return json(res, 200, {
    items: events.map((e) => ({
      id: e.id,
      title: e.title,
      eventType: e.type,
      status: e.status,
      amount: Number(e.amount),
      createdAt: toIso(e.created_at)
    }))
  });
}
