/**
 * 银行对账会话：识别未达账项、生成调节表、封存结论（V12-C3）。
 */

import type { PoolClient } from "pg";
import { fromCents, toCents } from "../../utils/money.js";
import {
  buildBalanceReconciliation,
  describeDifference,
  type BalanceReconciliationResult,
  type ReconciliationItem
} from "./balance-reconciliation.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface BankAccountRef {
  id: string;
  bankName: string;
  accountNo: string;
  accountCode: string;
}

export interface ReconciliationPreview {
  bankAccount: BankAccountRef;
  asOf: string;
  result: BalanceReconciliationResult;
  message: string;
  /**
   * 同一科目下挂了多个银行账户时的告警。
   *
   * 账面余额只能算到科目层，拆不到账户 —— 此时调节表的"账面余额"其实是
   * 这几个账户的合计，与单个账户的对账单余额本就不该相等。如实说出来，
   * 而不是给出一个看起来精确、实则无意义的差额。
   */
  sharedAccountWarning: string | null;
}

export type ReconciliationFailure = {
  code: "BANK_ACCOUNT_NOT_FOUND" | "AS_OF_INVALID" | "STATEMENT_BALANCE_REQUIRED" | "RECONCILIATION_CLOSED";
  message: string;
};

async function loadBankAccount(
  client: PoolClient,
  companyId: string,
  bankAccountId: string
): Promise<BankAccountRef | null> {
  const result = await client.query<{
    id: string;
    bank_name: string;
    account_no: string;
    account_code: string;
  }>(
    `select id, bank_name, account_no, account_code from bank_accounts
     where company_id = $1 and id = $2`,
    [companyId, bankAccountId]
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        bankName: row.bank_name,
        accountNo: row.account_no,
        accountCode: row.account_code
      }
    : null;
}

/** 该科目截至 asOf 的账面余额（分）。银行存款是借方科目，余额 = 借 − 贷。 */
async function loadBookBalanceCents(
  client: PoolClient,
  companyId: string,
  accountCode: string,
  asOf: string
): Promise<number> {
  const result = await client.query<{ balance: string | null }>(
    `select sum(debit - credit)::text as balance from ledger_entries
     where company_id = $1 and account_code = $2 and entry_date <= $3::date`,
    [companyId, accountCode, asOf]
  );
  return toCents(result.rows[0]?.balance);
}

/**
 * 银行侧未达账项：已导入但没匹配上任何凭证的流水。
 *
 * `excluded` 不算未达 —— 那是人工判定过"这笔不需要入账"的流水（如银行内部
 * 冲正），把它当未达账项会让调节表每期都挂着一堆永远不会消失的项目。
 */
async function loadBankOnlyItems(
  client: PoolClient,
  companyId: string,
  bankAccountId: string,
  asOf: string
): Promise<ReconciliationItem[]> {
  const result = await client.query<{
    id: string;
    transaction_date: string | Date;
    amount: string;
    description: string | null;
    counterparty_name: string | null;
  }>(
    `select id, transaction_date, amount::text, description, counterparty_name
     from bank_statements
     where company_id = $1 and bank_account_id = $2
       and transaction_date <= $3::date
       and match_status = 'unmatched'
     order by transaction_date`,
    [companyId, bankAccountId, asOf]
  );

  return result.rows.map((row) => {
    const amountCents = toCents(row.amount);
    return {
      // bank_statements.amount 正=收款、负=付款（见迁移 020 的列注释）
      itemType: amountCents >= 0 ? ("bank_only_receipt" as const) : ("bank_only_payment" as const),
      occurredOn: toDateOnly(row.transaction_date),
      amountCents: Math.abs(amountCents),
      description: row.description || row.counterparty_name || "银行流水未入账",
      sourceId: row.id
    };
  });
}

/**
 * 账面侧未达账项：记了账但银行流水里找不到对应的收付款分录。
 *
 * 判据是该分录所属凭证没有被任何一条流水匹配上。用凭证而非分录做判据，
 * 是因为匹配关系记在 `bank_statements.matched_voucher_id` 上 —— 这是 022
 * 定下的粒度，此处沿用而不是另起一套。
 */
async function loadBookOnlyItems(
  client: PoolClient,
  companyId: string,
  bankAccountId: string,
  accountCode: string,
  asOf: string
): Promise<ReconciliationItem[]> {
  const result = await client.query<{
    id: string;
    entry_date: string | Date;
    debit: string;
    credit: string;
    summary: string;
  }>(
    `select e.id, e.entry_date, e.debit::text, e.credit::text, e.summary
     from ledger_entries e
     where e.company_id = $1
       and e.account_code = $2
       and e.entry_date <= $3::date
       and not exists (
         select 1 from bank_statements s
         where s.company_id = $1
           and s.bank_account_id = $4
           and s.matched_voucher_id = e.voucher_id
       )
     order by e.entry_date`,
    [companyId, accountCode, asOf, bankAccountId]
  );

  return result.rows
    .map((row) => {
      const debitCents = toCents(row.debit);
      const creditCents = toCents(row.credit);
      // 借方是企业收到的钱，贷方是付出的钱
      const isReceipt = debitCents > 0;
      return {
        itemType: isReceipt ? ("book_only_receipt" as const) : ("book_only_payment" as const),
        occurredOn: toDateOnly(row.entry_date),
        amountCents: isReceipt ? debitCents : creditCents,
        description: row.summary || "账面收付款未见银行流水",
        sourceId: row.id
      };
    })
    .filter((item) => item.amountCents > 0);
}

function toDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

async function countAccountsSharingCode(
  client: PoolClient,
  companyId: string,
  accountCode: string
): Promise<number> {
  const result = await client.query<{ n: string }>(
    `select count(*)::text as n from bank_accounts where company_id = $1 and account_code = $2`,
    [companyId, accountCode]
  );
  return Number(result.rows[0]?.n ?? 0);
}

export interface PreviewInput {
  companyId: string;
  bankAccountId: string;
  asOf: string;
  statementBalance: string | number;
}

export type PreviewResult =
  | { ok: true; preview: ReconciliationPreview }
  | { ok: false; failure: ReconciliationFailure };

/** 生成调节表，不落库。用户确认无误后再封存。 */
export async function previewReconciliation(
  client: PoolClient,
  input: PreviewInput
): Promise<PreviewResult> {
  if (!DATE_PATTERN.test(input.asOf)) {
    return { ok: false, failure: { code: "AS_OF_INVALID", message: "对账截止日必须形如 YYYY-MM-DD。" } };
  }

  const bankAccount = await loadBankAccount(client, input.companyId, input.bankAccountId);
  if (!bankAccount) {
    return {
      ok: false,
      failure: { code: "BANK_ACCOUNT_NOT_FOUND", message: `找不到银行账户 ${input.bankAccountId}。` }
    };
  }

  const [bookBalanceCents, bankOnly, bookOnly, sharingCount] = await Promise.all([
    loadBookBalanceCents(client, input.companyId, bankAccount.accountCode, input.asOf),
    loadBankOnlyItems(client, input.companyId, bankAccount.id, input.asOf),
    loadBookOnlyItems(
      client,
      input.companyId,
      bankAccount.id,
      bankAccount.accountCode,
      input.asOf
    ),
    countAccountsSharingCode(client, input.companyId, bankAccount.accountCode)
  ]);

  const result = buildBalanceReconciliation({
    statementBalanceCents: toCents(input.statementBalance),
    bookBalanceCents,
    items: [...bookOnly, ...bankOnly]
  });

  return {
    ok: true,
    preview: {
      bankAccount,
      asOf: input.asOf,
      result,
      message: describeDifference(result),
      sharedAccountWarning:
        sharingCount > 1
          ? `科目 ${bankAccount.accountCode} 下挂着 ${sharingCount} 个银行账户，` +
            `账面余额只能算到科目层、拆不到单个账户，因此这里的差额不能直接当作本账户的对账差异。` +
            `请为每个银行账户设置独立的明细科目（如 ${bankAccount.accountCode}01、${bankAccount.accountCode}02）。`
          : null
    }
  };
}

export interface CloseInput extends PreviewInput {
  notes?: string | null;
  closedBy?: string | null;
  /** 差额不为 0 时必须显式确认才能封存。 */
  acknowledgeDifference?: boolean;
}

export type CloseResult =
  | { ok: true; reconciliationId: string; preview: ReconciliationPreview }
  | { ok: false; failure: ReconciliationFailure | { code: "DIFFERENCE_NOT_ACKNOWLEDGED"; message: string } };

/**
 * 封存对账结论，连同当时的未达账项一起冻结。
 *
 * 差额不为 0 时**不禁止**封存，但要求显式确认 —— 现实里确实存在一时查不清
 * 的差额，硬性禁止只会逼用户编一笔假的未达账项来凑平，那比留个带说明的
 * 差额糟糕得多。但也不能默默通过：确认这个动作本身要留痕。
 */
export async function closeReconciliation(
  client: PoolClient,
  input: CloseInput
): Promise<CloseResult> {
  const previewed = await previewReconciliation(client, input);
  if (!previewed.ok) return previewed;

  const { preview } = previewed;
  if (!preview.result.balanced && !input.acknowledgeDifference) {
    return {
      ok: false,
      failure: {
        code: "DIFFERENCE_NOT_ACKNOWLEDGED",
        message:
          `${preview.message} 若确认这个差额暂时无法解释，请在备注里说明原因并勾选确认后再封存。`
      }
    };
  }

  const existing = await client.query<{ status: string }>(
    `select status from bank_reconciliations where bank_account_id = $1 and as_of_date = $2::date`,
    [input.bankAccountId, input.asOf]
  );
  if (existing.rows[0]?.status === "closed") {
    return {
      ok: false,
      failure: {
        code: "RECONCILIATION_CLOSED",
        message: `${input.asOf} 的对账已封存。如需重做，请先撤销封存。`
      }
    };
  }

  const id = `brec-${input.bankAccountId}-${input.asOf}`;
  const { result } = preview;

  await client.query(
    `insert into bank_reconciliations (
       id, company_id, bank_account_id, as_of_date,
       statement_balance, book_balance, adjusted_balance, difference,
       status, notes, closed_by, closed_at
     ) values ($1, $2, $3, $4::date, $5::numeric, $6::numeric, $7::numeric, $8::numeric,
               'closed', $9, $10, now())
     on conflict (id) do update set
       statement_balance = excluded.statement_balance,
       book_balance = excluded.book_balance,
       adjusted_balance = excluded.adjusted_balance,
       difference = excluded.difference,
       status = 'closed',
       notes = excluded.notes,
       closed_by = excluded.closed_by,
       closed_at = now(),
       updated_at = now()`,
    [
      id,
      input.companyId,
      input.bankAccountId,
      input.asOf,
      fromCents(result.statementBalanceCents),
      fromCents(result.bookBalanceCents),
      // 两侧不等时存银行侧调节后余额，差额单列——存一个"折中值"会让这张表
      // 既不等于银行也不等于账面，谁也对不上
      fromCents(result.adjustedStatementCents),
      fromCents(result.differenceCents),
      input.notes ?? "",
      input.closedBy ?? null
    ]
  );

  // 重做时先清空旧快照：未达账项是"当时看到的样子"，不该新旧混叠
  await client.query(`delete from bank_reconciliation_items where reconciliation_id = $1`, [id]);

  for (const [index, item] of result.items.entries()) {
    await client.query(
      `insert into bank_reconciliation_items (
         id, company_id, reconciliation_id, item_type, occurred_on, amount, description, source_id
       ) values ($1, $2, $3, $4, $5::date, $6::numeric, $7, $8)`,
      [
        `${id}-item-${index + 1}`,
        input.companyId,
        id,
        item.itemType,
        item.occurredOn,
        fromCents(item.amountCents),
        item.description,
        item.sourceId
      ]
    );
  }

  return { ok: true, reconciliationId: id, preview };
}

export async function listReconciliations(
  client: PoolClient,
  companyId: string,
  bankAccountId?: string | null
) {
  const result = await client.query(
    `select id, bank_account_id, as_of_date, statement_balance::text, book_balance::text,
            adjusted_balance::text, difference::text, status, notes, closed_by, closed_at
     from bank_reconciliations
     where company_id = $1 and ($2::text is null or bank_account_id = $2)
     order by as_of_date desc
     limit 100`,
    [companyId, bankAccountId ?? null]
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    bankAccountId: row.bank_account_id,
    asOf: toDateOnly(row.as_of_date),
    statementBalance: row.statement_balance,
    bookBalance: row.book_balance,
    adjustedBalance: row.adjusted_balance,
    difference: row.difference,
    status: row.status,
    notes: row.notes,
    closedBy: row.closed_by,
    closedAt: row.closed_at
  }));
}
