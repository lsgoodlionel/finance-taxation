/**
 * 预算校验（V13-A3）。
 *
 * ## 为什么需要「已占用」这个数
 *
 * 预算控制上有三个数：**预算额、已占用、已实际发生**。
 *
 * 只记实际发生数是最常见的错法：三个人各自申请 8 万，预算 10 万，逐张单子看都
 * 没超（因为钱还没花出去，实际发生额是 0），全部批准后实际超支 14 万。
 *
 * 占用（encumbrance）堵的正是这个洞——申请通过时钱还没花，但**已经不能给别人用了**。
 * 这是会计上 encumbrance accounting 的标准做法，不是 FT 的发明。
 *
 * ## 口径：占用与实际发生互斥，不重复计
 *
 * 单据流转时占用状态从 `reserved` 变成 `realized`，同时账上出现实际发生额。
 * **`realized` 的占用不再计入 `encumberedCents`**，否则同一笔钱会被算两遍。
 * 这个转换由占用台账负责，本函数只对传入的三个数负责。
 *
 * ## 差额不凑平
 *
 * 可用额度允许为负并照实返回。存量已经超支时，即便本次申请 0 元也报超支——
 * 这与期初建账、试算平衡、余额调节表的处理一致：报出差额并指出成因，不自动抹平。
 */

import type { ControlCheckResult } from "../controls/result.js";

/** 超支时怎么办。`escalate`（加签）属于审批流的范畴，不在预算控制这一层。 */
export type BudgetControlPolicy = "block" | "warn";

export interface BudgetCheckInput {
  /** 预算额（分）。 */
  budgetCents: number;
  /** 已占用（分）：审批通过但尚未落账的单据合计，不含已转实际的部分。 */
  encumberedCents: number;
  /** 已实际发生（分）：已落账的金额。 */
  actualCents: number;
  /** 本次申请金额（分）。 */
  requestCents: number;
  /** 超支时的处理策略。 */
  policy: BudgetControlPolicy;
}

/**
 * 预算校验结果。
 *
 * 继承公共形状（`level` / `code` / `message`）让审批流引擎只认一种结构，
 * 三个金额字段是预算特有的——UI 要用它们显示「预算 / 已占用 / 已发生」的构成。
 *
 * 注意 `level` 永远不会是 `escalate`：预算超支要么拦要么提示，加签是费用超标
 * 那条线的处理方式（见 expense-standards/match.ts 的 `overPolicy`）。
 */
export interface BudgetCheckResult extends ControlCheckResult {
  /** 本次申请**前**的可用额度（分），可能为负。 */
  availableCents: number;
  /** 本次申请**后**的可用额度（分），可能为负。 */
  remainingCents: number;
  /** 超支金额（分）；未超支为 0。 */
  overrunCents: number;
}

/** 分 → 元的展示串。只用于消息文案，不参与计算。 */
function yuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

function assertCents(value: number, label: string, allowZeroOnly: boolean): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} 必须是整数分，收到 ${value}`);
  }
  if (allowZeroOnly && value < 0) {
    throw new Error(`${label} 不得为负，收到 ${value}`);
  }
}

/**
 * 判断一次支出申请是否在预算内。
 *
 * 纯函数：不查库、不写库。占用台账的读取与写入由调用方负责，这样同一套判断
 * 既能用在申请提交时的预检，也能用在审批通过时的正式占用，两处不会走岔。
 */
export function checkBudget(input: BudgetCheckInput): BudgetCheckResult {
  const { budgetCents, encumberedCents, actualCents, requestCents, policy } = input;

  // 先校验再计算：NaN 参与算术不会抛错，只会让结果静默变成 NaN，
  // 然后以「可用额度 NaN」的形式出现在用户界面上。
  assertCents(budgetCents, "预算额", true);
  assertCents(encumberedCents, "已占用", true);
  assertCents(actualCents, "已实际发生", true);
  assertCents(requestCents, "申请金额", true);

  const usedCents = encumberedCents + actualCents;
  const availableCents = budgetCents - usedCents;
  const remainingCents = availableCents - requestCents;

  // 恰好用完（remaining === 0）不算超支：花完预算是正常经营行为。
  if (remainingCents >= 0) {
    return {
      level: "ok",
      availableCents,
      remainingCents,
      overrunCents: 0,
      code: "budget.ok",
      message:
        `预算 ${yuan(budgetCents)} 元，已用 ${yuan(usedCents)} 元` +
        `（占用 ${yuan(encumberedCents)} + 已发生 ${yuan(actualCents)}），` +
        `本次 ${yuan(requestCents)} 元后剩余 ${yuan(remainingCents)} 元。`
    };
  }

  const overrunCents = -remainingCents;
  return {
    level: policy === "block" ? "block" : "warn",
    availableCents,
    remainingCents,
    overrunCents,
    code: "budget.overrun",
    message:
      `预算 ${yuan(budgetCents)} 元，已用 ${yuan(usedCents)} 元` +
      `（占用 ${yuan(encumberedCents)} + 已发生 ${yuan(actualCents)}），` +
      `本次 ${yuan(requestCents)} 元将超支 ${yuan(overrunCents)} 元。`
  };
}
