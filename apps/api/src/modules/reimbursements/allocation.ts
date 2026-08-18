/**
 * 费用分摊：一行费用拆给多个部门（V13-B7）。
 *
 * ## 整数分 + 末项扫尾
 *
 * 与外币分摊（`currency/foreign-allocation.ts`）、折旧排程、加速折旧扫尾
 * 是同一套做法：按比例截断算出各项，把除不尽的余数留给最后一项。
 *
 * 每项独立四舍五入的后果不是「差一分」——1000 元分三份各四舍五入得到
 * 333.33×3 = 999.99，凭空少一分，而分摊结果最终要变成凭证的多行分录，
 * 少一分就是借贷不平、过不了账。
 *
 * ## 两种录入方式
 *
 * - `allocateByRatio`：用户填比例（研发部 60%、市场部 40%）
 * - `allocateByAmount`：用户直接填金额
 *
 * 两者都返回比例与金额**两个字段**。比例存下来是为了金额变更时能重算——
 * 只存金额的话，报销行从 1000 改成 1200 后没人知道该怎么重新拆。
 */

/** 比例用基点（1/10000）表达，避免小数。100% = 10000。 */
export const TOTAL_BASIS_POINTS = 10000;

export interface AllocationInput {
  costCenterId: string;
  ratioBp: number;
}

export interface AllocationAmountInput {
  costCenterId: string;
  amountCents: number;
}

export interface AllocationResult {
  costCenterId: string;
  ratioBp: number;
  amountCents: number;
}

function assertTotalCents(totalCents: number): void {
  if (!Number.isInteger(totalCents)) {
    throw new Error(`分摊总额必须是整数分，收到 ${totalCents}`);
  }
  if (totalCents < 0) {
    throw new Error(`分摊总额不得为负，收到 ${totalCents}`);
  }
}

function assertNoDuplicates(costCenterIds: readonly string[]): void {
  if (new Set(costCenterIds).size !== costCenterIds.length) {
    // 合并重复项是在替用户猜意图。同一个部门出现两行是配置错误，
    // 而报表上「它被分了两次」比报错难查得多。
    throw new Error("分摊中出现重复的成本中心");
  }
}

/**
 * 按比例分摊。
 *
 * 比例合计必须恰好是 10000 基点：不足会让一部分费用无声地不归任何部门，
 * 超过会让分摊金额大于报销金额。
 */
export function allocateByRatio(
  totalCents: number,
  shares: readonly AllocationInput[]
): AllocationResult[] {
  assertTotalCents(totalCents);
  if (shares.length === 0) {
    // 没有分摊对象时应当整笔归「未指定」，由调用方显式处理——
    // 在这里返回空数组会让「不分摊」和「分摊给零个部门」变成同一件事。
    throw new Error("分摊至少一项");
  }
  assertNoDuplicates(shares.map((item) => item.costCenterId));

  let sumBp = 0;
  for (const share of shares) {
    if (!Number.isInteger(share.ratioBp) || share.ratioBp <= 0) {
      throw new Error(`分摊比例必须为正整数基点，收到 ${share.ratioBp}`);
    }
    sumBp += share.ratioBp;
  }
  if (sumBp !== TOTAL_BASIS_POINTS) {
    throw new Error(`分摊比例合计必须是 ${TOTAL_BASIS_POINTS} 基点（100%），收到 ${sumBp}`);
  }

  const results: AllocationResult[] = [];
  let allocated = 0;
  for (const [index, share] of shares.entries()) {
    const isLast = index === shares.length - 1;
    // 末项扫尾：把除不尽的余数留给最后一项，而不是让各项四舍五入后总额飘走。
    const amountCents = isLast
      ? totalCents - allocated
      : Math.floor((totalCents * share.ratioBp) / TOTAL_BASIS_POINTS);
    allocated += amountCents;
    results.push({ costCenterId: share.costCenterId, ratioBp: share.ratioBp, amountCents });
  }
  return results;
}

/**
 * 按金额分摊：用户直接填每个部门多少钱。
 *
 * 合计不符**直接拒绝，不自动调平**——把差额塞给某一行是在替用户改数字，
 * 他填错了应当知道，而不是过后发现凭证上的部门金额与自己填的不一样。
 */
export function allocateByAmount(
  totalCents: number,
  shares: readonly AllocationAmountInput[]
): AllocationResult[] {
  assertTotalCents(totalCents);
  if (shares.length === 0) {
    throw new Error("分摊至少一项");
  }
  assertNoDuplicates(shares.map((item) => item.costCenterId));

  let sum = 0;
  for (const share of shares) {
    if (!Number.isInteger(share.amountCents) || share.amountCents < 0) {
      throw new Error(`分摊金额必须是非负整数分，收到 ${share.amountCents}`);
    }
    sum += share.amountCents;
  }
  if (sum !== totalCents) {
    throw new Error(`分摊金额合计 ${sum} 与总额 ${totalCents} 不符`);
  }

  // 反算比例，供金额变更时重算用。同样末项扫尾——比例合计也必须恰好
  // 是 10000，否则下次按比例重算时会撞上「合计必须是 10000」的校验。
  const results: AllocationResult[] = [];
  let allocatedBp = 0;
  for (const [index, share] of shares.entries()) {
    const isLast = index === shares.length - 1;
    const ratioBp = isLast
      ? TOTAL_BASIS_POINTS - allocatedBp
      : totalCents === 0
        ? 0
        : Math.floor((share.amountCents * TOTAL_BASIS_POINTS) / totalCents);
    allocatedBp += ratioBp;
    results.push({
      costCenterId: share.costCenterId,
      ratioBp,
      amountCents: share.amountCents
    });
  }
  return results;
}
