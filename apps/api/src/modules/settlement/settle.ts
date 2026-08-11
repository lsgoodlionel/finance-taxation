/**
 * 往来核销（V12-C2）。
 *
 * ## 核销不产生凭证
 *
 * 核销是把两笔**已经过账**的分录配对，声明"这笔收款抵的是那笔欠款"。
 * 债权债务在赊销和收款那两张凭证里就已经入账了，核销不改变任何科目余额，
 * 因此不生成凭证、不碰 ledger_entries。它改变的只是"这笔还欠着吗"。
 *
 * 这是 open item 会计的常规做法，也是本模块可以不经审批流的原因 ——
 * 核销记错了，撤销即可，账面数字一分不动。
 *
 * ## 六条拒绝
 *
 * 前四条在这里判，后两条由迁移 063 的触发器兜底（应用层的检查总会被下一个
 * 调用方绕过，触发器不会）：
 * 1. 两条分录必须都在往来科目上
 * 2. 方向必须一发生一核销（两笔欠款互相核销是无意义的）
 * 3. 应收不能拿应付去核销（口径不同，混核会让两张账龄表同时错）
 * 4. 往来单位必须一致 —— 甲的收款抵乙的欠款，两家的余额都会错
 * 5. 核销额不超过欠款余额（触发器）
 * 6. 核销额不超过收款可用额（触发器）
 */

import type { PoolClient } from "pg";
import { fromCents, toCents } from "../../utils/money.js";
import { loadSettlementEntries, type SettlementEntry } from "./settlement-store.js";
import { directionOf } from "./settlement-store.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface SettleInput {
  companyId: string;
  openEntryId: string;
  settleEntryId: string;
  /** 核销金额；不传则按两侧可用余额的较小者全额核销。 */
  amount?: string | number | null;
  settledOn: string;
  createdBy?: string | null;
}

export interface SettleSummary {
  id: string;
  openEntryId: string;
  settleEntryId: string;
  amount: string;
  settledOn: string;
  /** 核销后该笔欠款的剩余余额。 */
  openRemaining: string;
  /** 核销后该笔收付款的剩余可用额。 */
  settleRemaining: string;
}

export type SettleFailure = {
  code:
    | "SETTLE_DATE_INVALID"
    | "ENTRY_NOT_FOUND"
    | "ENTRY_NOT_SETTLEABLE"
    | "SETTLE_SAME_SIDE"
    | "SETTLE_DIRECTION_MISMATCH"
    | "SETTLE_COUNTERPARTY_MISMATCH"
    | "SETTLE_AMOUNT_INVALID"
    | "SETTLE_EXCEEDS_BALANCE"
    | "SETTLE_ALREADY_EXISTS";
  message: string;
};

export type SettleResult = { ok: true; summary: SettleSummary } | { ok: false; failure: SettleFailure };

/** 取两条指定分录的当前状态。走与账龄表同一个取数口径，避免两处判断不一致。 */
async function loadPair(
  client: PoolClient,
  companyId: string,
  ids: readonly string[]
): Promise<Map<string, SettlementEntry>> {
  // asOf 取一个足够远的未来日期：这里要的是分录本身，不做账龄截断。
  const { entries } = await loadSettlementEntries(client, companyId, { asOf: "9999-12-31" });
  return new Map(entries.filter((entry) => ids.includes(entry.entryId)).map((e) => [e.entryId, e]));
}

export async function settleEntries(
  client: PoolClient,
  input: SettleInput
): Promise<SettleResult> {
  const { companyId, openEntryId, settleEntryId, settledOn } = input;

  if (!DATE_PATTERN.test(settledOn)) {
    return {
      ok: false,
      failure: { code: "SETTLE_DATE_INVALID", message: "核销日期必须形如 YYYY-MM-DD。" }
    };
  }
  if (openEntryId === settleEntryId) {
    return {
      ok: false,
      failure: { code: "SETTLE_SAME_SIDE", message: "不能用一笔分录核销它自己。" }
    };
  }

  const pair = await loadPair(client, companyId, [openEntryId, settleEntryId]);
  const open = pair.get(openEntryId);
  const settle = pair.get(settleEntryId);

  if (!open || !settle) {
    const missing = !open ? openEntryId : settleEntryId;
    return {
      ok: false,
      failure: {
        code: "ENTRY_NOT_FOUND",
        message: `找不到可核销的分录 ${missing}（可能不存在、不属于本公司，或不在往来科目上）。`
      }
    };
  }

  if (open.side !== "open") {
    return {
      ok: false,
      failure: {
        code: "SETTLE_SAME_SIDE",
        message: `分录 ${openEntryId} 是核销方而非发生方，两个参数可能填反了。`
      }
    };
  }
  if (settle.side !== "settle") {
    return {
      ok: false,
      failure: {
        code: "SETTLE_SAME_SIDE",
        message: `分录 ${settleEntryId} 是发生方而非核销方，两笔欠款不能互相核销。`
      }
    };
  }

  const openDirection = directionOf(open.accountType);
  const settleDirection = directionOf(settle.accountType);
  if (openDirection !== settleDirection) {
    return {
      ok: false,
      failure: {
        code: "SETTLE_DIRECTION_MISMATCH",
        message:
          `应收与应付不能互相核销（${open.accountCode} 属${openDirection === "receivable" ? "应收" : "应付"}口径，` +
          `${settle.accountCode} 属${settleDirection === "receivable" ? "应收" : "应付"}口径）。` +
          `如需以应付抵应收，应通过债务重组凭证处理，而不是核销。`
      }
    };
  }

  // 无往来单位的两笔可以互核（都是 null），但一有一无就必须拒绝：
  // 那意味着其中一边的往来余额会莫名其妙地少一块。
  if (open.counterpartyId !== settle.counterpartyId) {
    return {
      ok: false,
      failure: {
        code: "SETTLE_COUNTERPARTY_MISMATCH",
        message:
          `往来单位不一致：欠款方为「${open.counterpartyName}」，收付款方为「${settle.counterpartyName}」。` +
          `跨单位核销会让两家的往来余额同时算错。`
      }
    };
  }

  const openRemainingCents = open.originalCents - open.settledCents;
  const settleUsage = await client.query<{ used: string | null }>(
    `select sum(amount)::text as used from ar_ap_settlements
     where company_id = $1 and settle_entry_id = $2`,
    [companyId, settleEntryId]
  );
  const settleRemainingCents = settle.originalCents - toCents(settleUsage.rows[0]?.used);

  // 不传金额时按两侧可用余额的较小者全额核销 —— 这是最常见的操作，
  // 让用户不必自己算"这笔收款还能核多少"。
  const requestedCents =
    input.amount == null
      ? Math.min(openRemainingCents, settleRemainingCents)
      : toCents(input.amount);

  if (!Number.isFinite(requestedCents) || requestedCents <= 0) {
    return {
      ok: false,
      failure: {
        code: "SETTLE_AMOUNT_INVALID",
        message:
          openRemainingCents <= 0 || settleRemainingCents <= 0
            ? `已无可核销余额（欠款剩余 ${fromCents(openRemainingCents)}，收付款可用 ${fromCents(settleRemainingCents)}）。`
            : "核销金额必须大于 0。"
      }
    };
  }
  if (requestedCents > openRemainingCents || requestedCents > settleRemainingCents) {
    return {
      ok: false,
      failure: {
        code: "SETTLE_EXCEEDS_BALANCE",
        message:
          `核销金额 ${fromCents(requestedCents)} 超出可核销余额：` +
          `欠款剩余 ${fromCents(openRemainingCents)}，收付款可用 ${fromCents(settleRemainingCents)}。`
      }
    };
  }

  const existing = await client.query(
    `select 1 from ar_ap_settlements
     where company_id = $1 and open_entry_id = $2 and settle_entry_id = $3`,
    [companyId, openEntryId, settleEntryId]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return {
      ok: false,
      failure: {
        code: "SETTLE_ALREADY_EXISTS",
        message: "这两笔分录之间已存在核销记录。如需调整金额，请先撤销原核销再重做。"
      }
    };
  }

  const id = `stl-${openEntryId}-${settleEntryId}`;
  await client.query(
    `insert into ar_ap_settlements (id, company_id, open_entry_id, settle_entry_id, amount, settled_on, created_by)
     values ($1, $2, $3, $4, $5::numeric, $6::date, $7)`,
    [id, companyId, openEntryId, settleEntryId, fromCents(requestedCents), settledOn, input.createdBy ?? null]
  );

  return {
    ok: true,
    summary: {
      id,
      openEntryId,
      settleEntryId,
      amount: fromCents(requestedCents),
      settledOn,
      openRemaining: fromCents(openRemainingCents - requestedCents),
      settleRemaining: fromCents(settleRemainingCents - requestedCents)
    }
  };
}
