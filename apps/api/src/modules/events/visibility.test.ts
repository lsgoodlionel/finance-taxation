import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewEvent,
  filterVisibleEvents,
  hasCompanyWideEventAccess
} from "./visibility.js";

// 用**普通成员**做主角：这几条验的是「owner + 协作人」这条收敛口径。
// 不能用 role-accountant——V16 起会计是公司级可见角色（他是唯一做账的人，
// 看不到事项就分析不了），拿他当普通成员，这些用例会全部失去意义。
const OWNER = { userId: "usr-owner", roleCodes: ["role-employee"] };
const OTHER = { userId: "usr-other", roleCodes: ["role-employee"] };
const CHAIRMAN = { userId: "usr-boss", roleCodes: ["role-chairman"] };

const EVENT = { id: "evt-1", ownerId: "usr-owner" };
const NONE = new Set<string>();

test("可见性：owner 看得到自己名下的事项", () => {
  assert.equal(canViewEvent(EVENT, OWNER, NONE), true);
});

test("可见性：同部门的人不再自动看得到", () => {
  // 这正是这次收敛要改的：财务部任何人能看到财务部每一条事项，
  // 包括薪酬、补偿这类本该只有经办人看得见的。
  assert.equal(canViewEvent(EVENT, OTHER, NONE), false);
});

test("可见性：被显式加为协作人就看得到", () => {
  assert.equal(canViewEvent(EVENT, OTHER, new Set(["evt-1"])), true);
});

test("可见性：协作关系只对被加的那条事项生效", () => {
  // 加进一条就能看全部，等于把收敛又还回去了。
  assert.equal(canViewEvent({ id: "evt-2", ownerId: "usr-owner" }, OTHER, new Set(["evt-1"])), false);
});

test("可见性：董事长看得到全部，不需要被加进去", () => {
  assert.equal(canViewEvent(EVENT, CHAIRMAN, NONE), true);
  assert.equal(canViewEvent({ id: "evt-9", ownerId: null }, CHAIRMAN, NONE), true);
});

test("可见性：无主事项对普通成员不可见", () => {
  // owner 为空时若放行，就等于「谁都能看的公共池」——收敛前那个口径的另一种形态。
  assert.equal(canViewEvent({ id: "evt-3", ownerId: null }, OTHER, NONE), false);
  assert.equal(canViewEvent({ id: "evt-3", ownerId: undefined }, OTHER, NONE), false);
});

test("可见性：ownerId 为空串不能匹配上空的 userId", () => {
  // 防的是「两个空值撞在一起判成同一个人」。
  assert.equal(canViewEvent({ id: "evt-4", ownerId: "" }, { userId: "", roleCodes: [] }, NONE), false);
});

test("批量过滤：保持原有顺序", () => {
  // 调用方依赖列表已有的排序，过滤不该重排。
  const events = [
    { id: "evt-1", ownerId: "usr-owner" },
    { id: "evt-2", ownerId: "usr-other" },
    { id: "evt-3", ownerId: "usr-owner" }
  ];

  assert.deepEqual(
    filterVisibleEvents(events, OWNER, NONE).map((e) => e.id),
    ["evt-1", "evt-3"]
  );
});

test("批量过滤：公司级角色拿到全部，且是新数组", () => {
  const events = [{ id: "evt-1", ownerId: "usr-owner" }];
  const result = filterVisibleEvents(events, CHAIRMAN, NONE);

  assert.deepEqual(result.map((e) => e.id), ["evt-1"]);
  assert.notEqual(result, events, "返回新数组，调用方改它不该动到入参");
});

test("公司级角色清单：董事长、财务总监、会计", () => {
  assert.equal(hasCompanyWideEventAccess(["role-chairman"]), true);
  assert.equal(hasCompanyWideEventAccess(["role-finance-director"]), true);
  // 会计是公司级可见：全公司的业务最终都要经他的手变成凭证。
  assert.equal(hasCompanyWideEventAccess(["role-accountant"]), true);
  // 出纳不是——他管钱不管账，不需要看全部业务。
  assert.equal(hasCompanyWideEventAccess(["role-cashier"]), false);
  assert.equal(hasCompanyWideEventAccess(["role-employee"]), false);
  assert.equal(hasCompanyWideEventAccess(["role-manager"]), false);
  assert.equal(hasCompanyWideEventAccess([]), false);
});
