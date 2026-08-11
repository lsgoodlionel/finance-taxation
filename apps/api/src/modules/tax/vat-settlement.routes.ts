import type { ServerResponse } from "node:http";
import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { checkAccountsUsable } from "../accounts/account-guard.js";
import { checkPostable } from "../vouchers/ledger-writer.js";
import { listCompanyTaxpayerProfiles } from "./routes.js";
import { resolveActiveTaxpayerProfile } from "./profile.js";
import { resolveVatAccounts, VAT_COLUMN_ROLES } from "./vat-accounts.js";
import type { VatAccountMap } from "./vat-accounts.js";
import {
  buildNotApplicablePlan,
  buildVatSettlementPlan,
  resolveVatSettlementApplicability
} from "./vat-settlement.js";
import type { VatSettlementBasis, VatSettlementPlan } from "./vat-settlement.js";

/**
 * 月末「结转未交增值税」的落库与 HTTP 入口（V12-B8 / 蓝图 F4）。
 *
 * 账务判定全在 `vat-settlement.ts`（纯函数），本文件只负责三件事：
 * 取数、幂等、把方案写成一张**草稿**凭证。
 *
 * ## 为什么是草稿，不自动过账
 *
 * FT 有职责分离校验（复核人 ≠ 过账人、执行人 ≠ 终审人）。系统自动过账会绕过
 * 复核，等于给自己开了一个不受监督的入账口。红冲（vouchers/reversal.ts）与
 * 期末结转损益都遵循同一条：生成 draft，由人走审核 → 过账。
 *
 * 因此本模块**不写 ledger_entries**，只写 vouchers + voucher_lines。
 */

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

interface PeriodRange {
  label: string;
  start: string;
  end: string;
}

/** 把 `YYYY-MM` 展开成期间起止日。用 UTC 构造，避免本地时区把月末推到上月。 */
function resolvePeriodRange(periodLabel: string): PeriodRange | null {
  if (!PERIOD_PATTERN.test(periodLabel)) return null;
  const year = Number(periodLabel.slice(0, 4));
  const month = Number(periodLabel.slice(5, 7));
  // Date.UTC 的 day=0 取的是上个月的最后一天，故传 month（1-based）即得本月末。
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    label: periodLabel,
    start: `${periodLabel}-01`,
    end: `${periodLabel}-${String(lastDay).padStart(2, "0")}`
  };
}

function settlementVoucherId(companyId: string, periodLabel: string): string {
  return `vch-vat-${companyId}-${periodLabel}`;
}

/**
 * 取轧差所需的三个数。
 *
 * 专栏取**累计**（`entry_date <= 期末`），已交税金取**本期发生额**。
 * 两种口径的理由见 vat-settlement.ts 的 VatSettlementBasis 注释 ——
 * 混用任何一个都会算错留抵或多缴。
 */
async function loadSettlementBasis(
  companyId: string,
  accounts: VatAccountMap,
  period: PeriodRange
): Promise<VatSettlementBasis> {
  const columnCodes = VAT_COLUMN_ROLES.map((role) => accounts[role].code);

  const [columnRow, paidRow, prepaidRow] = await Promise.all([
    queryOne<{ net: string }>(
      `select coalesce(sum(credit - debit), 0)::text as net
       from ledger_entries
       where company_id = $1 and account_code = any($2::text[]) and entry_date <= $3::date`,
      [companyId, columnCodes, period.end]
    ),
    queryOne<{ paid: string }>(
      `select coalesce(sum(debit - credit), 0)::text as paid
       from ledger_entries
       where company_id = $1 and account_code = $2
         and entry_date >= $3::date and entry_date <= $4::date`,
      [companyId, accounts.taxPaid.code, period.start, period.end]
    ),
    queryOne<{ balance: string }>(
      `select coalesce(sum(debit - credit), 0)::text as balance
       from ledger_entries
       where company_id = $1 and account_code = $2 and entry_date <= $3::date`,
      [companyId, accounts.prepaid.code, period.end]
    )
  ]);

  return {
    columnNetCredit: Number(columnRow?.net ?? 0),
    taxPaidInPeriod: Number(paidRow?.paid ?? 0),
    prepaidBalance: Number(prepaidRow?.balance ?? 0)
  };
}

interface SettlementVoucherRow {
  id: string;
  status: string;
  period: string;
}

/** 本公司已经存在的结转凭证，按会计期间升序。 */
async function listSettlementVouchers(companyId: string): Promise<SettlementVoucherRow[]> {
  return query<SettlementVoucherRow>(
    `select id, status, to_char(accounting_date, 'YYYY-MM') as period
     from vouchers
     where company_id = $1 and source = 'vat_settlement'
     order by accounting_date asc`,
    [companyId]
  );
}

type PreparedSettlement =
  | { ok: true; plan: VatSettlementPlan; accounts: VatAccountMap | null; period: PeriodRange }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * 判定 + 取数，preview 与 create 共用。
 *
 * `accounts` 为 null 表示这家纳税人身份用不上结转（方案里也不会有分录）。
 */
async function prepareSettlement(
  companyId: string,
  periodLabel: string | null
): Promise<PreparedSettlement> {
  if (!periodLabel) {
    return { ok: false, status: 400, body: { error: "period is required", code: "PERIOD_REQUIRED" } };
  }
  const period = resolvePeriodRange(periodLabel);
  if (!period) {
    return {
      ok: false,
      status: 400,
      body: { error: `期间格式应为 YYYY-MM，收到：${periodLabel}`, code: "PERIOD_INVALID" }
    };
  }

  const profiles = await listCompanyTaxpayerProfiles(companyId);
  const profile = resolveActiveTaxpayerProfile(profiles, period.end);
  if (!profile) {
    return {
      ok: false,
      status: 404,
      body: {
        error: `${period.label} 没有生效的纳税人身份记录，无法判定增值税结转口径。`,
        code: "TAXPAYER_PROFILE_NOT_FOUND"
      }
    };
  }

  const applicability = resolveVatSettlementApplicability(profile.taxpayerType);
  if (!applicability.applicable) {
    return { ok: true, plan: buildNotApplicablePlan(applicability.reason), accounts: null, period };
  }

  const resolution = await resolveVatAccounts(companyId);
  if (!resolution.ok) {
    return {
      ok: false,
      status: 409,
      body: { error: resolution.message, code: resolution.code, missingRoles: resolution.missingRoles }
    };
  }

  const basis = await loadSettlementBasis(companyId, resolution.accounts, period);
  const plan = buildVatSettlementPlan(basis, resolution.accounts, period.label);
  return { ok: true, plan, accounts: resolution.accounts, period };
}

interface BlockedReason {
  error: string;
  code: string;
}

interface InsertDraftInput {
  companyId: string;
  voucherId: string;
  summary: string;
  period: PeriodRange;
  plan: VatSettlementPlan;
  now: string;
}

/** Postgres 唯一约束冲突。 */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * 把结转方案写成一张草稿凭证。返回非 null 表示被闸门拦下，什么都没写。
 *
 * 凭证 id 由 (公司, 期间) 决定，因此并发重复提交时数据库的主键会兜住 ——
 * 应用层的「已存在」检查与插入之间没有锁，靠 id 而不是靠时序保证唯一。
 */
async function insertSettlementDraft(input: InsertDraftInput): Promise<BlockedReason | null> {
  const { companyId, voucherId, summary, period, plan, now } = input;
  try {
    return await withTransaction(async (client: PoolClient) => {
      // 借贷平衡与期间锁走与过账完全相同的闸门。草稿本可以晚点再判，但对一个已锁账
      // 的期间生成结转草稿只会在过账时失败，不如现在就说清楚。
      const postable = await checkPostable(client, {
        companyId,
        accountingDate: period.end,
        lines: plan.lines
      });
      if (!postable.ok) {
        return { error: postable.message, code: postable.code };
      }

      // 凭证字号在过账那一刻才分配（草稿不占号，否则删草稿会留断号），故此处
      // 不写 voucher_word / voucher_seq / period。
      await client.query(
        `insert into vouchers (
           id, company_id, business_event_id, mapping_id, voucher_type, summary,
           status, source, accounting_date, created_at, updated_at
         ) values ($1, $2, null, null, 'adjustment', $3, 'draft', 'vat_settlement',
                   $4::date, $5::timestamptz, $5::timestamptz)`,
        [voucherId, companyId, summary, period.end, now]
      );

      for (const [index, line] of plan.lines.entries()) {
        await client.query(
          `insert into voucher_lines (
             id, voucher_id, summary, account_code, account_name, debit, credit, sort_order
           ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)`,
          [
            `${voucherId}-line-${index + 1}`,
            voucherId,
            line.summary,
            line.accountCode,
            line.accountName,
            line.debit,
            line.credit,
            index
          ]
        );
      }
      return null;
    });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return {
        error: `${period.label} 的增值税结转凭证已存在（${voucherId}）。`,
        code: "VAT_SETTLEMENT_ALREADY_EXISTS"
      };
    }
    throw error;
  }
}

/**
 * 预览本期结转结果，不落库。
 *
 * `GET /api/tax/vat-settlement?period=YYYY-MM`
 */
export async function previewVatSettlement(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const companyId = req.auth!.companyId;
  const prepared = await prepareSettlement(companyId, url.searchParams.get("period"));
  if (!prepared.ok) {
    return json(res, prepared.status, prepared.body);
  }

  const existing = (await listSettlementVouchers(companyId)).find(
    (row) => row.period === prepared.period.label
  );
  return json(res, 200, {
    companyId,
    period: prepared.period.label,
    ...prepared.plan,
    existingVoucherId: existing?.id ?? null,
    existingVoucherStatus: existing?.status ?? null
  });
}

/**
 * 生成结转凭证草稿。
 *
 * `POST /api/tax/vat-settlement` body: `{ period: "YYYY-MM" }`
 */
export async function createVatSettlementVoucher(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const body = (req.body || {}) as { period?: string };
  const prepared = await prepareSettlement(companyId, body.period ?? null);
  if (!prepared.ok) {
    return json(res, prepared.status, prepared.body);
  }
  const { plan, period } = prepared;

  const settlementVouchers = await listSettlementVouchers(companyId);
  const existing = settlementVouchers.find((row) => row.period === period.label);
  if (existing) {
    return json(res, 409, {
      error: `${period.label} 的增值税结转凭证已存在（${existing.id}，状态 ${existing.status}）。`,
      code: "VAT_SETTLEMENT_ALREADY_EXISTS",
      voucherId: existing.id
    });
  }

  // 往期结转还挂在草稿上时不能结本期。取数只看已过账的总账分录，往期那张草稿的
  // 金额还没进总账，于是本期的累计余额里仍含着往期该缴的税 —— 照结会把两个月的
  // 税并成一张，等往期那张也过账时就重复了。
  const stalePrior = settlementVouchers.find(
    (row) => row.status !== "posted" && row.period <= period.label
  );
  if (stalePrior) {
    return json(res, 409, {
      error:
        `${stalePrior.period} 的增值税结转凭证（${stalePrior.id}）尚未过账，` +
        `本期结转取数会把该期税额重复计入。请先完成该凭证的审核过账。`,
      code: "VAT_SETTLEMENT_PRIOR_PENDING",
      voucherId: stalePrior.id
    });
  }

  if (plan.lines.length === 0) {
    // 留抵 / 轧平 / 不适用 —— 都不该产生凭证。返回 200 而不是错误：什么都不用做
    // 本身就是正确结果，报错会让月结向导以为出了问题。
    return json(res, 200, {
      companyId,
      period: period.label,
      ...plan,
      voucherId: null
    });
  }

  const accountRefs = plan.lines.map((line) => ({
    accountCode: line.accountCode,
    accountName: line.accountName
  }));
  const accountGuard = await checkAccountsUsable(companyId, accountRefs);
  if (!accountGuard.ok) {
    return json(res, 400, { error: accountGuard.message, code: accountGuard.code });
  }

  const voucherId = settlementVoucherId(companyId, period.label);
  const now = new Date().toISOString();
  const summary = `结转未交增值税 ${period.label}`;

  const blocked = await insertSettlementDraft({ companyId, voucherId, summary, period, plan, now });
  if (blocked) {
    return json(res, 409, blocked);
  }

  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "create",
    resourceType: "voucher",
    resourceId: voucherId,
    resourceLabel: summary,
    changes: {
      data: {
        period: period.label,
        outcome: plan.outcome,
        payableAmount: plan.payableAmount,
        overpaidAmount: plan.overpaidAmount,
        creditCarriedForward: plan.creditCarriedForward,
        prepaidTransferred: plan.prepaidTransferred
      }
    }
  });

  return json(res, 201, {
    companyId,
    period: period.label,
    ...plan,
    voucherId,
    status: "draft"
  });
}
