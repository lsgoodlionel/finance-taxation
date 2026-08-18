/**
 * 申请单状态机的测试（V13-B1）。
 *
 * ## 为什么申请单不做成业务事项的一个 type
 *
 * 业务事项是「**已经发生**的经营事实」，申请单是「**尚未发生**的意图」。
 * 两者的可编辑性完全不同：事项一旦过账就不该改，而申请单在批准前随时可改、
 * 被驳回后还要改了再提。混在一张表里，「这条能不能改」就得靠 type 分支判断，
 * 而那种判断迟早漏一处。
 *
 * 关系是**审批通过后派生一条事项**（B2）：意图兑现成事实。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  canEdit,
  canTransition,
  nextStatus,
  REQUEST_STATUSES,
  type RequestStatus
} from "./lifecycle.js";

test("草稿可以提交", () => {
  assert.equal(canTransition("draft", "submit"), true);
  assert.equal(nextStatus("draft", "submit"), "pending");
});

test("审批中可以通过、驳回、撤回", () => {
  assert.equal(nextStatus("pending", "approve"), "approved");
  assert.equal(nextStatus("pending", "reject"), "rejected");
  assert.equal(nextStatus("pending", "cancel"), "cancelled");
});

test("被驳回后可以改了再提，回到审批中", () => {
  // 驳回不是终点。做成终点会逼用户为同一件事重开一张单，
  // 而那让「这件事申请过几次」变成一堆看不出关联的记录。
  assert.equal(canTransition("rejected", "submit"), true);
  assert.equal(nextStatus("rejected", "submit"), "pending");
});

test("已通过的申请单在报销完成后关闭", () => {
  assert.equal(nextStatus("approved", "complete"), "completed");
});

test("已通过但没走完的申请可以作废", () => {
  // 出差批了但没去成——很常见。作废要释放已占用的预算（由调用方接线）。
  assert.equal(nextStatus("approved", "cancel"), "cancelled");
});

test("终态不能再转移", () => {
  for (const status of ["completed", "cancelled"] as const) {
    for (const action of ["submit", "approve", "reject", "cancel", "complete"] as const) {
      assert.equal(
        canTransition(status, action),
        false,
        `${status} 不该允许 ${action}`
      );
    }
  }
});

test("审批中不能直接完成，必须先通过", () => {
  // 跳过 approved 直接 completed 会让预算占用永远转不成实际——
  // 占用是在 approve 那一步建立的。
  assert.equal(canTransition("pending", "complete"), false);
});

test("草稿不能被批准", () => {
  // 没提交就批准意味着绕过了审批流。
  assert.equal(canTransition("draft", "approve"), false);
});

test("非法转移抛错而不是静默返回原状态", () => {
  // 静默返回原状态会让调用方以为操作成功了，而单据一动没动。
  assert.throws(() => nextStatus("completed", "submit"), /不允许/);
});

test("只有草稿与被驳回的单据可以编辑", () => {
  // 审批中还能改金额，等于审批人批的和最终生效的不是一个东西。
  assert.equal(canEdit("draft"), true);
  assert.equal(canEdit("rejected"), true);
  assert.equal(canEdit("pending"), false);
  assert.equal(canEdit("approved"), false);
  assert.equal(canEdit("completed"), false);
  assert.equal(canEdit("cancelled"), false);
});

test("状态清单与状态机覆盖一致", () => {
  // 加了新状态却忘了在状态机里处理，会让那个状态成为死胡同——
  // 单据进去就出不来。这条用例逼着两处同步。
  for (const status of REQUEST_STATUSES) {
    const reachable = (["submit", "approve", "reject", "cancel", "complete"] as const).some(
      (action) => canTransition(status, action)
    );
    const isTerminal = status === "completed" || status === "cancelled";
    assert.equal(
      reachable,
      !isTerminal,
      `${status} 应当${isTerminal ? "是终态" : "至少有一个可用动作"}`
    );
  }
});

test("状态清单没有重复", () => {
  assert.equal(new Set(REQUEST_STATUSES).size, REQUEST_STATUSES.length);
});

test("每个状态都是合法的 RequestStatus", () => {
  const statuses: readonly RequestStatus[] = REQUEST_STATUSES;
  assert.ok(statuses.includes("draft"));
});
