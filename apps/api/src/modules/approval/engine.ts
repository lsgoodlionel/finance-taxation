/**
 * 审批流引擎（V13-A5）。
 *
 * ## 范围是刻意卡死的
 *
 * 做：**串行多级 + 按金额分级 + 驳回到发起人 + 抄送**。
 *
 * 不做：会签 / 或签 / 动态加签 / 流程图可视化编辑器 / 驳回到任意中间节点。
 * 理由见 docs/v13-expense-control-blueprint-and-plan.md 第五节——全功能 BPM
 * 是个无底洞，而上面这几样覆盖中小企业 90% 的场景。
 *
 * 实施中若发现某个场景非会签不可，**停下来记入残留清单，不要顺手加**：
 * 会签会把「当前步骤」从一个数字变成一个集合，这里每一个函数都要改。
 *
 * ## 纯函数
 *
 * 不查库、不写库。同一套判断既用在提交时的预演（前端要显示「这单要几个人批」），
 * 也用在实际审批时的推进，两处不会走岔。
 */

/** 审批人的指定方式。`manager` 表示「发起人的直属上级」，运行时解析。 */
export type ApproverType = "role" | "user" | "manager";

export interface ApprovalStepDef {
  /** 步骤序号，决定顺序。允许不连续。 */
  stepOrder: number;
  approverType: ApproverType;
  /** role 时是角色码，user 时是用户 id，manager 时忽略。 */
  approverValue: string;
  /**
   * 触发本步骤的最小金额（分）。
   *
   * **达到即触发**（`>=`）而不是超过：制度写「1 万以上需财务审批」，
   * 1 万整就该走财务。用 `>` 会让恰好 1 万的单据少一级审批，而整数金额
   * 恰恰是最常见的。
   */
  minAmountCents: number;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ApprovalInstanceState {
  status: ApprovalStatus;
  /** 当前待办步骤；已结束时为 null。 */
  currentStepOrder: number | null;
  /** 本实例实际需要的步骤序号，提交时按金额算定后固定下来。 */
  requiredStepOrders: readonly number[];
}

export type ApprovalAction =
  | { action: "approve"; stepOrder: number }
  | { action: "reject"; stepOrder: number }
  | { action: "cancel" };

/**
 * 按金额算出实际需要走的步骤。
 *
 * 结果在**提交时固定下来**存进实例，而不是每次审批重算——单据金额在审批
 * 过程中可能被改（驳回后修改再提交），重算会让已经批过的步骤凭空消失或
 * 多出没人批过的步骤。金额变了就重新提交、重新算定。
 */
export function resolveRequiredSteps(
  steps: readonly ApprovalStepDef[],
  amountCents: number
): ApprovalStepDef[] {
  return steps
    .filter((step) => amountCents >= step.minAmountCents)
    .slice() // 不原地排序入参
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

/**
 * 应用一个审批动作，返回新状态。
 *
 * **不修改入参**——返回新对象。审批状态的变更要能在日志里对照前后两个快照。
 */
export function applyApprovalAction(
  instance: ApprovalInstanceState,
  action: ApprovalAction
): ApprovalInstanceState {
  if (instance.status !== "pending") {
    // 重复提交（网络重试、用户连点）要拒绝而不是静默改状态：已通过的单子
    // 再批一次会把 currentStepOrder 从 null 变回数字，重新出现在待办里。
    throw new Error(`审批已结束（${instance.status}），不能再操作`);
  }

  if (action.action === "cancel") {
    return { ...instance, status: "cancelled", currentStepOrder: null };
  }

  if (action.stepOrder !== instance.currentStepOrder) {
    // 并发场景：两个审批人同时打开页面，一个批完推进到第 2 步，另一个还停在
    // 第 1 步的页面上点批准。不拦会让单据被推进两步、跳过中间一级。
    throw new Error(
      `操作的不是当前步骤（当前第 ${instance.currentStepOrder} 步，提交的是第 ${action.stepOrder} 步）`
    );
  }

  if (action.action === "reject") {
    // 驳回直接回到发起人。退一级需要记住「谁批过了、要不要重批」，
    // 那是完整流程回溯的开销，蓝图已明确不做。
    return { ...instance, status: "rejected", currentStepOrder: null };
  }

  // 找下一个 required 步骤，而不是 currentStepOrder + 1——金额分级会让序号
  // 不连续（可能只需要第 1 步和第 3 步），+1 会指向不存在的步骤、单据卡死。
  const nextStep = instance.requiredStepOrders.find((order) => order > action.stepOrder);

  return nextStep === undefined
    ? { ...instance, status: "approved", currentStepOrder: null }
    : { ...instance, currentStepOrder: nextStep };
}

/**
 * 某个用户能否处理当前步骤。
 *
 * `manager` 类型需要调用方先把发起人的直属上级解析成 userId 传进来——
 * 组织架构的查询不属于引擎的职责，混进来会让这个纯函数变成要连库的东西。
 */
export function canActOnStep(
  step: ApprovalStepDef,
  actor: { userId: string; roleCodes: readonly string[] },
  resolvedManagerUserId?: string | null
): boolean {
  if (step.approverType === "user") return step.approverValue === actor.userId;
  if (step.approverType === "role") return actor.roleCodes.includes(step.approverValue);
  return resolvedManagerUserId != null && resolvedManagerUserId === actor.userId;
}
