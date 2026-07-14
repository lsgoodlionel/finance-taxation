/**
 * H1-w2 草稿队列接线（draft-then-approve）。
 *
 * ┌ generate ┐  纯核心 buildDraftProposalFromSuggestion() 产出提案 → 落库为
 *              event_voucher_drafts（status='draft'）+ voucher_draft_lines。
 * ┌ approve  ┐  服务端重新硬校验借贷平衡（整数分）后，把草稿升级为一张
 *              status='draft' 的正式 voucher + voucher_lines —— **绝不写 posted**。
 * ┌ post     ┐  真正入账仍必须经由既有的 POST /api/vouchers/:id/post
 *              （借贷平衡 + 期间锁双重校验的入账门），本模块不提供、也不
 *              应提供任何绕过该门的入账能力。
 *
 * AI 只产草稿；人工（approve/reject）只决定草稿的去留；过账门保持独立。
 */

import type { ServerResponse } from "node:http";
import type { VoucherDraftLine } from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../../types.js";
import { query, queryOne, withTransaction } from "../../../db/client.js";
import { json } from "../../../utils/http.js";
import { writeAudit } from "../../../services/audit.js";
import { suggestAccountingEntry, type EventForAccounting } from "../accounting-agent.js";
import { buildDraftProposalFromSuggestion } from "./draft-proposal.js";

const PERIOD_LABEL = /^\d{4}-\d{2}$/;

/** 仅本模块生成的草稿参与 AI 草稿队列（M-1：不误纳其它来源的草稿）。 */
const AI_CLOSE_SOURCE = "ai_close";

/** H-1：并发下草稿状态已被改（非 draft），条件更新未命中时抛出，使事务回滚。 */
class DraftStateConflictError extends Error {
  constructor() {
    super("draft state changed concurrently");
    this.name = "DraftStateConflictError";
  }
}

const DRAFT_COLUMNS = `
  id, company_id, business_event_id, voucher_type, status, summary,
  proposal_level, balanced, rationale, source, generated_run_id,
  approved_voucher_id, decided_at, created_at
`;

interface EligibleEventRow {
  id: string;
  type: string;
  title: string;
  amount: string | null;
  has_draft: boolean;
}

interface DraftRow {
  id: string;
  company_id: string;
  business_event_id: string;
  voucher_type: string;
  status: string;
  summary: string;
  proposal_level: string | null;
  balanced: boolean | null;
  rationale: string | null;
  source: string;
  generated_run_id: string | null;
  approved_voucher_id: string | null;
  decided_at: string | Date | null;
  created_at: string | Date;
}

interface DraftLineRow {
  id: string;
  draft_id: string;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  sort_order: number;
}

function toAmountString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0.00";
  return typeof value === "number" ? value.toFixed(2) : String(value);
}

/** DB numeric(18,2) 值转整数分；批准时硬校验借贷平衡只信任整数比较，不信任浮点。 */
function toCents(value: string | number): number {
  const normalized = typeof value === "number" ? value : Number(value);
  return Math.round(normalized * 100);
}

/** 查询该期内「未生成已过账凭证」的经营事项，并标记是否已存在草稿（供幂等跳过）。 */
async function findEligibleEvents(companyId: string, period: string): Promise<EligibleEventRow[]> {
  return query<EligibleEventRow>(
    `
      select
        be.id, be.type, be.title, be.amount::text as amount,
        exists(
          select 1 from event_voucher_drafts d where d.business_event_id = be.id
        ) as has_draft
      from business_events be
      where be.company_id = $1
        and to_char(be.occurred_on, 'YYYY-MM') = $2
        and not exists (
          select 1 from vouchers v
          where v.business_event_id = be.id and v.status = 'posted'
        )
      order by be.occurred_on asc, be.id asc
    `,
    [companyId, period]
  );
}

interface GeneratedDraftSummary {
  businessEventId: string;
  draftId: string;
  level: string;
  balanced: boolean;
  lineCount: number;
}

/** 对单个经营事项套用纯核心 buildDraftProposalFromSuggestion，落库草稿 + 分录行。 */
async function insertDraftProposal(
  companyId: string,
  event: EligibleEventRow,
  runId: string
): Promise<GeneratedDraftSummary> {
  const forAccounting: EventForAccounting = {
    id: event.id,
    type: event.type,
    title: event.title,
    amount: event.amount === null ? null : Number(event.amount)
  };
  // 复用纯核心：suggestAccountingEntry 产出会计建议，buildDraftProposalFromSuggestion
  // 套用借贷平衡硬校验 + 自动化分级门。两者都不写库、不入账、无副作用。
  const suggestion = suggestAccountingEntry(forAccounting);
  const proposal = buildDraftProposalFromSuggestion(suggestion);
  const draftId = `close-draft-${event.id}`;
  const now = new Date().toISOString();

  await withTransaction(async (client) => {
    await client.query(
      `insert into event_voucher_drafts (
         id, company_id, business_event_id, voucher_type, status, summary,
         proposal_level, balanced, rationale, source, generated_run_id, created_at
       ) values ($1,$2,$3,$4,'draft',$5,$6,$7,$8,'ai_close',$9,$10::timestamptz)`,
      [draftId, companyId, event.id, suggestion.voucherType, event.title, proposal.level, proposal.balanced, proposal.rationale, runId, now]
    );
    for (const [index, line] of proposal.lines.entries()) {
      await client.query(
        `insert into voucher_draft_lines (
           id, draft_id, summary, account_code, account_name, debit, credit, sort_order
         ) values ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8)`,
        [`${draftId}-line-${index + 1}`, draftId, line.summary, line.accountCode, line.accountName, line.debit, line.credit, index]
      );
    }
  });

  return { businessEventId: event.id, draftId, level: proposal.level, balanced: proposal.balanced, lineCount: proposal.lines.length };
}

/** POST /api/close/drafts/generate — 批量为一个会计期间生成 AI 草稿凭证提案（幂等，跳过已有草稿的事项）。 */
export async function generateCloseDrafts(req: ApiRequest, res: ServerResponse): Promise<void> {
  const companyId = req.auth!.companyId;
  const body = (req.body ?? {}) as { period?: string };
  if (!body.period || !PERIOD_LABEL.test(body.period)) {
    json(res, 400, { error: "period must look like YYYY-MM" });
    return;
  }

  const candidates = await findEligibleEvents(companyId, body.period);
  const toGenerate = candidates.filter((row) => !row.has_draft);
  const skipped = candidates.length - toGenerate.length;
  const runId = `close-gen-${companyId}-${Date.now()}`;

  const drafts: GeneratedDraftSummary[] = [];
  for (const event of toGenerate) {
    drafts.push(await insertDraftProposal(companyId, event, runId));
  }

  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "close.draft.generated",
    resourceType: "close_period",
    resourceId: body.period,
    changes: { generated: drafts.length, skipped, runId }
  });

  json(res, 200, { generated: drafts.length, skipped, drafts });
}

function mapDraftListItem(row: DraftRow, allLines: DraftLineRow[]) {
  const lines: VoucherDraftLine[] = allLines
    .filter((line) => line.draft_id === row.id)
    .map((line) => ({
      id: line.id,
      summary: line.summary,
      accountCode: line.account_code,
      accountName: line.account_name,
      debit: toAmountString(line.debit),
      credit: toAmountString(line.credit)
    }));
  const sumDebitCents = lines.reduce((sum, line) => sum + toCents(line.debit), 0);
  const sumCreditCents = lines.reduce((sum, line) => sum + toCents(line.credit), 0);
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    voucherType: row.voucher_type,
    status: row.status,
    summary: row.summary,
    proposalLevel: row.proposal_level,
    balanced: row.balanced,
    rationale: row.rationale,
    source: row.source,
    generatedRunId: row.generated_run_id,
    approvedVoucherId: row.approved_voucher_id,
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    lines,
    sumDebitCents,
    sumCreditCents
  };
}

/** GET /api/close/drafts?status=draft — 列出草稿（含分录明细 + 借贷汇总），供 inbox 消费。 */
export async function listCloseDrafts(req: ApiRequest, res: ServerResponse): Promise<void> {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const status = url.searchParams.get("status") ?? undefined;

  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (status) {
    params.push(status);
    where += ` and status = $${params.length}`;
  }
  const draftRows = await query<DraftRow>(
    `select ${DRAFT_COLUMNS} from event_voucher_drafts ${where} order by created_at desc`,
    params
  );
  if (!draftRows.length) {
    json(res, 200, { items: [], total: 0 });
    return;
  }
  const draftIds = draftRows.map((row) => row.id);
  const lineRows = await query<DraftLineRow>(
    `select id, draft_id, summary, account_code, account_name, debit, credit, sort_order
     from voucher_draft_lines where draft_id = any($1::text[]) order by sort_order asc`,
    [draftIds]
  );
  const items = draftRows.map((row) => mapDraftListItem(row, lineRows));
  json(res, 200, { items, total: items.length });
}

async function getDraftWithLines(
  companyId: string,
  draftId: string
): Promise<{ draft: DraftRow; lines: DraftLineRow[] } | null> {
  const draft = await queryOne<DraftRow>(
    `select ${DRAFT_COLUMNS} from event_voucher_drafts where id = $1 and company_id = $2`,
    [draftId, companyId]
  );
  if (!draft) return null;
  const lines = await query<DraftLineRow>(
    `select id, draft_id, summary, account_code, account_name, debit, credit, sort_order
     from voucher_draft_lines where draft_id = $1 order by sort_order asc`,
    [draftId]
  );
  return { draft, lines };
}

function decidedStatusLabel(status: string): string {
  return status === "approved" ? "批准" : "驳回";
}

/**
 * 把已通过硬校验的草稿升级为一张 **status='draft'** 的正式 voucher + voucher_lines。
 * 绝不写 'posted'——过账（posted）只能经由既有的 POST /api/vouchers/:id/post 完成。
 */
async function createApprovedVoucher(
  companyId: string,
  draft: DraftRow,
  lines: DraftLineRow[],
  now: string
): Promise<string> {
  const voucherId = `close-voucher-${draft.id}`;
  await withTransaction(async (client) => {
    await client.query(
      `insert into vouchers (
         id, company_id, business_event_id, mapping_id, voucher_type, summary,
         status, source, approved_at, posted_at, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,'draft','analysis',null,null,$7::timestamptz,$7::timestamptz)`,
      [voucherId, companyId, draft.business_event_id, draft.id, draft.voucher_type, draft.summary, now]
    );
    for (const [index, line] of lines.entries()) {
      await client.query(
        `insert into voucher_lines (
           id, voucher_id, summary, account_code, account_name, debit, credit, sort_order
         ) values ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8)`,
        [`${voucherId}-line-${index + 1}`, voucherId, line.summary, line.account_code, line.account_name, line.debit, line.credit, index]
      );
    }
    // H-1 竞态守卫：仅当仍为 draft 时落地。若并发 approve/reject 已改状态，rowCount=0
    // → 抛错使本事务（含上面的 voucher/voucher_lines 插入）整体回滚，不留残凭证。
    const updated = await client.query(
      `update event_voucher_drafts set status = 'approved', approved_voucher_id = $1, decided_at = $2::timestamptz
       where id = $3 and company_id = $4 and status = 'draft'`,
      [voucherId, now, draft.id, companyId]
    );
    if (updated.rowCount === 0) {
      throw new DraftStateConflictError();
    }
  });
  return voucherId;
}

/**
 * POST /api/close/drafts/:id/approve
 *
 * 服务端重新以整数分硬校验借贷平衡（不信任草稿落库时的 balanced 快照）；
 * 平衡则据草稿行创建一张 **status='draft'** 的正式 voucher + voucher_lines，
 * 绝不写 'posted'。真正入账仍必须走 POST /api/vouchers/:id/post。
 */
export async function approveCloseDraft(req: ApiRequest, res: ServerResponse, draftId: string): Promise<void> {
  const companyId = req.auth!.companyId;
  const found = await getDraftWithLines(companyId, draftId);
  if (!found) {
    json(res, 404, { error: "草稿不存在" });
    return;
  }
  const { draft, lines } = found;
  if (draft.status !== "draft") {
    json(res, 409, { error: `草稿已${decidedStatusLabel(draft.status)}，不可重复处理` });
    return;
  }
  if (!lines.length) {
    json(res, 400, { error: "草稿无分录，无法批准" });
    return;
  }

  const sumDebitCents = lines.reduce((sum, line) => sum + toCents(line.debit), 0);
  const sumCreditCents = lines.reduce((sum, line) => sum + toCents(line.credit), 0);
  if (sumDebitCents !== sumCreditCents || sumDebitCents === 0) {
    json(res, 400, { error: "借贷不平衡，拒绝批准", sumDebitCents, sumCreditCents });
    return;
  }

  const now = new Date().toISOString();
  let voucherId: string;
  try {
    voucherId = await createApprovedVoucher(companyId, draft, lines, now);
  } catch (err) {
    if (err instanceof DraftStateConflictError) {
      json(res, 409, { error: "草稿状态已变更，请刷新后重试" });
      return;
    }
    throw err;
  }

  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "close.draft.approved",
    resourceType: "event_voucher_draft",
    resourceId: draftId,
    resourceLabel: draft.summary,
    changes: { voucherId, businessEventId: draft.business_event_id, sumDebitCents, sumCreditCents }
  });

  json(res, 200, { ok: true, voucherId });
}

/** POST /api/close/drafts/:id/reject — 驳回草稿，不生成任何凭证。 */
export async function rejectCloseDraft(req: ApiRequest, res: ServerResponse, draftId: string): Promise<void> {
  const companyId = req.auth!.companyId;
  const body = (req.body ?? {}) as { reason?: string };
  const draft = await queryOne<Pick<DraftRow, "id" | "status" | "summary" | "business_event_id">>(
    `select id, status, summary, business_event_id from event_voucher_drafts where id = $1 and company_id = $2`,
    [draftId, companyId]
  );
  if (!draft) {
    json(res, 404, { error: "草稿不存在" });
    return;
  }
  if (draft.status !== "draft") {
    json(res, 409, { error: `草稿已${decidedStatusLabel(draft.status)}，不可重复处理` });
    return;
  }

  const now = new Date().toISOString();
  // H-1 竞态守卫：仅当仍为 draft 时驳回（条件更新 + RETURNING）；并发已处理则 409，
  // 不无条件覆盖（避免把并发 approved 的草稿错误改回 rejected）。
  const updated = await query<{ id: string }>(
    `update event_voucher_drafts set status = 'rejected', decided_at = $1::timestamptz
     where id = $2 and company_id = $3 and status = 'draft' returning id`,
    [now, draftId, companyId]
  );
  if (updated.length === 0) {
    json(res, 409, { error: "草稿状态已变更，请刷新后重试" });
    return;
  }

  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "close.draft.rejected",
    resourceType: "event_voucher_draft",
    resourceId: draftId,
    resourceLabel: draft.summary,
    changes: { reason: body.reason ?? null, businessEventId: draft.business_event_id }
  });

  json(res, 200, { ok: true });
}
