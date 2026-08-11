/**
 * 定期凭证：模板管理与按期生成（V12-C4）。
 *
 * 生成的是**草稿**，与折旧、红冲同一条路径：系统省掉重复劳动，人保留判断权。
 * 房租这个月要不要提、金额有没有随合同调整，模板不知道。
 */

import type { PoolClient } from "pg";
import { checkAccountsUsable } from "../accounts/account-guard.js";
import { fromCents, toCents } from "../../utils/money.js";
import { endOfPeriod } from "../assets/depreciation-run.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface RecurringLineInput {
  accountCode: string;
  accountName?: string | null;
  debit?: string | number | null;
  credit?: string | number | null;
  summary?: string | null;
  counterpartyId?: string | null;
}

export interface CreateRecurringInput {
  companyId: string;
  name: string;
  startPeriod: string;
  endPeriod?: string | null;
  summaryTemplate: string;
  voucherType?: string;
  lines: readonly RecurringLineInput[];
  notes?: string | null;
}

export interface RecurringVoucher {
  id: string;
  companyId: string;
  name: string;
  frequency: string;
  startPeriod: string;
  endPeriod: string | null;
  voucherType: string;
  summaryTemplate: string;
  status: "active" | "paused";
  notes: string;
  lines: {
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    summary: string;
    counterpartyId: string | null;
  }[];
}

export type RecurringFailure = {
  code:
    | "RECURRING_NAME_REQUIRED"
    | "RECURRING_PERIOD_INVALID"
    | "RECURRING_PERIOD_ORDER"
    | "RECURRING_LINES_REQUIRED"
    | "RECURRING_NOT_BALANCED"
    | "RECURRING_NOT_FOUND"
    | "ACCOUNT_NOT_FOUND"
    | "ACCOUNT_NOT_LEAF"
    | "ACCOUNT_INACTIVE";
  message: string;
  offendingCodes?: string[];
};

export type CreateRecurringResult =
  | { ok: true; recurring: RecurringVoucher }
  | { ok: false; failure: RecurringFailure };

function normalizeAmount(value: string | number | null | undefined): number {
  const cents = toCents(value ?? 0);
  return Number.isFinite(cents) && cents > 0 ? cents : 0;
}

/**
 * 模板本身必须借贷平衡。
 *
 * 不平的模板会**每个月**生成一张过不了账的草稿，而用户往往到月结时才发现，
 * 那时已经积了好几张。在建模板这一刻拦住，比每期拦一次便宜得多。
 */
export function checkTemplateBalanced(lines: readonly RecurringLineInput[]): {
  balanced: boolean;
  debitCents: number;
  creditCents: number;
} {
  let debitCents = 0;
  let creditCents = 0;
  for (const line of lines) {
    debitCents += normalizeAmount(line.debit);
    creditCents += normalizeAmount(line.credit);
  }
  return { balanced: debitCents === creditCents && debitCents > 0, debitCents, creditCents };
}

/** 某期间是否落在模板的有效区间内。 */
export function isPeriodInScope(
  recurring: Pick<RecurringVoucher, "startPeriod" | "endPeriod" | "status">,
  period: string
): boolean {
  if (recurring.status !== "active") return false;
  if (period < recurring.startPeriod) return false;
  if (recurring.endPeriod && period > recurring.endPeriod) return false;
  return true;
}

/** 摘要模板里的 `{period}` 替换成实际期间。 */
export function renderSummary(template: string, period: string): string {
  return template.replaceAll("{period}", period);
}

export async function createRecurringVoucher(
  client: PoolClient,
  input: CreateRecurringInput
): Promise<CreateRecurringResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, failure: { code: "RECURRING_NAME_REQUIRED", message: "模板名称必填。" } };
  }
  if (!PERIOD_PATTERN.test(input.startPeriod)) {
    return {
      ok: false,
      failure: { code: "RECURRING_PERIOD_INVALID", message: "开始期间必须形如 YYYY-MM。" }
    };
  }
  if (input.endPeriod && !PERIOD_PATTERN.test(input.endPeriod)) {
    return {
      ok: false,
      failure: { code: "RECURRING_PERIOD_INVALID", message: "结束期间必须形如 YYYY-MM。" }
    };
  }
  if (input.endPeriod && input.endPeriod < input.startPeriod) {
    return {
      ok: false,
      failure: {
        code: "RECURRING_PERIOD_ORDER",
        message: `结束期间 ${input.endPeriod} 早于开始期间 ${input.startPeriod}，这个模板永远不会生成任何凭证。`
      }
    };
  }
  if (input.lines.length === 0) {
    return { ok: false, failure: { code: "RECURRING_LINES_REQUIRED", message: "至少需要一条分录。" } };
  }

  const balance = checkTemplateBalanced(input.lines);
  if (!balance.balanced) {
    return {
      ok: false,
      failure: {
        code: "RECURRING_NOT_BALANCED",
        message:
          balance.debitCents === 0 && balance.creditCents === 0
            ? "模板的所有分录金额都是 0。"
            : `模板借贷不平：借方 ${fromCents(balance.debitCents)}，贷方 ${fromCents(balance.creditCents)}。` +
              `不平的模板会每个月生成一张过不了账的草稿。`
      }
    };
  }

  // 只把科目码交给闸门：AccountRef 的 accountName 是 string | undefined，
  // 而模板行允许 null（用户没填时由科目主数据补），类型上不该硬凑。
  const guard = await checkAccountsUsable(
    input.companyId,
    input.lines.map((line) => ({ accountCode: line.accountCode })),
    client
  );
  if (!guard.ok) {
    return {
      ok: false,
      failure: { code: guard.code, message: guard.message, offendingCodes: guard.offendingCodes }
    };
  }

  const accountNames = await loadAccountNames(
    client,
    input.companyId,
    input.lines.map((line) => line.accountCode)
  );

  const id = `rec-${input.companyId}-${Date.now()}`;
  await client.query(
    `insert into recurring_vouchers (
       id, company_id, name, start_period, end_period, voucher_type, summary_template, notes
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.companyId,
      name,
      input.startPeriod,
      input.endPeriod ?? null,
      input.voucherType ?? "general",
      input.summaryTemplate,
      input.notes ?? ""
    ]
  );

  const lines = input.lines.map((line, index) => ({
    accountCode: line.accountCode,
    accountName: line.accountName?.trim() || accountNames.get(line.accountCode) || line.accountCode,
    debit: fromCents(normalizeAmount(line.debit)),
    credit: fromCents(normalizeAmount(line.credit)),
    summary: line.summary?.trim() || "",
    counterpartyId: line.counterpartyId ?? null
  }));

  for (const [index, line] of lines.entries()) {
    await client.query(
      `insert into recurring_voucher_lines (
         id, company_id, recurring_id, summary, account_code, account_name,
         debit, credit, counterparty_id, sort_order
       ) values ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9, $10)`,
      [
        `${id}-line-${index + 1}`,
        input.companyId,
        id,
        line.summary,
        line.accountCode,
        line.accountName,
        line.debit,
        line.credit,
        line.counterpartyId,
        index
      ]
    );
  }

  return {
    ok: true,
    recurring: {
      id,
      companyId: input.companyId,
      name,
      frequency: "monthly",
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod ?? null,
      voucherType: input.voucherType ?? "general",
      summaryTemplate: input.summaryTemplate,
      status: "active",
      notes: input.notes ?? "",
      lines
    }
  };
}

export async function listRecurringVouchers(
  client: PoolClient,
  companyId: string
): Promise<RecurringVoucher[]> {
  const templates = await client.query<any>(
    `select id, company_id, name, frequency, start_period, end_period, voucher_type,
            summary_template, status, notes
     from recurring_vouchers where company_id = $1 order by name`,
    [companyId]
  );
  if (templates.rows.length === 0) return [];

  const lines = await client.query<any>(
    `select recurring_id, account_code, account_name, debit::text, credit::text, summary, counterparty_id
     from recurring_voucher_lines where company_id = $1 order by recurring_id, sort_order`,
    [companyId]
  );

  return templates.rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    frequency: row.frequency,
    startPeriod: row.start_period,
    endPeriod: row.end_period,
    voucherType: row.voucher_type,
    summaryTemplate: row.summary_template,
    status: row.status,
    notes: row.notes,
    lines: lines.rows
      .filter((line) => line.recurring_id === row.id)
      .map((line) => ({
        accountCode: line.account_code,
        accountName: line.account_name,
        debit: line.debit,
        credit: line.credit,
        summary: line.summary,
        counterpartyId: line.counterparty_id
      }))
  }));
}

export async function setRecurringStatus(
  client: PoolClient,
  companyId: string,
  recurringId: string,
  status: "active" | "paused"
): Promise<boolean> {
  const result = await client.query(
    `update recurring_vouchers set status = $3, updated_at = now()
     where company_id = $1 and id = $2`,
    [companyId, recurringId, status]
  );
  return (result.rowCount ?? 0) > 0;
}

export interface GenerationOutcome {
  recurringId: string;
  name: string;
  voucherId: string | null;
  /** 未生成时的原因，供界面解释"为什么这个模板这期没出凭证"。 */
  skippedReason: "out_of_scope" | "already_generated" | null;
}

export interface GenerateResult {
  period: string;
  generated: GenerationOutcome[];
  skipped: GenerationOutcome[];
}

/**
 * 为某期间生成全部到期的定期凭证草稿。
 *
 * 幂等：凭证 id 由模板 id 与期间确定，重复调用不会生成第二张。已存在的
 * 归入 skipped 并说明原因，而不是静默跳过 —— 用户按了按钮却什么都没发生
 * 是最让人困惑的反馈。
 */
export async function generateRecurringVouchers(
  client: PoolClient,
  companyId: string,
  period: string,
  now: string
): Promise<GenerateResult> {
  const templates = await listRecurringVouchers(client, companyId);
  const generated: GenerationOutcome[] = [];
  const skipped: GenerationOutcome[] = [];

  for (const template of templates) {
    if (!isPeriodInScope(template, period)) {
      skipped.push({
        recurringId: template.id,
        name: template.name,
        voucherId: null,
        skippedReason: "out_of_scope"
      });
      continue;
    }

    const voucherId = `vch-rec-${template.id}-${period}`;
    const exists = await client.query(`select 1 from vouchers where id = $1`, [voucherId]);
    if (exists.rowCount && exists.rowCount > 0) {
      skipped.push({
        recurringId: template.id,
        name: template.name,
        voucherId,
        skippedReason: "already_generated"
      });
      continue;
    }

    const summary = renderSummary(template.summaryTemplate, period);
    // 会计日期取期间末日：定期费用（房租、摊销）是整期的成本，没有确切发生日
    const accountingDate = endOfPeriod(period);

    await client.query(
      `insert into vouchers (
         id, company_id, voucher_type, summary, status, source,
         accounting_date, period, created_at, updated_at
       ) values ($1, $2, $3, $4, 'draft', 'recurring', $5::date, $6, $7::timestamptz, $7::timestamptz)`,
      [voucherId, companyId, template.voucherType, summary, accountingDate, period, now]
    );

    for (const [index, line] of template.lines.entries()) {
      await client.query(
        `insert into voucher_lines (
           id, company_id, voucher_id, summary, account_code, account_name,
           debit, credit, sort_order, counterparty_id
         ) values ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9, $10)`,
        [
          `vl-rec-${template.id}-${period}-${index + 1}`,
          companyId,
          voucherId,
          line.summary || summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index,
          line.counterpartyId
        ]
      );
    }

    generated.push({
      recurringId: template.id,
      name: template.name,
      voucherId,
      skippedReason: null
    });
  }

  return { period, generated, skipped };
}

async function loadAccountNames(
  client: PoolClient,
  companyId: string,
  codes: readonly string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(codes)];
  if (unique.length === 0) return new Map();
  const result = await client.query<{ code: string; name: string }>(
    `select code, name from accounts where company_id = $1 and code = any($2::text[])`,
    [companyId, unique]
  );
  return new Map(result.rows.map((row) => [row.code, row.name]));
}
