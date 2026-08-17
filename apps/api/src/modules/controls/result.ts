/**
 * 业财合规校验的公共结果形状（V13）。
 *
 * ## 为什么现在就抽出来
 *
 * V13 会有六类校验：预算（A3）、费用超标（A1）、重复报销、票据合规、三单匹配、
 * 业务合理性（均在批次 D）。它们判断的东西毫不相干，但**去向相同**——审批流
 * 引擎（A5）要根据校验结果决定拦截、提示还是加签。
 *
 * 引擎只应该认识一种形状。六个校验各返回各的结构，引擎就得为每一种写一个分支，
 * 而每加一类校验就要再改引擎一次。所以这个抽象不是投机的——重复是确定会发生的，
 * 且已经有明确的消费方。
 *
 * ## 与 RiskFinding 的关系：形似而不复用
 *
 * `RiskFinding`（domain-model）带 `id / companyId / status / createdAt` 等
 * 持久化字段，是**存下来的风险记录**。这里的校验结果是**当场算出来的判断**，
 * 多数根本不落库。硬套 RiskFinding 会逼着每个纯函数编造一堆无意义的 id 与时间戳。
 *
 * 两者的共同点（一个级别、一个机器可读的码、一句人话）保持命名一致即可，
 * 需要把校验结果沉淀为风险记录时再做一次显式转换。
 */

/**
 * 校验级别，按严厉程度递增。
 *
 * - `ok`：通过；
 * - `warn`：提示，不阻断提交，审批人可见；
 * - `escalate`：放行但**多加一级审批**，由审批流引擎接手；
 * - `block`：拦截提交。
 *
 * `escalate` 排在 `block` 之前：它比单纯提示重，但仍然允许业务继续走——
 * 现实中「超标可以报，但要老板点头」远比「一律不许报」常见。
 */
export type ControlLevel = "ok" | "warn" | "escalate" | "block";

const LEVEL_ORDER: Record<ControlLevel, number> = { ok: 0, warn: 1, escalate: 2, block: 3 };

export interface ControlCheckResult {
  level: ControlLevel;
  /** 稳定的机器可读标识，如 `budget.overrun`。用于测试断言与前端分支，不做展示。 */
  code: string;
  /** 面向用户的说明，应当自带判断依据，不要只说结论。 */
  message: string;
}

/** 是否阻断提交。只有 `block` 阻断——`escalate` 是加签不是拦截。 */
export function isBlocking(result: ControlCheckResult): boolean {
  return result.level === "block";
}

/**
 * 一组校验里最严厉的级别；空数组返回 `ok`。
 *
 * 审批流引擎用它把多条校验收敛成一个动作：任一条 `block` 就拦，
 * 没有 block 但有 `escalate` 就加签。
 */
export function highestLevel(results: readonly ControlCheckResult[]): ControlLevel {
  return results.reduce<ControlLevel>(
    (worst, item) => (LEVEL_ORDER[item.level] > LEVEL_ORDER[worst] ? item.level : worst),
    "ok"
  );
}
