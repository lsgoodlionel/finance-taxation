import type { ServerResponse } from "node:http";
import type {
  LedgerEntry,
  LedgerPostingBatch,
  Voucher,
  VoucherDraftLine,
  VoucherPostingRecord
} from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { toDateOnly } from "../../db/date-column.js";
import { json } from "../../utils/http.js";
import {
  buildVoucherTemplateDraft,
  listVoucherTemplates
} from "./templates.js";
import { writeAudit } from "../../services/audit.js";
import { notify } from "../notifications/dispatch.js";
import { buildVoucherApprovalNotification } from "../notifications/events.js";
import { isPeriodLocked } from "../ledger/routes.js";
import { validateWorkflowAuthorization } from "../workflows/authorization.js";
import { buildWorkflowCommandExecution, buildWorkflowRun, markWorkflowCommandStatus } from "../workflows/commands.js";
import {
  ensureWorkflowRun,
  findSuccessfulWorkflowCommandExecution,
  insertWorkflowCommandExecution,
  insertWorkflowTransition,
  updateWorkflowCommandExecution,
  updateWorkflowRunState
} from "../workflows/persistence.js";
import {
  buildWorkflowTransitionRecord,
  mapVoucherStatusToWorkflowState,
  validateWorkflowTransition
} from "../workflows/runtime.js";
import { buildReversalLines, canReverseVoucher } from "./reversal.js";
import { formatVoucherNumber, resolveVoucherWord, type VoucherWord } from "./voucher-number.js";
import { insertLedgerEntries } from "./ledger-writer.js";
import { SETTLEABLE_TYPE_CODES } from "../settlement/settleable-accounts.js";
import { isCostCenterApplicable } from "../cost-center/cost-center.js";
import { checkAccountsUsable } from "../accounts/account-guard.js";
import { BASE_CURRENCY, RATE_SCALE } from "../currency/revaluation.js";
import { resolveClosingRate } from "../currency/revaluation-store.js";
import { allocateForeignAmounts, foreignToBaseCents } from "../currency/foreign-allocation.js";
import { toCents } from "../../utils/money.js";

interface VoucherRow {
  id: string;
  company_id: string;
  business_event_id: string;
  mapping_id: string;
  voucher_type: Voucher["voucherType"];
  summary: string;
  status: Voucher["status"];
  source: Voucher["source"];
  accounting_date: string | Date;
  voucher_word: string | null;
  voucher_seq: number | null;
  period: string | null;
  approved_at: string | Date | null;
  posted_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface VoucherLineRow {
  id: string;
  voucher_id: string;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  sort_order: number;
  counterparty_id: string | null;
  cost_center_id: string | null;
  currency: string | null;
  original_amount: string | number | null;
  exchange_rate: string | number | null;
}

interface VoucherPostingRecordRow {
  id: string;
  company_id: string;
  voucher_id: string;
  business_event_id: string;
  posted_by_user_id: string | null;
  posted_by_name: string;
  posted_at: string | Date;
}

interface LedgerEntryRow {
  id: string;
  company_id: string;
  voucher_id: string;
  business_event_id: string;
  entry_date: string | Date;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  source: LedgerEntry["source"];
  posted_at: string | Date;
  /** 来自 accounts 表的 left join；分录指向一个已不存在的科目时为 null。 */
  account_category?: LedgerEntry["accountCategory"];
}

interface LedgerPostingBatchRow {
  id: string;
  company_id: string;
  voucher_id: string;
  business_event_id: string;
  posted_at: string | Date;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAmountString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0.00";
  return typeof value === "number" ? value.toFixed(2) : String(value);
}

/**
 * 把业务事件上的往来单位贴到凭证行（V12-C2）。
 *
 * 只贴往来科目 —— 判据是 `account_type` 落在 SETTLEABLE_TYPE_CODES 里，
 * 而不是科目码前缀。**就地修改传入的行**：这些行是本函数调用方刚刚构造出来
 * 的、尚未落库的临时对象，此处改它不会影响任何别处持有的状态。
 */
async function attachCounterparty(
  companyId: string,
  lines: { accountCode: string; counterpartyId?: string | null }[],
  counterpartyId: string | null
): Promise<void> {
  if (!counterpartyId || lines.length === 0) return;
  const codes = [...new Set(lines.map((line) => line.accountCode))];
  const rows = await query<{ code: string }>(
    `select code from accounts
     where company_id = $1 and code = any($2::text[]) and account_type = any($3::text[])`,
    [companyId, codes, [...SETTLEABLE_TYPE_CODES]]
  );
  const settleable = new Set(rows.map((row) => row.code));
  for (const line of lines) {
    if (settleable.has(line.accountCode)) {
      line.counterpartyId = counterpartyId;
    }
  }
}

/**
 * 把成本中心贴到凭证行（V12-D1 的最后一环）。
 *
 * D1 建了成本中心主数据、加了 `ledger_entries.cost_center_id`、做了部门费用报表，
 * **但没有任何地方给这一列赋值**——于是报表里所有金额都落在「未指定」一行，
 * 整张报表实际不可用。这里补上写入侧。
 *
 * 与 {@link attachCounterparty} 同构：一个值 + 按科目性质判定该贴给哪些行。
 * 判据是 `isCostCenterApplicable`（费用类，且排除所得税这类公司级科目），
 * 而不是科目码前缀。
 *
 * **只贴适用的行，不强制**：一张凭证里银行存款、应交税费那几行不属于任何部门，
 * 贴上去只会让部门费用凭空多出一笔。而适用行漏贴的后果是落进「未指定」分组，
 * 由报表显式列示——不在写入端拦人，因为记不上账比少一个维度严重得多。
 */
async function attachCostCenter(
  companyId: string,
  lines: { accountCode: string; costCenterId?: string | null }[],
  costCenterId: string | null
): Promise<void> {
  if (!costCenterId || lines.length === 0) return;
  const codes = [...new Set(lines.map((line) => line.accountCode))];
  const rows = await query<{ code: string; category: string; account_type: string }>(
    `select code, category, account_type from accounts
     where company_id = $1 and code = any($2::text[])`,
    [companyId, codes]
  );
  const applicable = new Set(
    rows
      .filter((row) =>
        isCostCenterApplicable({
          code: row.code,
          category: row.category,
          accountType: row.account_type
        })
      )
      .map((row) => row.code)
  );
  for (const line of lines) {
    if (applicable.has(line.accountCode)) {
      line.costCenterId = costCenterId;
    }
  }
}

function mapVoucherLineRow(row: VoucherLineRow): VoucherDraftLine {
  return {
    id: row.id,
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: toAmountString(row.debit),
    credit: toAmountString(row.credit),
    counterpartyId: row.counterparty_id,
    costCenterId: row.cost_center_id,
    // `?? null` 不是多余的：这三列若没进 select 就是 `undefined`，而 `=== null`
    // 判不出 undefined，`Number(undefined)` 得到 NaN，进库时报
    // `invalid input syntax for type bigint: "NaN"`（初版就是这么挂的，
    // 一次挂掉 6 条凭证集成用例）。
    currency: row.currency ?? null,
    originalAmount: row.original_amount == null ? null : toAmountString(row.original_amount),
    exchangeRate: row.exchange_rate == null ? null : Number(row.exchange_rate)
  };
}

function mapVoucherRow(row: VoucherRow, lines: VoucherLineRow[]): Voucher {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    mappingId: row.mapping_id,
    voucherType: row.voucher_type,
    summary: row.summary,
    status: row.status,
    lines: lines
      .filter((line) => line.voucher_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapVoucherLineRow),
    accountingDate: toDateOnly(row.accounting_date) ?? "",
    // 三者齐备才成号：草稿没有 voucher_seq，此时如实给 null 而不是拼一个假号出来
    voucherNumber:
      row.voucher_word && row.period && row.voucher_seq !== null
        ? formatVoucherNumber(row.voucher_word as VoucherWord, row.period, row.voucher_seq)
        : null,
    approvedAt: toIsoString(row.approved_at),
    postedAt: toIsoString(row.posted_at),
    source: row.source,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapVoucherPostingRecordRow(row: VoucherPostingRecordRow): VoucherPostingRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    postedByUserId: row.posted_by_user_id,
    postedByName: row.posted_by_name,
    postedAt: toIsoString(row.posted_at) || new Date().toISOString()
  };
}

function mapLedgerEntryRow(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    // entry_date 是 PG `date`（无时区的日历日期），必须走 toDateOnly 而不是
    // ISO 时间戳往返——后者在 UTC+ 时区会把每月 1 号前移到上一期。
    entryDate: toDateOnly(row.entry_date) ?? "",
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: toAmountString(row.debit),
    credit: toAmountString(row.credit),
    source: row.source,
    postedAt: toIsoString(row.posted_at) || new Date().toISOString(),
    accountCategory: row.account_category ?? null
  };
}

export async function listCompanyVouchers(
  companyId: string,
  options: { businessEventId?: string; voucherId?: string } = {}
): Promise<Voucher[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (options.businessEventId) {
    params.push(options.businessEventId);
    where += ` and business_event_id = $${params.length}`;
  }
  if (options.voucherId) {
    params.push(options.voucherId);
    where += ` and id = $${params.length}`;
  }
  const voucherRows = await query<VoucherRow>(
    `
      select
        id, company_id, business_event_id, mapping_id, voucher_type, summary, status,
        source, accounting_date, voucher_word, voucher_seq, period,
        approved_at, posted_at, created_at, updated_at
      from vouchers
      ${where}
      -- 按工作流顺序排：待处理的排前面，已过账的沉底。
      --
      -- 这里曾有 'validated' / 'approved' 两个分支，是早期状态机的遗留 —— 它们
      -- 不在 VoucherStatus（draft|review_required|posted）里，迁移 072 给这一列
      -- 加了 CHECK 之后更不可能出现。留着只会让下一个读代码的人以为状态机有五档。
      --
      -- ELSE 保留：CHECK 挡的是新写入，而 order by 对任何取值都得有个确定去向。
      order by
        CASE status WHEN 'draft' THEN 1 WHEN 'review_required' THEN 2 WHEN 'posted' THEN 3 ELSE 4 END,
        created_at desc
    `,
    params
  );
  if (!voucherRows.length) {
    return [];
  }
  const voucherIds = voucherRows.map((row) => row.id);
  const lineRows = await query<VoucherLineRow>(
    `
      select
        id, voucher_id, summary, account_code, account_name, debit, credit, sort_order,
        counterparty_id, cost_center_id, currency, original_amount, exchange_rate
      from voucher_lines
      where voucher_id = any($1::text[])
      order by sort_order asc
    `,
    [voucherIds]
  );
  return voucherRows.map((row) => mapVoucherRow(row, lineRows));
}

export async function listCompanyVoucherPostingRecords(
  companyId: string,
  voucherId?: string
): Promise<VoucherPostingRecord[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (voucherId) {
    params.push(voucherId);
    where += ` and voucher_id = $${params.length}`;
  }
  const rows = await query<VoucherPostingRecordRow>(
    `
      select
        id, company_id, voucher_id, business_event_id, posted_by_user_id, posted_by_name, posted_at
      from voucher_posting_records
      ${where}
      order by posted_at desc
    `,
    params
  );
  return rows.map(mapVoucherPostingRecordRow);
}

export interface ListLedgerEntriesOptions {
  voucherId?: string;
  businessEventId?: string;
  /** 会计日期下界（含），`YYYY-MM-DD`。省略即不设下界。 */
  dateFrom?: string;
  /** 会计日期上界（含），`YYYY-MM-DD`。省略即不设上界。 */
  dateTo?: string;
}

/**
 * 总账分录读取。
 *
 * `dateFrom` / `dateTo` 按 `entry_date`（会计日期，非过账时间 `posted_at`）过滤，
 * 且**下推到 SQL**。加这两个参数是因为此前多个调用方（利润表、现金流量表、
 * 资产负债表、驾驶舱）都是先把公司全部历史分录拉进 Node 内存、再 `.filter()`
 * 按日期筛——分录上万条后每次请求都要全表扫一遍并在堆上物化，是确定的性能悬崖。
 *
 * 两个参数都是可选的：不传时 SQL、排序与返回值与加参数之前**完全一致**，
 * 既有调用方（凭证详情、税务、风险）无需改动。对应断言见
 * reports/trial-balance.integration.test.ts 的「不传参行为不变」一组。
 */
export async function listCompanyLedgerEntries(
  companyId: string,
  options: ListLedgerEntriesOptions = {}
): Promise<LedgerEntry[]> {
  const params: unknown[] = [companyId];
  // 列名一律带 `e.` 前缀：查询 left join 了 accounts，裸列名会歧义。
  let where = "where e.company_id = $1";
  if (options.voucherId) {
    params.push(options.voucherId);
    where += ` and e.voucher_id = $${params.length}`;
  }
  if (options.businessEventId) {
    params.push(options.businessEventId);
    where += ` and e.business_event_id = $${params.length}`;
  }
  if (options.dateFrom) {
    params.push(options.dateFrom);
    where += ` and e.entry_date >= $${params.length}::date`;
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    where += ` and e.entry_date <= $${params.length}::date`;
  }
  const rows = await query<LedgerEntryRow>(
    `
      select
        e.id, e.company_id, e.voucher_id, e.business_event_id, e.entry_date, e.summary,
        e.account_code, e.account_name, e.debit, e.credit, e.source, e.posted_at,
        a.category as account_category
      from ledger_entries e
      -- 科目的报表口径随分录一起取出（V12 残留 7）。此前报表侧读的是硬编码的
      -- chart-of-accounts.ts，而 049 早把科目表落了库 —— 两份数据靠 chart-parity
      -- 护栏防漂移，但报表实际读的始终是常量那份。
      --
      -- left join 而不是 join：分录指向一个已不存在的科目（脏数据）时不能让它
      -- 从账簿上消失，那会比分类错更难查。取不到 category 的走前缀兜底。
      -- (company_id, code) 上有唯一索引，join 不构成额外开销。
      left join accounts a on a.company_id = e.company_id and a.code = e.account_code
      ${where}
      order by e.posted_at desc, e.id asc
    `,
    params
  );
  return rows.map(mapLedgerEntryRow);
}

export async function listCompanyLedgerPostingBatches(
  companyId: string,
  voucherId?: string
): Promise<LedgerPostingBatch[]> {
  const params: unknown[] = [companyId];
  let where = "where b.company_id = $1";
  if (voucherId) {
    params.push(voucherId);
    where += ` and b.voucher_id = $${params.length}`;
  }
  const batchRows = await query<LedgerPostingBatchRow>(
    `
      select b.id, b.company_id, b.voucher_id, b.business_event_id, b.posted_at
      from ledger_posting_batches b
      ${where}
      order by b.posted_at desc
    `,
    params
  );
  if (!batchRows.length) {
    return [];
  }
  const batchIds = batchRows.map((row) => row.id);
  const entryLinks = await query<{ batch_id: string; entry_id: string }>(
    `
      select batch_id, entry_id
      from ledger_posting_batch_entries
      where batch_id = any($1::text[])
    `,
    [batchIds]
  );
  return batchRows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    entryIds: entryLinks.filter((item) => item.batch_id === row.id).map((item) => item.entry_id),
    postedAt: toIsoString(row.posted_at) || new Date().toISOString()
  }));
}

async function getVoucherForCompany(companyId: string, voucherId: string): Promise<Voucher | null> {
  const rows = await listCompanyVouchers(companyId, { voucherId });
  return rows[0] ?? null;
}

/**
 * 取这张凭证的审核人，供过账时校验「复核人 ≠ 过账人」。
 *
 * 单独查而不并进 Voucher：审核人只服务于服务端的职责分离判定，不需要进
 * domain-model 的对外契约，也就不会牵动前端类型。
 * 返回 null 表示迁移 043 之前审核的历史凭证（无记录），由调用方决定如何放行。
 */
async function getVoucherApproverUserId(companyId: string, voucherId: string): Promise<string | null> {
  const row = await queryOne<{ approved_by_user_id: string | null }>(
    `select approved_by_user_id from vouchers where id = $1 and company_id = $2`,
    [voucherId, companyId]
  );
  return row?.approved_by_user_id ?? null;
}

export async function listVouchers(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId") || undefined;
  const rows = await listCompanyVouchers(req.auth!.companyId, { businessEventId: eventId });
  return json(res, 200, { items: rows, total: rows.length });
}

export async function getVoucherTemplates(_req: ApiRequest, res: ServerResponse) {
  return json(res, 200, {
    items: listVoucherTemplates().map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description,
      voucherType: item.voucherType
    })),
    total: listVoucherTemplates().length
  });
}

export async function createVoucherFromTemplate(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as {
    templateKey?: string;
    amount?: string;
    summary?: string;
    businessEventId?: string;
    /**
     * 外币业务（V12-D5）。填了 currency 就按业务发生日的汇率折算：
     * `amount` 被当作**原币**金额，模板拿到的是折算后的本位币金额。
     *
     * 不填则一切照旧走本位币，既有调用方零感知。
     */
    currency?: string;
    /**
     * 成本中心（V12-D1）。填了就贴给凭证里适用的费用行，不填则那些行落进
     * 部门费用报表的「未指定」分组。
     */
    costCenterId?: string;
  };
  if (!body.templateKey || !body.amount || !body.businessEventId) {
    return json(res, 400, { error: "templateKey, amount and businessEventId are required" });
  }

  // 一并取业务发生日：它是这张凭证的会计日期来源，决定账记在哪个期间。
  // 一并取往来单位：事件上早就记了它（business_events.counterparty_id），
  // 凭证由事件生成，理应继承，而不是让用户在凭证上再填一次同一个客户。
  const event = await queryOne<{ id: string; occurred_on: string | Date; counterparty_id: string | null }>(
    `
      select id, occurred_on, counterparty_id
      from business_events
      where id = $1 and company_id = $2
    `,
    [body.businessEventId, req.auth!.companyId]
  );
  if (!event) {
    return json(res, 404, { error: "Business event not found" });
  }

  // ── 外币折算（V12-D5）────────────────────────────────────────────
  //
  // 汇率取**业务发生日**或之前最近一天，而不是「今天」：一张 3 月的凭证在 6 月补录，
  // 该用的是 3 月的汇率。这与调汇取「资产负债表日或之前最近一天」是同一个原则。
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const isForeign = currency !== "" && currency !== BASE_CURRENCY;
  let exchangeRate = RATE_SCALE;
  let foreignTotalCents = 0;

  if (isForeign) {
    const eventDate = toDateOnly(event.occurred_on) ?? new Date().toISOString().slice(0, 10);
    const resolved = await withTransaction((client) =>
      resolveClosingRate(client, req.auth!.companyId, currency, eventDate)
    );
    if (resolved === null) {
      return json(res, 400, {
        error: `缺少 ${currency} 在 ${eventDate} 或之前的汇率，请先在总账「做期末外币调汇」里维护汇率。`,
        code: "EXCHANGE_RATE_MISSING"
      });
    }
    exchangeRate = resolved;
    foreignTotalCents = toCents(body.amount);
    if (!Number.isFinite(foreignTotalCents) || foreignTotalCents <= 0) {
      return json(res, 400, { error: "外币金额必须大于 0", code: "AMOUNT_INVALID" });
    }
  }

  // 模板拿到的始终是**本位币**金额：模板体系与科目口径都按本位币设计，
  // 让它感知币种会把外币逻辑扩散到每一个模板里。
  const templateAmount = isForeign
    ? (foreignToBaseCents(foreignTotalCents, exchangeRate) / 100).toFixed(2)
    : body.amount;

  let draft;
  try {
    draft = buildVoucherTemplateDraft({
      templateKey: body.templateKey,
      amount: templateAmount,
      summary: body.summary,
      businessEventId: body.businessEventId,
      companyId: req.auth!.companyId
    });
  } catch (error) {
    return json(res, 400, { error: (error as Error).message });
  }

  // 外币时把原币总额按各行本位币比例分摊（末行扫尾），保证借贷两侧的原币之和都
  // 严格等于用户输入的那个数——外币余额是逐行累加出来的，差出去的分会一直留在
  // 账上，期末调汇时被当成汇率变动算进汇兑损益。
  const foreignPerLine = isForeign
    ? allocateForeignAmounts(
        draft.lines.map((line) => ({
          debitCents: toCents(line.debit),
          creditCents: toCents(line.credit)
        })),
        foreignTotalCents,
        exchangeRate
      )
    : [];

  const now = new Date().toISOString();
  const mappingId = `tpl-draft-${Date.now()}`;
  const voucherId = `tpl-voucher-${Date.now()}`;
  const voucher: Voucher = {
    id: voucherId,
    companyId: req.auth!.companyId,
    businessEventId: draft.businessEventId,
    mappingId,
    voucherType: draft.voucherType,
    summary: draft.summary,
    status: "draft",
    // 会计日期取业务发生日，不是「今天」——这笔账属于业务发生的那个期间。
    accountingDate: toDateOnly(event.occurred_on) ?? now.slice(0, 10),
    voucherNumber: null,
    lines: draft.lines.map((line, index) => ({
      ...line,
      id: `${voucherId}-line-${index + 1}`,
      // 原币在这里就贴上，而不是等到写库时再算一遍：响应对象与落库内容必须同源，
      // 否则前端拿到的凭证和库里的对不上，而这种不一致要等到下次读取才暴露。
      currency: isForeign ? currency : BASE_CURRENCY,
      originalAmount: isForeign ? (foreignPerLine[index]! / 100).toFixed(2) : null,
      exchangeRate: isForeign ? exchangeRate : null
    })),
    approvedAt: null,
    postedAt: null,
    source: "analysis",
    createdAt: now,
    updatedAt: now
  };

  // 科目闸门：分录只能挂在这家公司真实存在的叶子科目上。此前三个写入函数
  // 一次都没校验过科目码，任何客户端调 POST /api/vouchers 都能写进任意字符串
  // 并过账 —— 迁移 041/042 就是这个洞造成的两次线上错账的事后补救。
  const templateAccounts = await checkAccountsUsable(req.auth!.companyId, voucher.lines);
  if (!templateAccounts.ok) {
    return json(res, 400, { error: templateAccounts.message, code: templateAccounts.code });
  }

  // 往来维度只贴到往来科目的行上（V12-C2）。给每一行都贴会让"银行存款-甲客户"
  // 这种无意义的组合进总账；判据用 account_type 而非科目码，D3 换编码时不用改这里。
  await attachCounterparty(req.auth!.companyId, voucher.lines, event.counterparty_id);
  // 成本中心由用户在创建时指定（V12-D1）。与往来单位不同，它不能从业务事项推断：
  // D1 刻意没有复用 departments 表——组织架构会变而核算口径要稳定，两者是两个概念。
  await attachCostCenter(
    req.auth!.companyId,
    voucher.lines,
    typeof body.costCenterId === "string" && body.costCenterId ? body.costCenterId : null
  );

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into event_voucher_drafts (
          id,
          company_id,
          business_event_id,
          voucher_type,
          status,
          summary,
          created_at
        ) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      `,
      [
        mappingId,
        voucher.companyId,
        voucher.businessEventId,
        voucher.voucherType,
        "draft",
        voucher.summary,
        now
      ]
    );

    for (const [index, line] of voucher.lines.entries()) {
      await client.query(
        `
          insert into voucher_draft_lines (
            id,
            draft_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order,
            currency,
            original_amount,
            exchange_rate
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10::numeric, $11)
        `,
        [
          `${mappingId}-line-${index + 1}`,
          mappingId,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index,
          line.currency ?? BASE_CURRENCY,
          line.originalAmount ?? null,
          line.exchangeRate ?? null
        ]
      );
    }

    await client.query(
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
        voucher.id,
        voucher.companyId,
        voucher.businessEventId,
        voucher.mappingId,
        voucher.voucherType,
        voucher.summary,
        voucher.status,
        voucher.source,
        voucher.approvedAt,
        voucher.postedAt,
        voucher.createdAt,
        voucher.updatedAt
      ]
    );

    for (const [index, line] of voucher.lines.entries()) {
      await client.query(
        `
          insert into voucher_lines (
            id,
            voucher_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order,
            counterparty_id,
            cost_center_id,
            currency,
            original_amount,
            exchange_rate
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10, $11, $12::numeric, $13)
        `,
        [
          line.id,
          voucher.id,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index,
          line.counterpartyId ?? null,
          line.costCenterId ?? null,
          line.currency ?? BASE_CURRENCY,
          line.originalAmount ?? null,
          line.exchangeRate ?? null
        ]
      );
    }
  });

  return json(res, 201, voucher);
}

/**
 * 红冲：为已过账凭证生成一张借贷相反的冲销凭证。
 *
 * 这是已过账凭证唯一合法的更正出口。此前 `POST /api/events/:id/analyze` 会连同
 * 已过账凭证与其总账分录一起硬删（无留痕），该路径已被闸门堵成 409；但堵死之后
 * 系统没有任何更正入口，已过账事项就此进入死路 —— 本接口就是那个出口。
 *
 * 红冲凭证以 `draft` 落库，与普通凭证走完全相同的审核 → 过账流程：它同样是一笔
 * 真实账务，没有理由绕开职责分离。**刻意不自动过账**。
 */
export async function reverseVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }

  const meta = await queryOne<{ reverses_voucher_id: string | null; reversed_by: string | null }>(
    `
      select
        v.reverses_voucher_id,
        (
          select r.id from vouchers r
          where r.company_id = v.company_id and r.reverses_voucher_id = v.id
          limit 1
        ) as reversed_by
      from vouchers v
      where v.id = $1 and v.company_id = $2
    `,
    [voucherId, req.auth!.companyId]
  );
  const verdict = canReverseVoucher({
    status: target.status,
    postedAt: target.postedAt,
    reversesVoucherId: meta?.reverses_voucher_id ?? null,
    alreadyReversed: Boolean(meta?.reversed_by)
  });
  if (!verdict.ok) {
    return json(res, 409, { error: verdict.message, code: verdict.errorCode });
  }

  // 原凭证所在期间已锁账时不得再动它的账 —— 与过账同一条铁律。
  // 期间取原凭证总账分录的实际 entry_date，而不是"当前月"：跨月红冲用当前月判定
  // 会直接绕过对原期间的锁。
  const lockedPeriod = await queryOne<{ period: string }>(
    `
      select distinct to_char(le.entry_date, 'YYYY-MM') as period
      from ledger_entries le
      join accounting_periods ap
        on ap.company_id = le.company_id and ap.period = to_char(le.entry_date, 'YYYY-MM')
      where le.company_id = $1 and le.voucher_id = $2 and ap.is_locked
      limit 1
    `,
    [req.auth!.companyId, voucherId]
  );
  if (lockedPeriod) {
    return json(res, 409, {
      error: `原凭证所属会计期间 ${lockedPeriod.period} 已锁账，无法红冲。请先解锁该期间。`,
      code: "VOUCHER_PERIOD_LOCKED"
    });
  }

  const now = new Date().toISOString();
  const reversalId = `vch-rev-${voucherId}-${Date.now()}`;
  const reversalLines = buildReversalLines(target.lines);

  // 红冲沿用原凭证的科目，但原科目可能在这期间被停用了 —— 那样红冲凭证要等到
  // 过账时才失败，不如在生成这一步就说清楚。
  const reversalAccounts = await checkAccountsUsable(req.auth!.companyId, reversalLines);
  if (!reversalAccounts.ok) {
    return json(res, 400, { error: reversalAccounts.message, code: reversalAccounts.code });
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into vouchers (
          id, company_id, business_event_id, mapping_id, voucher_type, summary,
          status, source, reverses_voucher_id, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, 'draft', 'reversal', $7, $8::timestamptz, $8::timestamptz)
      `,
      [
        reversalId,
        target.companyId,
        target.businessEventId,
        target.mappingId,
        target.voucherType,
        `红冲：${target.summary}`,
        voucherId,
        now
      ]
    );
    for (const [index, line] of reversalLines.entries()) {
      await client.query(
        `
          insert into voucher_lines (
            id, voucher_id, summary, account_code, account_name, debit, credit, sort_order
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)
        `,
        [
          `${reversalId}-${index + 1}`,
          reversalId,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index
        ]
      );
    }
  });

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "reverse",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: target.summary,
    changes: { data: { reversalVoucherId: reversalId, lineCount: reversalLines.length } }
  });

  const created = await getVoucherForCompany(req.auth!.companyId, reversalId);
  return json(res, 201, created);
}

export async function getVoucherDetail(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const postingRecords = await listCompanyVoucherPostingRecords(req.auth!.companyId, target.id);
  return json(res, 200, {
    ...target,
    postingRecords
  });
}

export async function updateVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const body = (req.body || {}) as Partial<Voucher>;

  // 已入账凭证不得原地改写 —— 会计上只允许红冲。此前这里对 status/summary 一律
  // 照单全收，实机可把一张已过账凭证改回 draft 并改掉摘要，而它的总账分录仍留在
  // 账上；退回 draft 后再走一次过账，要么主键冲突报 500，要么重复记账。
  if (target.postedAt || target.status === "posted") {
    return json(res, 409, {
      error: "凭证已过账，不能修改。如需更正请使用红冲（POST /api/vouchers/:id/reverse）。",
      code: "VOUCHER_ALREADY_POSTED"
    });
  }

  const nextStatus = body.status ?? target.status;
  if (nextStatus !== target.status) {
    // 状态推进只能走各自的专用接口：approve 附带状态机校验并记录审核人，
    // post 附带借贷校验、职责分离、期间锁并生成总账分录。
    // 从这里改状态会跳过全部这些，最坏的情况是凭证显示已过账而账上根本没有分录。
    if (nextStatus === "posted") {
      return json(res, 400, {
        error: "不能直接把凭证改成已过账。过账请调用 POST /api/vouchers/:id/post，它才会生成总账分录。",
        code: "VOUCHER_STATUS_NOT_UPDATABLE"
      });
    }
    const validation = validateWorkflowTransition(
      mapVoucherStatusToWorkflowState(target.status),
      mapVoucherStatusToWorkflowState(nextStatus)
    );
    if (!validation.ok) {
      return json(res, 400, { error: validation.message, code: validation.errorCode });
    }
  }

  const updatedAt = new Date().toISOString();
  await queryOne(
    `
      update vouchers
      set
        status = $1,
        summary = $2,
        updated_at = $3::timestamptz
      where id = $4 and company_id = $5
      returning id
    `,
    [nextStatus, body.summary ?? target.summary, updatedAt, voucherId, req.auth!.companyId]
  );
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "update",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: target.summary,
    changes: {
      before: { status: target.status, summary: target.summary },
      after: { status: nextStatus, summary: body.summary ?? target.summary }
    }
  });
  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  return json(res, 200, updated);
}

export async function validateVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const debit = target.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = target.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const issues: string[] = [];
  if (!target.lines.length) {
    issues.push("凭证分录为空");
  }
  if (Math.abs(debit - credit) > 0.0001) {
    issues.push(`借贷不平，借方 ${debit.toFixed(2)}，贷方 ${credit.toFixed(2)}`);
  }
  if (target.lines.some((line) => !line.accountCode || !line.accountName)) {
    issues.push("存在未填写完整科目的分录");
  }
  return json(res, 200, {
    id: target.id,
    valid: issues.length === 0,
    totals: {
      debit: debit.toFixed(2),
      credit: credit.toFixed(2)
    },
    issues
  });
}

export async function approveVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const now = new Date().toISOString();
  const previousState = mapVoucherStatusToWorkflowState(target.status);
  const nextState = mapVoucherStatusToWorkflowState("review_required");
  const transitionValidation = validateWorkflowTransition(previousState, nextState);
  if (!transitionValidation.ok) {
    return json(res, 400, { error: transitionValidation.message, code: transitionValidation.errorCode });
  }
  await withTransaction(async (client) => {
    await client.query(
      `
        update vouchers
        set
          status = 'review_required',
          approved_at = $1::timestamptz,
          approved_by_user_id = $4,
          updated_at = $1::timestamptz
        where id = $2 and company_id = $3
      `,
      [now, voucherId, req.auth!.companyId, req.auth!.userId]
    );
    const run = await ensureWorkflowRun(
      client,
      buildWorkflowRun({
        companyId: req.auth!.companyId,
        workflowKey: "voucher.lifecycle",
        resourceType: "voucher",
        resourceId: voucherId,
        resourceLabel: target.summary,
        currentState: previousState,
        initiatorUserId: req.auth!.userId,
        initiatorName: req.auth!.username
      })
    );
    const transition = buildWorkflowTransitionRecord({
      companyId: req.auth!.companyId,
      workflowRunId: run.id,
      resourceType: "voucher",
      resourceId: voucherId,
      previousState,
      nextState,
      actorUserId: req.auth!.userId,
      actorName: req.auth!.username,
      basis: "voucher.approve",
      ruleVersion: "v4-1a"
    });
    await insertWorkflowTransition(client, transition);
    await updateWorkflowRunState(client, run.id, nextState, null, transition.occurredAt);
  });
  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "approve",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: target.summary,
    changes: { before: { status: target.status }, after: { status: "review_required" } }
  });
  // 送审即发即忘通知复核人；过账是本次审批的结果，不再重复推送。
  notify(
    buildVoucherApprovalNotification({
      companyId: req.auth!.companyId,
      voucherId,
      summary: target.summary,
      submittedBy: req.auth!.username,
      businessEventId: target.businessEventId ?? null
    })
  );
  return json(res, 200, updated);
}

export async function postVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  if (target.postedAt) {
    const [postingRecords, ledgerEntries, ledgerPostingBatches] = await Promise.all([
      listCompanyVoucherPostingRecords(req.auth!.companyId, target.id),
      listCompanyLedgerEntries(req.auth!.companyId, { voucherId: target.id }),
      listCompanyLedgerPostingBatches(req.auth!.companyId, target.id)
    ]);
    return json(res, 200, {
      ...target,
      postingRecords,
      ledgerEntries,
      ledgerPostingBatches
    });
  }

  const debit = target.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = target.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.abs(debit - credit) > 0.0001) {
    return json(res, 400, { error: "Voucher is not balanced" });
  }
  if (!target.approvedAt) {
    return json(res, 400, { error: "Voucher must be approved before posting" });
  }
  const body = (req.body || {}) as { authorizerUserId?: string; authorizerName?: string };
  // 终审人不默认当前用户：过账是高风险动作，规则要求终审人与执行人不同。
  // 默认成自己只会撞「执行人 == 终审人」冲突，报出的还是含糊的 DUTY_CONFLICT；
  // 留空则命中 WORKFLOW_AUTHORIZATION_REQUIRED，明确告诉调用方缺终审人。
  // 校验会保证到达后续流程时 authorizerUserId 必有值，故 name 直接跟随入参。
  const authorizerUserId = body.authorizerUserId;
  const authorizerName = body.authorizerName;

  // 复核人必须取自「谁审核的这张凭证」，不能拿当前用户顶替 —— 早前两个角色都填
  // req.auth.userId，而职责分离规则判定「复核人 == 过账人」即冲突，导致本接口对
  // 任何调用恒返回 400，过账功能实际不可用。
  // 迁移 043 之前审核的凭证没有审核人记录（NULL），此时跳过该项校验，否则存量凭证
  // 永远过不了账；终审人要求与审计留痕不受影响。
  const reviewerUserId = await getVoucherApproverUserId(req.auth!.companyId, voucherId);
  const authCheck = validateWorkflowAuthorization({
    action: "voucher.post",
    reviewerUserId: reviewerUserId ?? undefined,
    posterUserId: req.auth!.userId,
    executorUserId: req.auth!.userId,
    authorizerUserId
  });
  if (!authCheck.ok) {
    return json(res, 400, { error: authCheck.message, code: authCheck.errorCode });
  }
  const previousState = mapVoucherStatusToWorkflowState(target.status);
  const nextState = mapVoucherStatusToWorkflowState("posted");
  // 过账在状态机上是「开始执行 → 执行完成」两步。通用转移表刻意不允许 under_review
  // 一步跳到 completed（审核态不能直达终态），而凭证只有 draft/review_required/posted
  // 三个状态，审核后必然是 under_review —— 此前这里只校验 under_review -> completed，
  // 于是所有审核过的凭证 100% 被判 WORKFLOW_INVALID_TRANSITION，这是过账失效的第二道闸。
  // 拆成两步既贴合语义（过账就是执行动作），也让审计留下「执行中」的痕迹，
  // 且不必为凭证放宽一张对所有资源类型生效的通用转移表。
  const executingState = "executing" as const;
  for (const [from, to] of [
    [previousState, executingState],
    [executingState, nextState]
  ] as const) {
    const transitionValidation = validateWorkflowTransition(from, to);
    if (!transitionValidation.ok) {
      return json(res, 400, { error: transitionValidation.message, code: transitionValidation.errorCode });
    }
  }

  // postedAt 只是「什么时候点的过账按钮」，accountingDate 才是「这笔账归属哪个期间」。
  // 两者必须分开：6 月的业务 7 月过账，账要记在 6 月；期间锁也要按 6 月判，
  // 否则锁了 6 月仍能在 7 月补记 6 月的凭证（此前正是如此）。
  const postedAt = new Date().toISOString();
  const accountingDate = target.accountingDate;
  const voucherPeriod = accountingDate.slice(0, 7);
  if (await isPeriodLocked(req.auth!.companyId, voucherPeriod)) {
    return json(res, 400, { error: `会计期间 ${voucherPeriod} 已锁账，无法过账。请先解锁该期间。` });
  }
  // 过账前再校验一次科目：草稿可能建于科目停用之前，或由绕过创建接口的路径产生。
  // 这是分录进总账前的最后一道闸。
  const postingAccounts = await checkAccountsUsable(req.auth!.companyId, target.lines);
  if (!postingAccounts.ok) {
    return json(res, 400, { error: postingAccounts.message, code: postingAccounts.code });
  }

  // 凭证号在过账这一刻分配，不在创建时 —— 草稿不占号，否则删草稿会留下断号，
  // 而《会计基础工作规范》要求编号连续。序号在同一事务内用 max+1 取，
  // 并发安全由迁移 048 的部分唯一索引兜底（冲突则整个事务回滚，调用方重试）。
  const voucherWord = resolveVoucherWord(target.voucherType);

  const postingRecord: VoucherPostingRecord = {
    id: `post-${voucherId}-${Date.now()}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    postedByUserId: req.auth!.userId,
    postedByName: req.auth!.username,
    postedAt
  };
  const createdLedgerEntries: LedgerEntry[] = target.lines.map((line, index) => ({
    id: `ledger-${voucherId}-${index + 1}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    entryDate: accountingDate,
    summary: line.summary || target.summary,
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: line.debit,
    credit: line.credit,
    source: "voucher_posting",
    postedAt,
    // 往来维度随凭证行进总账（V12-C2）。凭证行没填就是 null——非往来科目本就
    // 不该有，往来科目漏填的后果是这笔进不了账龄表，由 settlement 侧提示补录。
    counterpartyId: line.counterpartyId ?? null,
    // 成本中心维度同理（V12-D1）：漏填的后果是落进部门费用报表的「未指定」一行。
    costCenterId: line.costCenterId ?? null,
    // 外币原币随凭证行进总账（V12-D5）。丢在这一步的话，账上就只剩折算后的本位币
    // 金额，期末调汇拿不到外币余额、也回答不了「当初按什么汇率入的账」。
    currency: line.currency ?? BASE_CURRENCY,
    originalAmount: line.originalAmount ?? null,
    exchangeRate: line.exchangeRate ?? null
  }));
  const createdBatch: LedgerPostingBatch = {
    id: `ledger-batch-${voucherId}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    entryIds: createdLedgerEntries.map((item) => item.id),
    postedAt
  };

  await withTransaction(async (client) => {
    await client.query(
      `
        update vouchers
        set
          status = 'posted',
          posted_at = $1::timestamptz,
          updated_at = $1::timestamptz,
          period = $4,
          voucher_word = $5,
          voucher_seq = coalesce(
            (
              select max(v2.voucher_seq) + 1
              from vouchers v2
              where v2.company_id = $3
                and v2.period = $4
                and v2.voucher_word = $5
                and v2.status = 'posted'
            ),
            1
          )
        where id = $2 and company_id = $3
      `,
      [postedAt, voucherId, req.auth!.companyId, voucherPeriod, voucherWord]
    );

    await client.query(
      `
        delete from ledger_posting_batch_entries
        where batch_id in (
          select id from ledger_posting_batches
          where company_id = $1 and voucher_id = $2
        )
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from ledger_posting_batches
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from ledger_entries
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from voucher_posting_records
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );

    await client.query(
      `
        insert into voucher_posting_records (
          id,
          company_id,
          voucher_id,
          business_event_id,
          posted_by_user_id,
          posted_by_name,
          posted_at
        ) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      `,
      [
        postingRecord.id,
        postingRecord.companyId,
        postingRecord.voucherId,
        postingRecord.businessEventId,
        postingRecord.postedByUserId,
        postingRecord.postedByName,
        postingRecord.postedAt
      ]
    );

    // 总账写入统一走 ledger-writer —— 期末结转也用同一个函数，
    // 「凭证是唯一入账口径」这个不变式才不是口头约定。
    await insertLedgerEntries(client, createdLedgerEntries);

    await client.query(
      `
        insert into ledger_posting_batches (
          id,
          company_id,
          voucher_id,
          business_event_id,
          posted_at
        ) values ($1, $2, $3, $4, $5::timestamptz)
      `,
      [
        createdBatch.id,
        createdBatch.companyId,
        createdBatch.voucherId,
        createdBatch.businessEventId,
        createdBatch.postedAt
      ]
    );

    for (const entryId of createdBatch.entryIds) {
      await client.query(
        `
          insert into ledger_posting_batch_entries (batch_id, entry_id)
          values ($1, $2)
        `,
        [createdBatch.id, entryId]
      );
    }
    const reusable = await findSuccessfulWorkflowCommandExecution(req.auth!.companyId, {
      commandType: "voucher.post",
      resourceType: "voucher",
      resourceId: voucherId,
      idempotencyKey: `voucher-post:${voucherId}:${target.updatedAt}`,
      objectVersion: target.updatedAt
    });
    if (!reusable) {
      const run = await ensureWorkflowRun(
        client,
        buildWorkflowRun({
          companyId: req.auth!.companyId,
          workflowKey: "voucher.lifecycle",
          resourceType: "voucher",
          resourceId: voucherId,
          resourceLabel: target.summary,
          currentState: previousState,
          initiatorUserId: req.auth!.userId,
          initiatorName: req.auth!.username,
          authorizerUserId,
          authorizerName
        })
      );
      // 与上面的两步校验一一对应：先记「开始过账」，再记「过账完成」。
      const startTransition = buildWorkflowTransitionRecord({
        companyId: req.auth!.companyId,
        workflowRunId: run.id,
        resourceType: "voucher",
        resourceId: voucherId,
        previousState,
        nextState: executingState,
        actorUserId: req.auth!.userId,
        actorName: req.auth!.username,
        basis: "voucher.post.start",
        ruleVersion: "v4-1a"
      });
      const transition = buildWorkflowTransitionRecord({
        companyId: req.auth!.companyId,
        workflowRunId: run.id,
        resourceType: "voucher",
        resourceId: voucherId,
        previousState: executingState,
        nextState,
        actorUserId: req.auth!.userId,
        actorName: req.auth!.username,
        basis: "voucher.post",
        ruleVersion: "v4-1a"
      });
      const command = buildWorkflowCommandExecution({
        companyId: req.auth!.companyId,
        workflowRunId: run.id,
        commandType: "voucher.post",
        resourceType: "voucher",
        resourceId: voucherId,
        idempotencyKey: `voucher-post:${voucherId}:${target.updatedAt}`,
        objectVersion: target.updatedAt,
        inputSnapshot: { voucherId, lineCount: target.lines.length, businessEventId: target.businessEventId },
        initiatorUserId: req.auth!.userId,
        initiatorName: req.auth!.username,
        executorUserId: req.auth!.userId,
        executorName: req.auth!.username,
        authorizerUserId,
        authorizerName
      });
      const running = markWorkflowCommandStatus(command, "running", { progress: "posting_voucher" });
      await insertWorkflowTransition(client, startTransition);
      await insertWorkflowTransition(client, transition);
      await insertWorkflowCommandExecution(client, running);
      await updateWorkflowCommandExecution(
        client,
        markWorkflowCommandStatus(running, "succeeded", {
          progress: "posted",
          resultSnapshot: {
            postedAt,
            entryCount: createdLedgerEntries.length,
            batchId: createdBatch.id
          }
        })
      );
      await updateWorkflowRunState(client, run.id, nextState, null, postedAt);
    }
  });

  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "post",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: target.summary,
    changes: { data: { postedAt, entryCount: createdLedgerEntries.length } }
  });
  return json(res, 200, {
    ...updated,
    postingRecords: [postingRecord],
    ledgerEntries: createdLedgerEntries,
    ledgerPostingBatches: [createdBatch]
  });
}

export async function listVoucherPostingRecords(
  req: ApiRequest,
  res: ServerResponse,
  voucherId: string
) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const rows = await listCompanyVoucherPostingRecords(req.auth!.companyId, voucherId);
  return json(res, 200, { items: rows, total: rows.length });
}
