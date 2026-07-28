import type { VoucherDraftLine, VoucherStatus } from "@finance-taxation/domain-model";

/**
 * 红冲（反向凭证）—— 已过账凭证唯一合法的更正出口。
 *
 * 会计上，已入账凭证不得删除、不得原地改写，只能另做一张借贷方向相反的凭证
 * 把它冲平。原凭证与红冲凭证都留在账上，构成可追溯的痕迹。
 *
 * 本模块只做两件与 DB 无关的事：**能不能红冲**、**红冲的分录长什么样**。
 * 红冲凭证生成后仍以 `draft` 落库，走与普通凭证完全相同的审核 → 过账流程 ——
 * 它同样是一笔真实的账务，没有理由绕开职责分离。
 */

export interface ReversalCandidate {
  status: VoucherStatus;
  postedAt: string | null;
  /** 非空表示这张本身就是红冲凭证。 */
  reversesVoucherId: string | null;
  /** 是否已经存在冲销它的红冲凭证（由调用方反查得出）。 */
  alreadyReversed: boolean;
}

export type ReversalErrorCode =
  | "VOUCHER_NOT_POSTED"
  | "VOUCHER_ALREADY_REVERSED"
  | "VOUCHER_IS_REVERSAL";

export interface ReversalVerdict {
  ok: boolean;
  errorCode?: ReversalErrorCode;
  message?: string;
}

export function canReverseVoucher(candidate: ReversalCandidate): ReversalVerdict {
  if (candidate.status !== "posted" || !candidate.postedAt) {
    return {
      ok: false,
      errorCode: "VOUCHER_NOT_POSTED",
      message: "只有已过账的凭证才需要红冲；未过账的凭证直接修改或作废即可。"
    };
  }
  if (candidate.reversesVoucherId) {
    // 红冲的红冲等于把原分录又恢复回来，绕过了「已过账不得改写」的约束。
    // 真要恢复应重新做一张正向凭证并走审核过账，留下完整痕迹。
    return {
      ok: false,
      errorCode: "VOUCHER_IS_REVERSAL",
      message: "红冲凭证本身不能再被红冲。如需恢复原分录，请新建一张正向凭证并走审核过账。"
    };
  }
  if (candidate.alreadyReversed) {
    // 重复红冲会把账冲成反方向，等于凭空造出一笔业务。
    return {
      ok: false,
      errorCode: "VOUCHER_ALREADY_REVERSED",
      message: "该凭证已被红冲，不能重复冲销。"
    };
  }
  return { ok: true };
}

/**
 * 红冲分录的内容，不含 `id` —— 新分录的 id 由落库那一层按红冲凭证 id 生成，
 * 不是这里的职责；带着原分录的 id 传下去只会诱使调用方误用。
 */
export type ReversalLineContent = Omit<VoucherDraftLine, "id">;

/**
 * 生成红冲分录：借贷对调，科目与摘要原样保留。
 *
 * 刻意**不**走 Number 往返：金额以字符串存储，`Number("100.00")` 再转回字符串会
 * 变成 `"100"`，同一张凭证在前端就会出现两种写法；而对调本身也不需要做任何算术。
 */
export function buildReversalLines(
  lines: readonly ReversalLineContent[]
): ReversalLineContent[] {
  return lines.map((line) => ({
    summary: line.summary,
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: line.credit,
    credit: line.debit
  }));
}
