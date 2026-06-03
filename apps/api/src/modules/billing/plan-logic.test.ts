import { test } from "node:test";
import assert from "node:assert/strict";
import { planPrice, periodEnd, checkQuota, hasFeature, isUpgrade, type Plan } from "./plan-logic.js";

const FREE: Plan = { code: "free", name: "免费", priceMonthly: 0, priceYearly: 0,
  limits: { seats: 2, employees: 5, aiCallsPerMonth: 30, bankAccounts: 1 }, features: ["ledger"] };
const PRO: Plan = { code: "professional", name: "专业", priceMonthly: 299, priceYearly: 2999,
  limits: { seats: 15, employees: 100, aiCallsPerMonth: 1500, bankAccounts: 10 }, features: ["ledger", "ai_agents"] };

test("周期价格", () => {
  assert.equal(planPrice(PRO, "monthly"), 299);
  assert.equal(planPrice(PRO, "yearly"), 2999);
});

test("月度周期结束为加一月", () => {
  const end = periodEnd(new Date("2026-01-15T00:00:00Z"), "monthly");
  assert.equal(end.toISOString().slice(0, 10), "2026-02-15");
});

test("年度周期结束为加一年", () => {
  const end = periodEnd(new Date("2026-01-15T00:00:00Z"), "yearly");
  assert.equal(end.toISOString().slice(0, 10), "2027-01-15");
});

test("配额未超额", () => {
  const q = checkQuota(30, 10, "ai");
  assert.equal(q.remaining, 20);
  assert.equal(q.allowed, true);
  assert.equal(q.exceeded, false);
});

test("配额超额", () => {
  const q = checkQuota(5, 5, "employees");
  assert.equal(q.allowed, false);
  assert.equal(q.exceeded, true);
  assert.equal(q.remaining, 0);
});

test("无限配额(-1)始终允许", () => {
  const q = checkQuota(-1, 99999, "seats");
  assert.equal(q.allowed, true);
  assert.equal(q.remaining, -1);
});

test("功能门", () => {
  assert.equal(hasFeature(PRO.features, "ai_agents"), true);
  assert.equal(hasFeature(FREE.features, "ai_agents"), false);
});

test("升级判定", () => {
  assert.equal(isUpgrade(FREE, PRO), true);
  assert.equal(isUpgrade(PRO, FREE), false);
});
