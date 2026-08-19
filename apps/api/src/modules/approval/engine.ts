/**
 * 审批流引擎（V13-A5）。
 *
 * ## 范围（V14-B 扩展后）
 *
 * 做：串行多级 + 按金额分级 + 驳回到发起人 + 抄送 +
 * **会签 / 或签 / 动态加签**。
 *
 * 仍然不做：驳回到任意中间节点、流程图拖拽编辑。
 *
 * ## V13 那句话只兑现了一半
 *
 * V13 在这里写过：「会签会把当前步骤从一个数字变成一个集合，这里每一个函数
 * 都要改。」——**结论错了，前提对了一半**。
 *
 * 变成集合的不是「当前步骤」，是「当前步骤有几个人要批」。步骤序号仍然是
 * 一个数字，参与人记在实例侧的另一张表上（迁移 094）。于是这里的改动只有
 * 两处：`applyApprovalAction` 多一个默认 true 的入参，外加一个新的纯函数
 * `isStepSatisfied`。**V13 的 27 条审批测试一条没改。**
 *
 * 教训不是「当初判断错了」，而是：把「要改多少代码」写进设计文档时，
 * 那是一个估计，不是一个事实。真到了动手的时候要重新看一眼。
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

/**
 * 步骤的推进模式。
 *
 * **没有 serial**：只有一个审批人时 `all` 与 `any` 行为完全相同，
 * 多一个枚举值就多一条要测的分支，而它测出来的东西和别的两条一样。
 */
export type StepMode = "all" | "any";

export type ParticipantStatus = "pending" | "approved" | "rejected";

export interface ApplyOptions {
  /**
   * 本步骤是否已满足推进条件。**缺省即 true**——不传就是 V13 的串行行为。
   *
   * 由调用方用 `isStepSatisfied` 算好传进来，而不是把参与人列表塞给
   * `applyApprovalAction`：那会让这个函数同时管两件事，而两件事的
   * 出错方式完全不同。
   */
  stepSatisfied?: boolean;
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
export function resolveRequiredSteps<T extends { stepOrder: number; minAmountCents: number }>(
  steps: readonly T[],
  amountCents: number
): T[] {
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
  action: ApprovalAction,
  options: ApplyOptions = {}
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
    //
    // **会签里一个人驳回就整单驳回**，不等其他人。会签的意思是「都同意才算过」，
    // 一票否决是它的定义而不是简化。
    return { ...instance, status: "rejected", currentStepOrder: null };
  }

  // V14-B：本步骤还没满足推进条件（会签里还有人没批），实例原样返回。
  //
  // 默认 true 是有意的：不传这个参数就是 V13 的行为——一个人批完就推进。
  // 那 27 条老测试因此一条不用改。
  if (options.stepSatisfied === false) {
    return { ...instance };
  }

  // 找下一个 required 步骤，而不是 currentStepOrder + 1——金额分级会让序号
  // 不连续（可能只需要第 1 步和第 3 步），+1 会指向不存在的步骤、单据卡死。
  const nextStep = instance.requiredStepOrders.find((order) => order > action.stepOrder);

  return nextStep === undefined
    ? { ...instance, status: "approved", currentStepOrder: null }
    : { ...instance, currentStepOrder: nextStep };
}

/**
 * 本步骤是否已经可以推进。
 *
 * 传入的参与人状态应当**包含本次动作的结果**——先把自己那条改成 approved
 * 再算，否则会签的最后一个人批完仍然算不满足，单据卡在最后一步。
 *
 * | 模式 | 满足条件 |
 * |---|---|
 * | `any`（或签） | 至少一人已批准 |
 * | `all`（会签） | 每个人都已批准 |
 *
 * **空参与人列表一律返回 false**，两种模式都是。空列表在 `all` 下数学上
 * 「全部满足」，但业务上它意味着这一步没人能批——放行等于让这一级
 * 审批凭空消失。提交时就该拦住，这里是第二道。
 */
export function isStepSatisfied(
  mode: StepMode,
  participants: readonly { status: ParticipantStatus }[]
): boolean {
  if (participants.length === 0) return false;
  if (mode === "any") return participants.some((p) => p.status === "approved");
  return participants.every((p) => p.status === "approved");
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
