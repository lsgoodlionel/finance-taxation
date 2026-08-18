/**
 * 审批工作台展示逻辑的测试（V13-A6）。
 *
 * 进度显示错了，审批人会以为自己不是最后一关而放松审查——这类错不会崩，
 * 只会让审批质量悄悄下降。
 */

import { isFinalStep, sortByRisk, stepProgress } from "./approval-view";
import type { ApprovalInstance } from "../../lib/api-expense-control";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const BASE: ApprovalInstance = {
  id: "a1",
  flowId: "f1",
  documentType: "reimbursement",
  documentId: "rmb-1",
  submitterUserId: "u1",
  status: "pending",
  currentStepOrder: 1,
  requiredStepOrders: [1, 2, 3],
  amountCents: 100000,
};

// 三级流程走到第一步
const p1 = stepProgress(BASE);
assert(p1?.current === 1 && p1.total === 3, "expected step 1 of 3");

// 分母是 required 的长度，不是流程定义的总步数：金额分级让这单只需两级，
// 显示「第 1 步 / 共 3 步」会让审批人以为后面还有人把关。
const twoOfThree = stepProgress({ ...BASE, requiredStepOrders: [1, 2] });
assert(twoOfThree?.total === 2, "expected total to follow requiredStepOrders");

// 序号不连续时按位置算，不按序号本身
const gapped = stepProgress({ ...BASE, currentStepOrder: 3, requiredStepOrders: [1, 3] });
assert(gapped?.current === 2 && gapped.total === 2, "expected position-based progress");

// 已结束的实例没有进度
assert(
  stepProgress({ ...BASE, status: "approved", currentStepOrder: null }) === null,
  "expected null progress for finished instance"
);

// 当前步骤不在 required 里说明数据不一致（流程被改过）——返回 null 让界面
// 显示「进度未知」，好过显示一个编出来的数字
assert(
  stepProgress({ ...BASE, currentStepOrder: 9 }) === null,
  "expected null progress when current step is not in required list"
);

// 最后一关要能识别出来：批下去就生效了
assert(isFinalStep({ ...BASE, currentStepOrder: 3 }), "expected last step to be final");
assert(!isFinalStep(BASE), "expected first of three not to be final");
assert(
  isFinalStep({ ...BASE, currentStepOrder: 2, requiredStepOrders: [1, 2] }),
  "expected step 2 of 2 to be final"
);

// 排序：金额大的在前
const sorted = sortByRisk([
  { ...BASE, id: "a", documentId: "d-a", amountCents: 100 },
  { ...BASE, id: "b", documentId: "d-b", amountCents: 900 },
  { ...BASE, id: "c", documentId: "d-c", amountCents: 500 },
]);
assert(
  sorted.map((i) => i.id).join(",") === "b,c,a",
  "expected descending amount order"
);

// 同额时按单据号，保证顺序稳定——否则每次刷新顺序都在跳
const tied = sortByRisk([
  { ...BASE, id: "x", documentId: "d-z", amountCents: 100 },
  { ...BASE, id: "y", documentId: "d-a", amountCents: 100 },
]);
assert(tied.map((i) => i.id).join(",") === "y,x", "expected stable tiebreak by documentId");

// 不修改入参
const input = [BASE, { ...BASE, id: "z", amountCents: 999999 }];
const snapshot = input.map((i) => i.id).join(",");
sortByRisk(input);
assert(input.map((i) => i.id).join(",") === snapshot, "expected input array untouched");

console.log("approval-view-ok");
