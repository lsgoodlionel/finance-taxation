/**
 * 期初建账（V12-B4 / 蓝图 E5）。
 *
 * ## 修的是什么
 *
 * `grep '期初|opening_balance|openingBalance'` 在 apps/api/src/modules 下零命中。
 * 一家运营三年的公司迁进 FT，账只能从上线那天从零开始记 —— 银行存款 0、
 * 应收账款 0、实收资本 0。这不是「少个功能」，是产品只能服务从零建账的新设公司，
 * 存量企业一家都接不了。
 *
 * ## 载体
 *
 * 期初余额就是**一张真实的期初凭证**，分录以 `source = 'opening_balance'` 标记，
 * 走 `insertLedgerEntries` 写进同一张 `ledger_entries`。选型理由见迁移 050 的头注：
 * 独立表会制造第二个余额事实来源，逼着每个读路径都记得「再加上期初表」，
 * 漏一个就是「银行存款少了 80 万」这种量级的静默错账。
 *
 * ## 差额不自动补
 *
 * 借贷不平时**拒绝保存**，并在错误里把差额和 3141 的落脚点说清楚，但不替用户
 * 补一条平衡分录。理由见 {@link OpeningBalanceImbalance} 的注释。
 */

import type { PoolClient } from "pg";
import { checkAccountsUsable } from "../accounts/account-guard.js";
import { checkPostable, insertLedgerEntries } from "../vouchers/ledger-writer.js";
import { resolveVoucherWord } from "../vouchers/voucher-number.js";
import {
  describeOpeningBalanceRejection,
  rejectOpeningBalance,
  RETAINED_EARNINGS_CODE,
  type OpeningBalanceRejection
} from "./account-semantics.js";
import { OPENING_BALANCE_SOURCE } from "./closing-sources.js";

/** 借贷相等的判定容差，与 ledger-writer 保持一致（金额列是 numeric(18,2)）。 */
const BALANCE_TOLERANCE = 0.0001;

export interface OpeningBalanceLineInput {
  accountCode: string;
  /** 借方金额，字符串以对齐 numeric(18,2)，避免浮点在边界抖动。 */
  debit?: string | number | null;
  credit?: string | number | null;
  summary?: string | null;
}

export interface PostOpeningBalancesInput {
  companyId: string;
  /** 建账基准日 `YYYY-MM-DD`：余额截止到这一天，通常是上线首月的前一天。 */
  openingDate: string;
  lines: readonly OpeningBalanceLineInput[];
  /** ISO 时间戳，注入以保证测试确定性。 */
  now: string;
  createdBy?: string | null;
}

export interface OpeningBalanceSummary {
  voucherId: string;
  openingDate: string;
  period: string;
  totalDebit: string;
  totalCredit: string;
  lineCount: number;
  lines: {
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
  }[];
}

export type OpeningBalanceFailure =
  | {
      code:
        | "OPENING_BALANCE_EMPTY"
        | "OPENING_BALANCE_EXISTS"
        | "PERIOD_LOCKED"
        | "OPENING_DATE_INVALID"
        // checkPostable 也能返回这一档。实际不可达（上面已先校验借贷平衡），
        // 但类型上必须允许 —— 把闸门的返回值窄化掉就等于假装它不会那样返回。
        | "VOUCHER_NOT_BALANCED";
      message: string;
    }
  | {
      code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_NOT_LEAF" | "ACCOUNT_INACTIVE";
      message: string;
      offendingCodes: string[];
    }
  | {
      code: "OPENING_BALANCE_FORBIDDEN_ACCOUNT";
      message: string;
      offendingCodes: string[];
      reason: OpeningBalanceRejection;
    }
  | OpeningBalanceImbalance;

/**
 * 借贷不平。**系统不自动把差额塞进 3141**，只把差额算给用户看。
 *
 * 自动补平会把两种完全不同的情况混为一谈：
 * 1. 用户漏录了一笔 80 万应收账款 —— 差额进 3141，账面平了，但应收账款少了 80 万。
 *    这不是校验，是掩盖。041/042 两次线上错账都是这个模式：错在写入端没拦住，
 *    事后靠 SQL UPDATE 补救。
 * 2. 以前年度累积的未分配利润 —— 这是有确定金额的会计事实，来自上一套账的科目
 *    余额表或上一份审计报告，不是推算出来的塞子。用户手上就有这个数字。
 *
 * 系统能做的是**把差额显式列出来并指出它通常该去哪**，让用户自己判断是漏录还是
 * 未分配利润。这与 B5 资产负债表自检「把差额实时算出来并显式列示」是同一个设计
 * 哲学：让问题可见，而不是静默抹平。
 */
export interface OpeningBalanceImbalance {
  code: "OPENING_BALANCE_NOT_BALANCED";
  message: string;
  totalDebit: string;
  totalCredit: string;
  /** 借方 − 贷方。正数表示贷方少了，负数表示借方少了。 */
  difference: string;
}

export type PostOpeningBalancesResult =
  | { ok: true; summary: OpeningBalanceSummary }
  | { ok: false; failure: OpeningBalanceFailure };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toAmount(value: string | number | null | undefined): number {
  return Number(value ?? 0) || 0;
}

/**
 * 借贷平衡校验（纯函数）。
 *
 * 返回差额而不只是布尔值 —— 用户需要知道差多少才能判断是漏录还是未分配利润。
 */
export function checkOpeningBalanceEquation(
  lines: readonly OpeningBalanceLineInput[]
): OpeningBalanceImbalance | null {
  const totalDebit = lines.reduce((sum, line) => sum + toAmount(line.debit), 0);
  const totalCredit = lines.reduce((sum, line) => sum + toAmount(line.credit), 0);
  const difference = totalDebit - totalCredit;
  if (Math.abs(difference) <= BALANCE_TOLERANCE) {
    return null;
  }
  const side = difference > 0 ? "贷方" : "借方";
  return {
    code: "OPENING_BALANCE_NOT_BALANCED",
    message:
      `期初余额借贷不平：借方合计 ${totalDebit.toFixed(2)}，贷方合计 ${totalCredit.toFixed(2)}，` +
      `${side}少 ${Math.abs(difference).toFixed(2)}。` +
      `系统不会自动补平这个差额 —— 请先确认是漏录了科目余额，还是以前年度累积的` +
      `未分配利润（应录在 ${RETAINED_EARNINGS_CODE} 利润分配）。`,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    difference: difference.toFixed(2)
  };
}

interface AccountMeta {
  code: string;
  name: string;
  account_type: string;
}

/** 期初凭证的主键在公司维度上确定，与 close-period 的 `vch-close-...` 同一套约定。 */
export function openingVoucherId(companyId: string): string {
  return `vch-opening-${companyId}`;
}

export async function findOpeningBalances(
  client: PoolClient,
  companyId: string
): Promise<OpeningBalanceSummary | null> {
  const voucher = await client.query<{ id: string; accounting_date: string; period: string }>(
    `select id, accounting_date, period from vouchers
     where company_id = $1 and source = $2`,
    [companyId, OPENING_BALANCE_SOURCE]
  );
  const row = voucher.rows[0];
  if (!row) return null;

  const entries = await client.query<{
    account_code: string;
    account_name: string;
    debit: string;
    credit: string;
  }>(
    `select account_code, account_name, debit, credit from ledger_entries
     where company_id = $1 and voucher_id = $2 order by account_code`,
    [companyId, row.id]
  );

  let totalDebit = 0;
  let totalCredit = 0;
  for (const entry of entries.rows) {
    totalDebit += Number(entry.debit);
    totalCredit += Number(entry.credit);
  }

  return {
    voucherId: row.id,
    openingDate: row.accounting_date,
    period: row.period,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    lineCount: entries.rows.length,
    lines: entries.rows.map((entry) => ({
      accountCode: entry.account_code,
      accountName: entry.account_name,
      debit: entry.debit,
      credit: entry.credit
    }))
  };
}

/**
 * 录入期初余额：校验 → 落库。必须在事务内调用（传 withTransaction 的 client）。
 *
 * 校验顺序是刻意的 —— 先便宜后昂贵、先结构后账务：
 * 1. 输入形状（日期、非空）
 * 2. 唯一性（已建过账就别白算了）
 * 3. 科目闸门（存在 / 叶子 / 启用），复用 accounts/account-guard
 * 4. 科目语义（损益类与 3131 不得有期初余额）
 * 5. 借贷平衡 + 期间锁（走 ledger-writer 的 checkPostable，与凭证过账同一道闸）
 */
export async function postOpeningBalances(
  client: PoolClient,
  input: PostOpeningBalancesInput
): Promise<PostOpeningBalancesResult> {
  const { companyId, openingDate, now } = input;

  if (!DATE_PATTERN.test(openingDate)) {
    return {
      ok: false,
      failure: { code: "OPENING_DATE_INVALID", message: "建账基准日必须形如 YYYY-MM-DD。" }
    };
  }

  const lines = input.lines.filter(
    (line) => Math.abs(toAmount(line.debit)) > 0 || Math.abs(toAmount(line.credit)) > 0
  );
  if (lines.length === 0) {
    return {
      ok: false,
      failure: {
        code: "OPENING_BALANCE_EMPTY",
        message: "期初余额至少需要一条金额非零的科目余额。"
      }
    };
  }

  const existing = await findOpeningBalances(client, companyId);
  if (existing) {
    return {
      ok: false,
      failure: {
        code: "OPENING_BALANCE_EXISTS",
        message:
          `本公司已在 ${existing.openingDate} 完成期初建账（凭证 ${existing.voucherId}）。` +
          `期初建账是上线时的一次性动作；如需修改请先撤销原期初凭证再重录。`
      }
    };
  }

  const guard = await checkAccountsUsable(companyId, lines, client);
  if (!guard.ok) {
    return {
      ok: false,
      failure: { code: guard.code, message: guard.message, offendingCodes: guard.offendingCodes }
    };
  }

  const codes = [...new Set(lines.map((line) => line.accountCode))];
  const metaRows = await client.query<AccountMeta>(
    `select code, name, account_type from accounts where company_id = $1 and code = any($2::text[])`,
    [companyId, codes]
  );
  const meta = new Map(metaRows.rows.map((row) => [row.code, row]));

  // 按拒绝原因分组，一次把同类问题全报出来 —— 逐条报错会让用户改一个提交一次。
  const rejected = new Map<OpeningBalanceRejection, string[]>();
  for (const code of codes) {
    const reason = rejectOpeningBalance(meta.get(code)!.account_type);
    if (!reason) continue;
    const bucket = rejected.get(reason) ?? [];
    bucket.push(code);
    rejected.set(reason, bucket);
  }
  const firstRejection = [...rejected.entries()][0];
  if (firstRejection) {
    const [reason, offendingCodes] = firstRejection;
    return {
      ok: false,
      failure: {
        code: "OPENING_BALANCE_FORBIDDEN_ACCOUNT",
        reason,
        offendingCodes,
        message: describeOpeningBalanceRejection(reason, offendingCodes)
      }
    };
  }

  const imbalance = checkOpeningBalanceEquation(lines);
  if (imbalance) {
    return { ok: false, failure: imbalance };
  }

  const postingLines = lines.map((line) => ({
    debit: toAmount(line.debit).toFixed(2),
    credit: toAmount(line.credit).toFixed(2)
  }));
  // 与凭证过账、期末结转同一道闸：借贷平衡（此处必过，上面已校验）+ 期间锁。
  // 期间锁在这里是有意义的 —— 建账日所在期间若已锁账，说明账已经开始用了，
  // 此时补录期初余额会静默改写已出过的报表。
  const postable = await checkPostable(client, {
    companyId,
    accountingDate: openingDate,
    lines: postingLines
  });
  if (!postable.ok) {
    return { ok: false, failure: { code: postable.code, message: postable.message } };
  }

  const voucherId = openingVoucherId(companyId);
  const period = openingDate.slice(0, 7);
  // 期初凭证用「记」字。resolveVoucherWord 的入参类型由 vouchers/voucher-number.ts
  // 定义，其中不含 'opening'（该模块本轮属他人车道，不动）—— 'opening' 与 'general'
  // 一样落在默认分支「记」，故用后者取字；voucher_type 列仍如实写 'opening'。
  // 这是一处需要 vouchers/ 配合收尾的地方，已写进交付报告。
  const voucherWord = resolveVoucherWord("general");
  const summary = `期初建账 ${openingDate}`;

  await client.query(
    `insert into vouchers (
       id, company_id, voucher_type, summary, status, source,
       accounting_date, period, voucher_word, voucher_seq,
       posted_at, created_at, updated_at
     ) values (
       $1, $2, 'opening', $3, 'posted', $4,
       $5::date, $6, $7,
       coalesce(
         (select max(v2.voucher_seq) + 1 from vouchers v2
          where v2.company_id = $2 and v2.period = $6 and v2.voucher_word = $7
            and v2.status = 'posted'),
         1
       ),
       $8::timestamptz, now(), now()
     )`,
    [voucherId, companyId, summary, OPENING_BALANCE_SOURCE, openingDate, period, voucherWord, now]
  );

  const resolved = lines.map((line, index) => {
    const account = meta.get(line.accountCode)!;
    return {
      index,
      accountCode: line.accountCode,
      accountName: account.name,
      summary: line.summary?.trim() || summary,
      debit: toAmount(line.debit).toFixed(2),
      credit: toAmount(line.credit).toFixed(2)
    };
  });

  // 凭证分录也写：期初凭证是用户与审计都要翻看的正式凭证，凭证详情页不能是空的。
  // （期末结转凭证目前没写 voucher_lines，那是它自身的遗留问题，不构成先例。）
  for (const line of resolved) {
    await client.query(
      `insert into voucher_lines (id, company_id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9)`,
      [
        `vl-opening-${companyId}-${line.index + 1}`,
        companyId,
        voucherId,
        line.summary,
        line.accountCode,
        line.accountName,
        line.debit,
        line.credit,
        line.index
      ]
    );
  }

  await insertLedgerEntries(
    client,
    resolved.map((line) => ({
      id: `led-opening-${companyId}-${line.index + 1}`,
      companyId,
      voucherId,
      businessEventId: null,
      entryDate: openingDate,
      summary: line.summary,
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: line.debit,
      credit: line.credit,
      source: OPENING_BALANCE_SOURCE,
      postedAt: now
    }))
  );

  const totalDebit = resolved.reduce((sum, line) => sum + Number(line.debit), 0);
  return {
    ok: true,
    summary: {
      voucherId,
      openingDate,
      period,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalDebit.toFixed(2),
      lineCount: resolved.length,
      lines: resolved.map((line) => ({
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: line.debit,
        credit: line.credit
      }))
    }
  };
}

export type DeleteOpeningBalancesResult =
  | { ok: true; voucherId: string }
  | { ok: false; code: "OPENING_BALANCE_NOT_FOUND" | "PERIOD_LOCKED" | "FISCAL_YEAR_CLOSED"; message: string };

/**
 * 撤销期初凭证，让用户可以重录。
 *
 * 建账阶段反复调整是常态（对不上上一套账的科目余额表是家常便饭），所以必须能撤。
 * 但两道闸不能少：
 * - 建账日所在期间已锁账 → 拒绝。已锁的期间意味着账已经出过报表。
 * - 已有任何年度做过年结 → 拒绝。年结把期初的未分配利润滚进了 3141，
 *   此时抽掉期初就会让 3141 的余额失去来源，且已结账年度的报表会被静默改写。
 */
export async function deleteOpeningBalances(
  client: PoolClient,
  companyId: string
): Promise<DeleteOpeningBalancesResult> {
  const existing = await findOpeningBalances(client, companyId);
  if (!existing) {
    return {
      ok: false,
      code: "OPENING_BALANCE_NOT_FOUND",
      message: "本公司还没有期初建账记录。"
    };
  }

  const locked = await client.query<{ is_locked: boolean }>(
    `select is_locked from accounting_periods where company_id = $1 and period = $2`,
    [companyId, existing.period]
  );
  if (locked.rows[0]?.is_locked) {
    return {
      ok: false,
      code: "PERIOD_LOCKED",
      message: `建账期间 ${existing.period} 已锁账，无法撤销期初余额。请先解锁该期间。`
    };
  }

  const closedYear = await client.query<{ year: number }>(
    `select year from fiscal_years where company_id = $1 and status = 'closed' order by year limit 1`,
    [companyId]
  );
  if (closedYear.rows[0]) {
    return {
      ok: false,
      code: "FISCAL_YEAR_CLOSED",
      message:
        `${closedYear.rows[0].year} 年度已做年末结转，期初余额已滚入利润分配，无法撤销。` +
        `如确需修改，请先反结该年度。`
    };
  }

  await client.query(`delete from ledger_entries where company_id = $1 and voucher_id = $2`, [
    companyId,
    existing.voucherId
  ]);
  await client.query(`delete from voucher_lines where company_id = $1 and voucher_id = $2`, [
    companyId,
    existing.voucherId
  ]);
  await client.query(`delete from vouchers where company_id = $1 and id = $2`, [
    companyId,
    existing.voucherId
  ]);

  return { ok: true, voucherId: existing.voucherId };
}
