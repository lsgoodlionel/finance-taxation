/**
 * 账簿口径增值税底稿的 HTTP 接线。
 *
 * `GET /api/tax/vat-working-paper/ledger?period=YYYY-MM`
 *
 * 同时给出账簿口径、税目口径与两者差额。差额不是噪音——它等于
 * 「记了账没录税目」或「录了税目没记账」的金额，正是月结要清的尾巴。
 */

import type { ServerResponse } from "node:http";
import type { TaxItem, TaxpayerProfile } from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { query } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { fromCents, toCents } from "../../utils/money.js";
import { resolveVatAccounts, VAT_ACCOUNT_ROLES, type VatAccountMap } from "./vat-accounts.js";
import {
  buildLedgerVatPaper,
  reconcilePapers,
  type LedgerEntryForVat,
  type LedgerVatPaper
} from "./vat-ledger-paper.js";
import { buildVatWorkingPaper } from "./vat-working-paper.js";
import { listTaxRates } from "./tax-rate-store.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

interface EntryRow {
  id: string;
  voucher_id: string;
  entry_date: string | Date;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
  account_type: string;
}

function toDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

/** `account_type` → 底稿角色。未列出的增值税科目归入 other，不参与汇总。 */
function roleOf(accountType: string): LedgerEntryForVat["role"] {
  switch (accountType) {
    case VAT_ACCOUNT_ROLES.outputTax:
      return "output";
    case VAT_ACCOUNT_ROLES.inputTax:
      return "input";
    case VAT_ACCOUNT_ROLES.inputTaxTransferOut:
      return "inputTransferOut";
    case VAT_ACCOUNT_ROLES.taxPaid:
      return "taxPaid";
    case "liability_tax_vat_simplified":
      return "simplified";
    default:
      return "other";
  }
}

function periodEnd(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * 取本期增值税科目的分录。
 *
 * **本期发生额**而非累计：底稿报的是"这个申报期发生了多少"，与结转取累计
 * 是两个口径（结转要跨月结转留抵，见 vat-accounts.ts 的 VAT_COLUMN_ROLES）。
 * 两处口径不同是刻意的，混用会让底稿把开业至今的税重报一遍。
 */
async function loadVatEntries(
  companyId: string,
  accounts: VatAccountMap,
  period: string
): Promise<LedgerEntryForVat[]> {
  const codes = Object.values(accounts).map((account) => account.code);
  const rows = await query<EntryRow>(
    `select e.id, e.voucher_id, e.entry_date, e.summary, e.account_code, e.account_name,
            e.debit::text, e.credit::text, a.account_type
     from ledger_entries e
     join accounts a on a.company_id = e.company_id and a.code = e.account_code
     where e.company_id = $1
       and e.account_code = any($2::text[])
       and e.entry_date >= $3::date and e.entry_date <= $4::date
     order by e.entry_date, e.id`,
    [companyId, codes, `${period}-01`, periodEnd(period)]
  );

  return rows.map((row) => ({
    entryId: row.id,
    voucherId: row.voucher_id,
    entryDate: toDateOnly(row.entry_date),
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debitCents: toCents(row.debit),
    creditCents: toCents(row.credit),
    role: roleOf(row.account_type)
  }));
}

function serializePaper(paper: LedgerVatPaper) {
  return {
    period: paper.period,
    outputTax: fromCents(paper.outputTaxCents),
    inputTax: fromCents(paper.inputTaxCents),
    inputTransferOut: fromCents(paper.inputTransferOutCents),
    taxPaid: fromCents(paper.taxPaidCents),
    simplified: fromCents(paper.simplifiedCents),
    payable: fromCents(paper.payableCents),
    lines: paper.lines.map((line) => ({
      entryId: line.entryId,
      voucherId: line.voucherId,
      entryDate: line.entryDate,
      summary: line.summary,
      accountCode: line.accountCode,
      accountName: line.accountName,
      amount: fromCents(line.amountCents),
      role: line.role
    }))
  };
}

export async function getLedgerVatWorkingPaper(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? "";
  if (!PERIOD_PATTERN.test(period)) {
    json(res, 400, { error: "period 必填，格式 YYYY-MM", code: "PERIOD_INVALID" });
    return;
  }

  const companyId = req.auth!.companyId;
  const resolution = await resolveVatAccounts(companyId);
  if (!resolution.ok) {
    json(res, 400, {
      error: resolution.message,
      code: "VAT_ACCOUNTS_MISSING"
    });
    return;
  }

  const entries = await loadVatEntries(companyId, resolution.accounts, period);
  const ledgerPaper = buildLedgerVatPaper(period, entries);

  // 税目口径同时算一份用于对差。它仍需要税率——那是它的固有缺陷
  // （用税率重算而不是取账上已入账的数），也正是要拿它来对差的原因。
  const [items, profiles, rates] = await Promise.all([
    query<TaxItem>(
      `select id, company_id as "companyId", business_event_id as "businessEventId",
              mapping_id as "mappingId", tax_type as "taxType", treatment, basis,
              filing_period as "filingPeriod", status, source,
              created_at as "createdAt", updated_at as "updatedAt"
       from tax_items where company_id = $1 and filing_period = $2`,
      [companyId, period]
    ),
    query<TaxpayerProfile>(
      `select id, company_id as "companyId", taxpayer_type as "taxpayerType",
              effective_from as "effectiveFrom", status, notes,
              created_at as "createdAt", updated_at as "updatedAt"
       from taxpayer_profiles where company_id = $1 and status = 'active'
       order by effective_from desc limit 1`,
      [companyId]
    ),
    listTaxRates(companyId, "vat")
  ]);

  const profile = profiles[0] ?? null;
  const itemsPaper = profile ? buildVatWorkingPaper(profile, items, period, rates) : null;
  const itemsPayableCents = itemsPaper ? toCents(itemsPaper.payableVatAmount) : 0;

  json(res, 200, {
    ledger: serializePaper(ledgerPaper),
    items: itemsPaper
      ? { payable: itemsPaper.payableVatAmount, lineCount: itemsPaper.lines.length }
      : null,
    reconciliation: profile
      ? {
          ...reconcilePapers(ledgerPaper.payableCents, itemsPayableCents),
          ledgerPayable: fromCents(ledgerPaper.payableCents),
          itemsPayable: fromCents(itemsPayableCents),
          difference: fromCents(ledgerPaper.payableCents - itemsPayableCents)
        }
      : {
          // 没有生效的纳税人档案时不硬凑一个对比结果——那会让"一致"看起来
          // 像是核对通过，实际上根本没核对
          consistent: false,
          message: "没有生效的纳税人档案，税目口径算不出来，无法与账簿对差。"
        }
  });
}
