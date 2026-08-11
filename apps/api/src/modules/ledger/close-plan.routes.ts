/**
 * 月结编排纯核心接线（H2-w2）。
 * GET /api/ledger/close-plan?period=YYYY-MM
 *
 * 汇总某属期已知的结账事实（未过账事项、待审草稿、票税一致性、结转/快照/
 * 申报底稿/归档状态），交给纯函数 buildClosePlan（见 close-plan.ts）派生结账
 * 向导每一步的状态，供前端渲染。仍有事实在当前 schema 中无可靠数据源
 * （票税差异是否已人工确认），使用保守默认值 false，并在响应 factSources 中
 * 标注每个字段的来源，避免向导因缺数据而误报完成。
 *
 * V12-C1：折旧是否已计提过账原本也在上面那一档，现已接上真实数据源
 * （见 loadDepreciationPosted）。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query, queryOne } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { buildClosePlan, type ClosePlanInput } from "./close-plan.js";
import { checkTaxConsistency } from "../tax-integration/consistency.js";
import { REVENUE_EXCLUDED_PREFIXES } from "../tax-integration/consistency.routes.js";
import { PENDING_DRAFT_STATUSES } from "../ai-agents/close/draft-status.js";
import { REVENUE_ACCOUNT_PREFIXES } from "../reports/profit-accounts.js";
import { EXCLUDE_PERIOD_CLOSING_SQL } from "./closing-entries.js";

const PERIOD_LABEL = /^\d{4}-\d{2}$/;
/** 收入科目口径统一来自 reports/profit-accounts.ts，避免第三份副本再次漂移。 */
const REVENUE_PREFIXES = [...REVENUE_ACCOUNT_PREFIXES];

/** 每个 ClosePlanInput 字段的数据来源说明，供前端/排查展示。 */
const FACT_SOURCES: Record<keyof ClosePlanInput, string> = {
  unpostedEventCount:
    "business_events：company_id + occurred_on 落在本期，且 status 不在 ('posted','archived') 之列",
  depreciationPosted:
    "vouchers：本期存在 source='depreciation' 且 status='posted' 的凭证（草稿不算——草稿不进总账）；" +
    "或 fixed_assets 中本期没有处于计提区间的资产（无固定资产的公司不该被这一步堵住月结）",
  pendingDraftCount:
    "event_voucher_drafts：status 属于待批集合（'draft' + 'review_required'，见 ai-agents/close/draft-status.ts），关联 business_events.occurred_on 落在本期；未区分\"权责发生制专属\"草稿，按全部待审草稿计",
  taxConsistencyOverall:
    "复用 tax-integration/consistency.ts 的 checkTaxConsistency：本期无发票记录时为 null；申报数尚未接入，declaredOutputTaxCents/declaredInputTaxCents 占位为 0（与 consistency.routes.ts 一致）",
  taxConsistencyAcknowledged:
    "当前 schema 无持久化的人工确认字段，默认 false（每次需在 UI 重新确认）",
  incomeClosed: "period_closings：存在 company_id + period_label 记录即视为已结转损益",
  snapshotTaken: "report_snapshots：存在 company_id + period_label 记录即视为已生成期末快照",
  filingDraftReady: "tax_declaration_submissions：存在 company_id + filing_period 记录即视为申报底稿已生成",
  archived: "accounting_periods.is_locked（与 ledger/routes.ts 的 isPeriodLocked 语义一致）"
};

async function count(sql: string, params: unknown[]): Promise<number> {
  const row = await queryOne<{ n: string }>(sql, params);
  return parseInt(row?.n ?? "0", 10);
}

async function loadUnpostedEventCount(companyId: string, period: string): Promise<number> {
  return count(
    `select count(*)::text n from business_events
     where company_id = $1 and to_char(occurred_on, 'YYYY-MM') = $2
       and status not in ('posted', 'archived')`,
    [companyId, period]
  );
}

async function loadPendingDraftCount(companyId: string, period: string): Promise<number> {
  return count(
    `select count(*)::text n from event_voucher_drafts d
     join business_events e on e.id = d.business_event_id
     where d.company_id = $1 and to_char(e.occurred_on, 'YYYY-MM') = $2
       and d.status = any($3::text[])`,
    [companyId, period, [...PENDING_DRAFT_STATUSES]]
  );
}

async function loadIncomeClosed(companyId: string, period: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from period_closings where company_id = $1 and period_label = $2`,
    [companyId, period]
  );
  return row !== null;
}

/**
 * 本期折旧是否已完成（V12-C1 接线）。
 *
 * 此前这一步硬编码 false —— 当时确实没有折旧模块，注释也如实写了。现在有了。
 *
 * 判据是两条的并集，缺一条都会让月结卡死：
 * - 折旧凭证已**过账**（不是生成草稿就算完，草稿不进总账，费用还没入账）；
 * - 或者本期压根没有处于计提区间的固定资产 —— 纯服务型公司一台设备都没有，
 *   若只看凭证，这一步会永远停在"待办"，把整个月结流程堵死。
 */
async function loadDepreciationPosted(companyId: string, period: string): Promise<boolean> {
  const posted = await count(
    `select count(*)::text n from vouchers
     where company_id = $1 and period = $2 and source = 'depreciation' and status = 'posted'`,
    [companyId, period]
  );
  if (posted > 0) return true;

  const depreciable = await count(
    `select count(*)::text n from fixed_assets
     where company_id = $1
       and depreciation_start_period <= $2
       and (disposed_period is null or disposed_period >= $2)`,
    [companyId, period]
  );
  return depreciable === 0;
}

async function loadSnapshotTaken(companyId: string, period: string): Promise<boolean> {
  const n = await count(
    `select count(*)::text n from report_snapshots where company_id = $1 and period_label = $2`,
    [companyId, period]
  );
  return n > 0;
}

async function loadFilingDraftReady(companyId: string, period: string): Promise<boolean> {
  const n = await count(
    `select count(*)::text n from tax_declaration_submissions where company_id = $1 and filing_period = $2`,
    [companyId, period]
  );
  return n > 0;
}

async function loadArchived(companyId: string, period: string): Promise<boolean> {
  const row = await queryOne<{ is_locked: boolean }>(
    `select is_locked from accounting_periods where company_id = $1 and period = $2`,
    [companyId, period]
  );
  return row?.is_locked ?? false;
}

interface InvoiceTotalsRow {
  direction: string;
  sum_amount: string | null;
  sum_tax_amount: string | null;
}

/**
 * 复用 tax-integration/consistency.ts 的纯函数核对结果；本期无发票记录时
 * 视为"尚未运行核对"，返回 null（与 close-plan.ts 的 in_review 语义一致）。
 * 申报数据尚未接入稳定字段来源，暂以 0 占位（与 consistency.routes.ts 一致）。
 */
async function loadTaxConsistencyOverall(
  companyId: string,
  period: string
): Promise<ClosePlanInput["taxConsistencyOverall"]> {
  const invoiceRows = await query<InvoiceTotalsRow>(
    `select direction, sum(amount) as sum_amount, sum(tax_amount) as sum_tax_amount
     from invoices
     where company_id = $1 and to_char(invoice_date, 'YYYY-MM') = $2
     group by direction`,
    [companyId, period]
  );
  if (invoiceRows.length === 0) {
    return null;
  }

  const output = invoiceRows.find((r) => r.direction === "output");
  const input = invoiceRows.find((r) => r.direction === "input");
  const likeClauses = REVENUE_PREFIXES.map((_, i) => `account_code like $${i + 3}`).join(" or ");
  const excludeOffset = REVENUE_PREFIXES.length + 3;
  const excludeClauses = REVENUE_EXCLUDED_PREFIXES.map(
    (_, i) => `account_code not like $${i + excludeOffset}`
  ).join(" and ");
  // 排除结转损益分录（口径见 ledger/closing-entries.ts）：按属期聚合账面收入。
  // 这一处尤其致命，因为它和 incomeClosed 在同一个响应里：结转一做完，
  // 「已结转损益」勾上的同一瞬间，票税一致性就因为账面收入变 0 而翻红，
  // 结账向导会把刚做对的事报成错。
  //
  // 顺带补上 REVENUE_EXCLUDED_PREFIXES（6001c 主营业务成本 / 6301e 管理费用）。
  // 它们落在 `6001%` / `6301%` 里，此前未排除，会被当成负收入冲减账面收入 ——
  // 这是与结转无关的既有缺陷，但与 tax-integration/consistency.routes.ts 的同款
  // 查询口径不一致，同一份数据两个入口给出两个票税差异，一并对齐。
  const revenueRows = await query<{ revenue: string }>(
    `select coalesce(sum(credit - debit), 0) as revenue
     from ledger_entries
     where company_id = $1 and to_char(entry_date, 'YYYY-MM') = $2
       and ${EXCLUDE_PERIOD_CLOSING_SQL}
       and (${likeClauses}) and (${excludeClauses})`,
    [
      companyId,
      period,
      ...REVENUE_PREFIXES.map((p) => `${p}%`),
      ...REVENUE_EXCLUDED_PREFIXES.map((p) => `${p}%`)
    ]
  );

  const report = checkTaxConsistency({
    period,
    invoiceOutputTaxCents: Math.round(Number(output?.sum_tax_amount ?? 0) * 100),
    invoiceInputTaxCents: Math.round(Number(input?.sum_tax_amount ?? 0) * 100),
    invoiceSalesAmountCents: Math.round(Number(output?.sum_amount ?? 0) * 100),
    declaredOutputTaxCents: 0,
    declaredInputTaxCents: 0,
    ledgerRevenueCents: Math.round(Number(revenueRows[0]?.revenue ?? 0) * 100)
  });
  return report.overall;
}

async function loadClosePlanInput(companyId: string, period: string): Promise<ClosePlanInput> {
  const [unpostedEventCount, pendingDraftCount, depreciationPosted, incomeClosed, snapshotTaken, filingDraftReady, archived, taxConsistencyOverall] =
    await Promise.all([
      loadUnpostedEventCount(companyId, period),
      loadPendingDraftCount(companyId, period),
      loadDepreciationPosted(companyId, period),
      loadIncomeClosed(companyId, period),
      loadSnapshotTaken(companyId, period),
      loadFilingDraftReady(companyId, period),
      loadArchived(companyId, period),
      loadTaxConsistencyOverall(companyId, period)
    ]);

  return {
    unpostedEventCount,
    depreciationPosted,
    pendingDraftCount,
    taxConsistencyOverall,
    taxConsistencyAcknowledged: false,
    incomeClosed,
    snapshotTaken,
    filingDraftReady,
    archived
  };
}

/**
 * GET /api/ledger/close-plan?period=YYYY-MM
 * 权限：ledger.view（只读，聚合已有事实，不做任何写入）。
 */
export async function closePlanRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? "";
  if (!PERIOD_LABEL.test(period)) {
    json(res, 400, { error: "period must look like YYYY-MM" });
    return;
  }

  const companyId = req.auth!.companyId;
  const facts = await loadClosePlanInput(companyId, period);
  const plan = buildClosePlan(facts);

  json(res, 200, { period, plan, facts, factSources: FACT_SOURCES });
}
