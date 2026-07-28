/**
 * 任务写操作的归属收敛。
 *
 * 背景：`PUT /api/tasks/:id` 与 `POST /api/tasks/:id/remind` 此前挂 `tasks.view`，
 * 而 `tasks.view` 连纯只读的 role-viewer 都持有 —— 任何登录用户可以改任意任务的
 * 状态。把路由提到 `tasks.manage` 能堵住这个洞，但 `tasks.manage` 只有董事长和
 * 财务负责人持有，会计/员工/出纳/税务专员将连**自己名下**的任务都改不了，
 * 这是明确的功能回退。
 *
 * 正解是两层：路由放宽回 `anyOf(tasks.view, tasks.manage)` 让基层角色进得来，
 * handler 再按归属收敛 —— 没有 `tasks.manage` 的人只能动自己是负责人的任务。
 * 权限键管「谁能进这个门」，归属管「进来后能碰谁的东西」，缺一不可。
 *
 * 这里只测纯裁决函数：它不碰 DB，是这条规则唯一的判断点。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { canMutateTask } from "./mutation-scope.js";

const OWNER_ID = "usr-owner";
const OTHER_ID = "usr-other";

test("a manager may mutate any task in the company", () => {
  // Arrange: 财务负责人持有 tasks.manage
  const actor = { userId: OTHER_ID, roleCodes: ["role-finance-director"] };

  // Act
  const allowed = canMutateTask({ ownerId: OWNER_ID }, actor);

  // Assert
  assert.equal(allowed, true);
});

test("a non-manager may mutate a task they own", () => {
  // Arrange: 会计没有 tasks.manage，但这条任务是他自己的
  const actor = { userId: OWNER_ID, roleCodes: ["role-accountant"] };

  // Act
  const allowed = canMutateTask({ ownerId: OWNER_ID }, actor);

  // Assert: 这正是不能因收紧权限而丢掉的能力
  assert.equal(allowed, true);
});

test("a non-manager may not mutate someone else's task", () => {
  // Arrange
  const actor = { userId: OTHER_ID, roleCodes: ["role-accountant"] };

  // Act
  const allowed = canMutateTask({ ownerId: OWNER_ID }, actor);

  // Assert
  assert.equal(allowed, false);
});

test("a read-only viewer may not mutate a task even when it is unowned", () => {
  // Arrange: owner_id 可空；无主任务不得因此对所有人敞开
  const actor = { userId: OTHER_ID, roleCodes: ["role-viewer"] };

  // Act
  const allowed = canMutateTask({ ownerId: null }, actor);

  // Assert
  assert.equal(allowed, false);
});

test("an unowned task is not mutable by a non-manager who happens to have a null user id", () => {
  // Arrange: 防御 null == null 误判成「我是负责人」
  const actor = { userId: "", roleCodes: ["role-employee"] };

  // Act
  const allowed = canMutateTask({ ownerId: null }, actor);

  // Assert
  assert.equal(allowed, false);
});
