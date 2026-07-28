/**
 * 重新分析经营事项前的账务安全闸门。
 *
 * `POST /api/events/:id/analyze` 会把该事项派生出的全部产物删掉重建，其中包括
 * `ledger_entries` / `ledger_posting_batches` / `voucher_posting_records` /
 * `vouchers`。对已过账的凭证来说这是**物理销毁会计档案**：准则下已入账凭证只能
 * 红冲（生成反向凭证），不得删除；已锁账期间更不得被任何路径改写。
 *
 * 这里只做纯裁决，IO（查已过账凭证、查期间锁定状态）留在调用方，便于单测覆盖
 * 边界而不需要数据库。
 */

export type AnalyzeBlockCode = "EVENT_HAS_POSTED_VOUCHERS" | "EVENT_PERIOD_LOCKED";

export interface AnalyzeGuardInput {
  /**
   * 该事项下状态为 posted **且尚未被红冲**的凭证 id。
   *
   * 已被红冲（存在一张已过账的反向凭证指向它）的凭证账务影响已归零，不构成阻断 ——
   * 否则财务红冲完了事项依然打不开，等于没有出口。口径由调用方的取数保证。
   */
  readonly postedVoucherIds: readonly string[];
  /** 该事项分录（`ledger_entries.entry_date`）所属、且已锁账的会计期间（YYYY-MM）。 */
  readonly lockedPeriods: readonly string[];
}

export interface AnalyzeGuardBlocked {
  readonly allowed: false;
  readonly code: AnalyzeBlockCode;
  readonly message: string;
  readonly postedVoucherIds: readonly string[];
  readonly lockedPeriods: readonly string[];
}

export type AnalyzeGuardVerdict = { readonly allowed: true } | AnalyzeGuardBlocked;

function blocked(
  code: AnalyzeBlockCode,
  message: string,
  input: AnalyzeGuardInput
): AnalyzeGuardBlocked {
  return {
    allowed: false,
    code,
    message,
    // 复制而非引用调用方数组：裁决一旦产出就不应随外部数据变化。
    postedVoucherIds: [...input.postedVoucherIds],
    lockedPeriods: [...input.lockedPeriods]
  };
}

export function evaluateAnalyzeGuard(input: AnalyzeGuardInput): AnalyzeGuardVerdict {
  if (input.postedVoucherIds.length > 0) {
    return blocked(
      "EVENT_HAS_POSTED_VOUCHERS",
      `该事项已有 ${input.postedVoucherIds.length} 张凭证过账，不能重新分析（重新分析会删除已入账分录）。` +
        "已入账凭证只能红冲：对每张凭证调用 POST /api/vouchers/:id/reverse 生成反向凭证，" +
        "经审核过账后即可重新分析。",
      input
    );
  }

  if (input.lockedPeriods.length > 0) {
    return blocked(
      "EVENT_PERIOD_LOCKED",
      `该事项的分录落在已锁账期间 ${input.lockedPeriods.join("、")}，不能重新分析。请先解锁该期间。`,
      input
    );
  }

  return { allowed: true };
}
