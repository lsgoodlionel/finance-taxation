/**
 * 审批流引擎的测试（V13-A5）。
 *
 * 范围在蓝图里卡死了：**串行多级 + 按金额分级 + 驳回到发起人 + 抄送**。
 * 不做会签/或签、动态加签、驳回到任意中间节点——那些需要完整的流程实例回溯，
 * 复杂度是串行流程的数倍，而中小企业场景里罕见。
 *
 * 这里锁两件事：
 * 1. **金额分级**算出的步骤序列（错了会让大额单据少一级审批）；
 * 2. **状态转换**（错了会让单据卡在无人处理的中间态，或被重复审批推进两步）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  applyApprovalAction,
  isStepSatisfied,
  canActOnStep,
  resolveRequiredSteps,
  type ApprovalInstanceState,
  type ApprovalStepDef
} from "./engine.js";

/** 三级流程：部门经理（不限额）→ 财务（≥1 万）→ 总经理（≥5 万）。 */
const STEPS: readonly ApprovalStepDef[] = [
  { stepOrder: 1, approverType: "role", approverValue: "role-manager", minAmountCents: 0 },
  { stepOrder: 2, approverType: "role", approverValue: "role-accountant", minAmountCents: 1_000_000 },
  { stepOrder: 3, approverType: "role", approverValue: "role-chairman", minAmountCents: 5_000_000 }
];

test("小额只需第一级", () => {
  // Arrange：5000 元，低于财务门槛
  // Act
  const required = resolveRequiredSteps(STEPS, 500_000);

  // Assert
  assert.deepEqual(required.map((s) => s.stepOrder), [1]);
});

test("金额达到门槛时该级加入", () => {
  assert.deepEqual(resolveRequiredSteps(STEPS, 1_000_000).map((s) => s.stepOrder), [1, 2]);
  assert.deepEqual(resolveRequiredSteps(STEPS, 5_000_000).map((s) => s.stepOrder), [1, 2, 3]);
});

test("门槛是「达到即触发」而非「超过」", () => {
  // 制度写「1 万以上需财务审批」，1 万整该走财务。用 > 会让恰好 1 万的单据
  // 少一级审批——而整数金额恰恰是最常见的。
  assert.equal(resolveRequiredSteps(STEPS, 1_000_000).length, 2);
  assert.equal(resolveRequiredSteps(STEPS, 999_999).length, 1);
});

test("步骤按 stepOrder 排序，不依赖入参顺序", () => {
  const shuffled: ApprovalStepDef[] = [STEPS[2]!, STEPS[0]!, STEPS[1]!];

  assert.deepEqual(resolveRequiredSteps(shuffled, 5_000_000).map((s) => s.stepOrder), [1, 2, 3]);
});

test("没有任何步骤适用时返回空数组", () => {
  // 全部步骤都有金额门槛且金额太小——这是配置问题（应该有一级 minAmount 为 0），
  // 但引擎要给出确定结果。调用方据此决定是自动通过还是报错。
  const allGated: ApprovalStepDef[] = [
    { stepOrder: 1, approverType: "role", approverValue: "r", minAmountCents: 100 }
  ];

  assert.deepEqual(resolveRequiredSteps(allGated, 50), []);
});

/** 一个走到第 1 步的三级实例。 */
function pendingInstance(overrides: Partial<ApprovalInstanceState> = {}): ApprovalInstanceState {
  return {
    status: "pending",
    currentStepOrder: 1,
    requiredStepOrders: [1, 2, 3],
    ...overrides
  };
}

test("批准后推进到下一步，仍是 pending", () => {
  const next = applyApprovalAction(pendingInstance(), { action: "approve", stepOrder: 1 });

  assert.equal(next.status, "pending");
  assert.equal(next.currentStepOrder, 2);
});

test("最后一步批准后整单通过", () => {
  const last = pendingInstance({ currentStepOrder: 3 });
  const next = applyApprovalAction(last, { action: "approve", stepOrder: 3 });

  assert.equal(next.status, "approved");
  // 通过之后没有「当前步骤」——留着上一步的号会让待办查询把它捞出来。
  assert.equal(next.currentStepOrder, null);
});

test("驳回直接回到发起人，不退一级", () => {
  // 蓝图明确不做「驳回到任意中间节点」。三级审批里第三级驳回，单子回发起人
  // 重新提交，而不是退给第二级——退一级需要记住「谁批过了、要不要重批」，
  // 那是完整流程回溯的开销。
  const atLast = pendingInstance({ currentStepOrder: 3 });
  const next = applyApprovalAction(atLast, { action: "reject", stepOrder: 3 });

  assert.equal(next.status, "rejected");
  assert.equal(next.currentStepOrder, null);
});

test("对非当前步骤的动作被拒绝", () => {
  // 并发场景：两个审批人同时打开页面，一个批完推进到第 2 步，另一个还停在
  // 第 1 步的页面上点批准。不拦会让单据被推进两步、跳过第 2 级。
  const instance = pendingInstance({ currentStepOrder: 2 });

  assert.throws(
    () => applyApprovalAction(instance, { action: "approve", stepOrder: 1 }),
    /当前步骤/
  );
});

test("已结束的实例不能再被审批", () => {
  // 重复提交（网络重试、用户连点）要拒绝而不是静默改状态——已通过的单子
  // 再批一次会把 currentStepOrder 从 null 变成数字，重新出现在待办里。
  for (const status of ["approved", "rejected", "cancelled"] as const) {
    assert.throws(
      () => applyApprovalAction({ ...pendingInstance(), status, currentStepOrder: null }, {
        action: "approve",
        stepOrder: 1
      }),
      /已结束/
    );
  }
});

test("撤回由发起人发起，任何 pending 阶段都可以", () => {
  const next = applyApprovalAction(pendingInstance({ currentStepOrder: 2 }), { action: "cancel" });

  assert.equal(next.status, "cancelled");
  assert.equal(next.currentStepOrder, null);
});

test("跳过的步骤不参与推进", () => {
  // 金额只够两级时，第 2 步批准即完成——不能因为流程定义里有第 3 步就
  // 把单据推到一个根本不需要的步骤上等着。
  const twoStep = pendingInstance({ currentStepOrder: 2, requiredStepOrders: [1, 2] });
  const next = applyApprovalAction(twoStep, { action: "approve", stepOrder: 2 });

  assert.equal(next.status, "approved");
});

test("推进时跳到下一个 required 步骤而不是 +1", () => {
  // 金额分级会让步骤序号不连续（比如只需要第 1 步和第 3 步）。
  // 简单地 currentStepOrder + 1 会指向一个不存在的步骤，单据就此卡死。
  const gapped = pendingInstance({ currentStepOrder: 1, requiredStepOrders: [1, 3] });
  const next = applyApprovalAction(gapped, { action: "approve", stepOrder: 1 });

  assert.equal(next.currentStepOrder, 3);
  assert.equal(next.status, "pending");
});

// ── canActOnStep：权限收敛点 ────────────────────────────────────────
//
// 这是 `POST /api/approval/instances/:id/act` 的真正判权所在。路由层只挂
// workflow.view 让基层角色进门（否则员工连自己的待办都处理不了），能不能
// 动这一单全靠这个函数——所以它必须有自己的测试，
// registry-permissions 的白名单第 3 类也是这么要求的。

const ROLE_STEP: ApprovalStepDef = {
  stepOrder: 1,
  approverType: "role",
  approverValue: "role-accountant",
  minAmountCents: 0
};

test("role 步骤：持有该角色才能批", () => {
  assert.equal(
    canActOnStep(ROLE_STEP, { userId: "u1", roleCodes: ["role-accountant"] }),
    true
  );
  assert.equal(canActOnStep(ROLE_STEP, { userId: "u1", roleCodes: ["role-employee"] }), false);
});

test("user 步骤：只有指定的那个人能批", () => {
  const step: ApprovalStepDef = { ...ROLE_STEP, approverType: "user", approverValue: "u-boss" };

  assert.equal(canActOnStep(step, { userId: "u-boss", roleCodes: [] }), true);
  // 角色再大也不行——指名到人的步骤就是指名到人。
  assert.equal(canActOnStep(step, { userId: "u1", roleCodes: ["role-chairman"] }), false);
});

test("manager 步骤：解析出的上级必须正是操作人", () => {
  const step: ApprovalStepDef = { ...ROLE_STEP, approverType: "manager", approverValue: "" };

  assert.equal(canActOnStep(step, { userId: "u-lead", roleCodes: [] }, "u-lead"), true);
  assert.equal(canActOnStep(step, { userId: "u-other", roleCodes: [] }, "u-lead"), false);
});

test("manager 步骤：解析不到上级时一律拒绝", () => {
  // 发起人所在部门没设负责人。**不能放行**——写路由时曾把当前用户 id 当作
  // 「解析出的上级」传进来，那让判据恒真、任何人都能批 manager 步骤。
  // 这条用例就是那个洞的回归测试。
  const step: ApprovalStepDef = { ...ROLE_STEP, approverType: "manager", approverValue: "" };

  assert.equal(canActOnStep(step, { userId: "u1", roleCodes: ["role-chairman"] }, null), false);
  assert.equal(canActOnStep(step, { userId: "u1", roleCodes: [] }, undefined), false);
});

// ── V14-B：会签 / 或签 ────────────────────────────────────────────────
//
// 上面 17 条是 V13 写的，改造后一条没动——那是护栏 2 的全部意义。
// 下面是新增能力的用例。

test("或签：任一人批准即满足", () => {
  assert.equal(
    isStepSatisfied("any", [{ status: "approved" }, { status: "pending" }]),
    true
  );
  assert.equal(
    isStepSatisfied("any", [{ status: "pending" }, { status: "pending" }]),
    false
  );
});

test("会签：所有人都批准才满足", () => {
  assert.equal(
    isStepSatisfied("all", [{ status: "approved" }, { status: "approved" }]),
    true
  );
  assert.equal(
    isStepSatisfied("all", [{ status: "approved" }, { status: "pending" }]),
    false
  );
});

test("空参与人列表两种模式都不满足", () => {
  // 会签下「所有人都批了」在空列表上数学成立，但业务上它意味着这一步
  // 没人能批。放行等于让这一级审批凭空消失。
  assert.equal(isStepSatisfied("all", []), false);
  assert.equal(isStepSatisfied("any", []), false);
});

test("有人驳回时会签不满足——即便其余都批了", () => {
  assert.equal(
    isStepSatisfied("all", [{ status: "approved" }, { status: "rejected" }]),
    false
  );
});

test("会签未满足时实例停在原步骤，状态仍是 pending", () => {
  const instance = {
    status: "pending" as const,
    currentStepOrder: 1,
    requiredStepOrders: [1, 2]
  };

  const next = applyApprovalAction(
    instance,
    { action: "approve", stepOrder: 1 },
    { stepSatisfied: false }
  );

  assert.equal(next.status, "pending");
  assert.equal(next.currentStepOrder, 1, "会签没批完就推进了");
  // 不修改入参——审批状态变更要能在日志里对照前后快照。
  assert.equal(instance.currentStepOrder, 1);
});

test("会签满足后照常推进到下一步", () => {
  const next = applyApprovalAction(
    { status: "pending", currentStepOrder: 1, requiredStepOrders: [1, 3] },
    { action: "approve", stepOrder: 1 },
    { stepSatisfied: true }
  );
  assert.equal(next.currentStepOrder, 3);
});

test("不传 options 就是 V13 的行为——一个人批完即推进", () => {
  // 这条钉住的是向后兼容本身：默认值一旦从 true 变成 false，
  // 上面 17 条老用例会集体失败，而失败原因会很难看出来。
  const next = applyApprovalAction(
    { status: "pending", currentStepOrder: 1, requiredStepOrders: [1, 2] },
    { action: "approve", stepOrder: 1 }
  );
  assert.equal(next.currentStepOrder, 2);
});

test("会签里一人驳回即整单驳回，不等其他人", () => {
  // 会签的意思是「都同意才算过」，一票否决是它的定义而不是简化。
  const next = applyApprovalAction(
    { status: "pending", currentStepOrder: 1, requiredStepOrders: [1, 2] },
    { action: "reject", stepOrder: 1 },
    { stepSatisfied: false }
  );
  assert.equal(next.status, "rejected");
  assert.equal(next.currentStepOrder, null);
});
