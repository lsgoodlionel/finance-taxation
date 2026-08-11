import type { PoolClient } from "pg";

/**
 * 总账的唯一写入口 —— 让「凭证是唯一入账口径」这个不变式真正成立。
 *
 * ## 为什么需要它
 *
 * 全仓此前有**两处** `insert into ledger_entries`：`postVoucher()` 和
 * `closePeriod()`。后者直接写 `status='posted'` 的凭证并直接插分录，绕过了借贷
 * 平衡校验、状态机、**以及期间锁**——也就是说可以对一个已锁账的期间做结转。
 *
 * 约束散在两处的后果不是「少一道校验」，而是「没人知道到底有几道」。这里把账务
 * 闸门收敛成一个函数，两条路径都过它。
 *
 * ## 职责分离为什么不在这里
 *
 * 「复核人 ≠ 过账人」「执行人 ≠ 终审人」判的是**人的动作**，只对 HTTP 路由有意义。
 * 期末结转是系统按月自动生成的，没有真人可填，硬要给它编一个审核人只会让职责分离
 * 变成走过场。所以那层校验留在 `postVoucher()` 里，本模块只管账务本身对不对。
 */

/** 一条待写入总账的分录。 */
export interface LedgerEntryInput {
  id: string;
  companyId: string;
  voucherId: string;
  /** 期末结转等系统凭证没有业务事项，允许为 null。 */
  businessEventId: string | null;
  /** 会计日期 `YYYY-MM-DD`：这笔账归属的期间，不是过账操作时间。 */
  entryDate: string;
  summary: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  /**
   * 分录来源。四种「谁生成了这条分录」：
   * - `voucher_posting` —— 凭证过账，业务分录
   * - `period_closing` —— 月末结转损益（6xxx → 3131）
   * - `annual_closing` —— 年末结转（3131 → 3141）
   * - `opening_balance` —— 期初建账
   *
   * 后三种是系统生成的、不代表业务发生额的分录。**排除规则并不统一**：损益聚合
   * 要排除 period_closing，但 3131 待结转余额两者都不能排除，账簿列示则一个都不排除。
   * 判断依据见 ledger/closing-entries.ts 与 ledger/closing-sources.ts。
   */
  source: "voucher_posting" | "period_closing" | "annual_closing" | "opening_balance";
  postedAt: string;
  /**
   * 往来核算维度（V12-C2）。可空：绝大多数分录（费用、税金、结转）没有往来单位。
   * 往来科目上缺了它，这笔就进不了账龄表——由 settlement 模块按 account_type
   * 判断该不该有，这里不强制，否则结转凭证也得编一个假值。
   */
  counterpartyId?: string | null;
  /**
   * 成本中心维度（V12-D1）。可空，理由同 counterpartyId：绝大多数分录
   * （银行存款、应交税费、实收资本）不属于任何部门。
   */
  costCenterId?: string | null;
}

export interface PostabilityInput {
  companyId: string;
  /** 会计日期，用于判定期间锁。 */
  accountingDate: string;
  lines: readonly { debit: string; credit: string }[];
}

export type PostabilityVerdict =
  | { ok: true }
  | { ok: false; code: "VOUCHER_NOT_BALANCED" | "PERIOD_LOCKED"; message: string };

/** 借贷相等的判定容差。金额是 numeric(18,2)，半分钱的误差已经不可能来自正常数据。 */
const BALANCE_TOLERANCE = 0.0001;

function sum(lines: readonly { debit: string; credit: string }[], side: "debit" | "credit"): number {
  return lines.reduce((total, line) => total + Number(line[side] || 0), 0);
}

/**
 * 账务闸门：这批分录能不能入账。
 *
 * 两条判定都必须在**同一个事务**内做，且要在插入分录之前——期间锁尤其如此，
 * 否则并发锁账与过账之间存在窗口。
 */
export async function checkPostable(
  client: PoolClient,
  input: PostabilityInput
): Promise<PostabilityVerdict> {
  const debit = sum(input.lines, "debit");
  const credit = sum(input.lines, "credit");
  if (Math.abs(debit - credit) > BALANCE_TOLERANCE) {
    return {
      ok: false,
      code: "VOUCHER_NOT_BALANCED",
      message: `借贷不平：借方 ${debit.toFixed(2)}，贷方 ${credit.toFixed(2)}`
    };
  }

  // 期间取自会计日期而非当前月 —— 6 月的账 7 月过，要判 6 月的锁。
  const period = input.accountingDate.slice(0, 7);
  const locked = await client.query<{ is_locked: boolean }>(
    `select is_locked from accounting_periods where company_id = $1 and period = $2`,
    [input.companyId, period]
  );
  if (locked.rows[0]?.is_locked) {
    return {
      ok: false,
      code: "PERIOD_LOCKED",
      message: `会计期间 ${period} 已锁账，无法入账。请先解锁该期间。`
    };
  }

  return { ok: true };
}

/**
 * 写入总账分录。**这是全仓唯一允许 insert ledger_entries 的地方。**
 *
 * 调用前必须先过 {@link checkPostable}——本函数不重复校验，因为校验需要在调用方的
 * 事务语境里尽早失败（避免先删旧分录再发现不能写的情况）。
 */
export async function insertLedgerEntries(
  client: PoolClient,
  entries: readonly LedgerEntryInput[]
): Promise<void> {
  for (const entry of entries) {
    await client.query(
      `
        insert into ledger_entries (
          id, company_id, voucher_id, business_event_id, entry_date, summary,
          account_code, account_name, debit, credit, source, posted_at, counterparty_id, cost_center_id
        ) values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9::numeric, $10::numeric, $11, $12::timestamptz, $13, $14)
      `,
      [
        entry.id,
        entry.companyId,
        entry.voucherId,
        entry.businessEventId,
        entry.entryDate,
        entry.summary,
        entry.accountCode,
        entry.accountName,
        entry.debit,
        entry.credit,
        entry.source,
        entry.postedAt,
        entry.counterpartyId ?? null,
        entry.costCenterId ?? null
      ]
    );
  }
}
