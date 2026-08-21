/**
 * 归属收敛的单测（P1）。
 *
 * 这一层是数据级权限的**唯一实现**，四类业务对象共用它。
 * 它判错的后果分两种，都很难在使用中被发现：
 * 判松了是越权（改了别人的单据，对方未必知道），
 * 判严了是「谁都改不了」（用户会以为系统坏了）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNERSHIP_RULES,
  canMutate,
  canMutateOwned,
  ownershipFilter,
  type OwnershipActor
} from "./ownership.js";

const OWNER: OwnershipActor = { userId: "usr-owner", roleCodes: ["role-employee"] };
const OTHER: OwnershipActor = { userId: "usr-other", roleCodes: ["role-employee"] };
const MANAGER: OwnershipActor = { userId: "usr-manager", roleCodes: ["role-finance-director"] };

test("本人可以改自己的记录", () => {
  assert.equal(canMutate("task", "usr-owner", OWNER), true);
  assert.equal(canMutate("reimbursement", "usr-owner", OWNER), true);
});

test("别人改不了", () => {
  // 同部门也不行——那是可见性口径，读得到不等于改得动。
  // 改别人的报销单等于替他签字。
  assert.equal(canMutate("task", "usr-owner", OTHER), false);
  assert.equal(canMutate("reimbursement", "usr-owner", OTHER), false);
});

test("持管理权限的可以改任意记录", () => {
  assert.equal(canMutate("task", "usr-owner", MANAGER), true);
  assert.equal(canMutate("reimbursement", "usr-owner", MANAGER), true);
});

test("无主记录对非管理者一律拒绝——不能因为两边都空就放行", () => {
  // `null === null` 在 JS 里是 true。照那么写，所有无主记录对所有人开放。
  assert.equal(canMutate("task", null, OWNER), false);
  assert.equal(canMutate("task", undefined, OWNER), false);
  assert.equal(canMutateOwned(null, { userId: "", roleCodes: [] }, { managePermission: null }), false);
});

test("无主记录管理者仍可改——否则那条记录谁都动不了", () => {
  assert.equal(canMutate("task", null, MANAGER), true);
});

test("managePermission 为 null 时没有越过通道，管理者也不行", () => {
  // 目前没有这样的资源，但把话说死会让将来加「只有本人能改」的东西时
  // 不得不绕过这一层。
  assert.equal(canMutateOwned("usr-owner", MANAGER, { managePermission: null }), false);
  assert.equal(canMutateOwned("usr-manager", MANAGER, { managePermission: null }), true);
});

test("每种资源的归属字段名都记在规则里，调用方不硬编码", () => {
  // 写错字段名的表现是「谁都改不了」或「谁都能改」，两者都不报错。
  for (const [resource, rule] of Object.entries(OWNERSHIP_RULES)) {
    assert.ok(rule.column.length > 0, `${resource} 缺归属字段名`);
    assert.match(rule.column, /_id$/, `${resource} 的归属字段名看着不像 id 列`);
    assert.ok(rule.managePermission.includes("."), `${resource} 的管理权限键格式不对`);
  }
});

test("读取过滤：管理者不加限制，其余按归属字段过滤", () => {
  assert.equal(ownershipFilter("task", MANAGER, 2), null, "管理者不该被加过滤");

  const filter = ownershipFilter("reimbursement", OWNER, 2);
  assert.ok(filter);
  // 字段名从规则表来——报销是 applicant_user_id 不是 owner_id。
  assert.equal(filter!.clause, "applicant_user_id = $2");
  assert.equal(filter!.param, "usr-owner");
});

test("读取过滤的参数序号跟着调用方给的走", () => {
  // 拼 SQL 时序号必须与 params 数组对齐，写死 $1 会在有前置参数时错位。
  const filter = ownershipFilter("task", OWNER, 5);
  assert.equal(filter!.clause, "owner_id = $5");
});
