/**
 * P8-C3 订阅计费 HTTP 路由
 * GET  /api/billing/plans                 套餐列表
 * GET  /api/billing/subscription          当前订阅 + 用量
 * POST /api/billing/subscribe             选购/变更套餐 → 生成待支付订单
 * POST /api/billing/payments/:id/confirm  确认支付 → 激活订阅
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { planPrice, periodEnd, checkQuota, type Plan, type BillingCycle } from "./plan-logic.js";

interface PlanRow {
  code: string; name: string; price_monthly: string; price_yearly: string;
  limits: Plan["limits"]; features: string[]; highlight: string; sort_order: number;
}

function toPlan(r: PlanRow): Plan {
  return {
    code: r.code, name: r.name,
    priceMonthly: Number(r.price_monthly), priceYearly: Number(r.price_yearly),
    limits: r.limits, features: r.features,
  };
}

async function loadPlan(code: string): Promise<PlanRow | null> {
  return queryOne<PlanRow>("SELECT * FROM subscription_plans WHERE code=$1", [code]);
}

/** 确保公司有订阅行（首访自动建免费试用）。 */
async function ensureSubscription(companyId: string) {
  let sub = await queryOne<{
    id: string; plan_code: string; status: string; billing_cycle: string;
    current_period_start: string; current_period_end: string; trial_end: string | null; ai_calls_used: number;
  }>("SELECT * FROM company_subscriptions WHERE company_id=$1", [companyId]);
  if (!sub) {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await query(
      `INSERT INTO company_subscriptions (id, company_id, plan_code, status, trial_end)
       VALUES ($1,$2,'free','trialing', now() + interval '30 days')`,
      [id, companyId],
    );
    sub = await queryOne("SELECT * FROM company_subscriptions WHERE company_id=$1", [companyId]);
  }
  return sub!;
}

export async function listPlans(_req: ApiRequest, res: ServerResponse): Promise<void> {
  const rows = await query<PlanRow>("SELECT * FROM subscription_plans ORDER BY sort_order");
  json(res, 200, { items: rows.map((r) => ({ ...toPlan(r), highlight: r.highlight })) });
}

async function computeUsage(companyId: string, aiCallsUsed: number) {
  const n = async (sql: string) => {
    const r = await queryOne<{ n: string }>(sql, [companyId]);
    return parseInt(r?.n ?? "0", 10);
  };
  const [seats, employees, banks] = await Promise.all([
    n("SELECT count(*)::text n FROM users WHERE company_id=$1").catch(() => 0),
    n("SELECT count(*)::text n FROM employees WHERE company_id=$1 AND status='active'"),
    n("SELECT count(*)::text n FROM bank_accounts WHERE company_id=$1"),
  ]);
  return { seats, employees, bankAccounts: banks, aiCallsPerMonth: aiCallsUsed };
}

export async function getSubscription(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const sub = await ensureSubscription(cid);
  const planRow = await loadPlan(sub.plan_code);
  const plan = planRow ? toPlan(planRow) : null;
  const usage = await computeUsage(cid, sub.ai_calls_used);

  const quotas = plan ? {
    seats: checkQuota(plan.limits.seats, usage.seats, "seats"),
    employees: checkQuota(plan.limits.employees, usage.employees, "employees"),
    aiCallsPerMonth: checkQuota(plan.limits.aiCallsPerMonth, usage.aiCallsPerMonth, "aiCallsPerMonth"),
    bankAccounts: checkQuota(plan.limits.bankAccounts, usage.bankAccounts, "bankAccounts"),
  } : null;

  json(res, 200, {
    subscription: {
      planCode: sub.plan_code, status: sub.status, billingCycle: sub.billing_cycle,
      currentPeriodStart: sub.current_period_start, currentPeriodEnd: sub.current_period_end,
      trialEnd: sub.trial_end,
    },
    plan: plan ? { ...plan, highlight: planRow!.highlight } : null,
    usage, quotas,
  });
}

export async function subscribePlan(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { planCode?: string; billingCycle?: BillingCycle; method?: string };
  if (!body.planCode) { json(res, 400, { error: "planCode 为必填项" }); return; }
  const cycle: BillingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";

  const planRow = await loadPlan(body.planCode);
  if (!planRow) { json(res, 404, { error: "套餐不存在" }); return; }
  const plan = toPlan(planRow);
  const amount = planPrice(plan, cycle);

  await ensureSubscription(cid);

  // 免费套餐直接生效，无需支付
  if (amount === 0) {
    const now = new Date();
    await query(
      `UPDATE company_subscriptions SET plan_code=$1, billing_cycle=$2, status='active',
         current_period_start=$3, current_period_end=$4, ai_calls_used=0, updated_at=now() WHERE company_id=$5`,
      [plan.code, cycle, now.toISOString(), periodEnd(now, cycle).toISOString(), cid],
    );
    writeAudit({ companyId: cid, userId: req.auth!.userId, action: "billing.subscribed", resourceType: "subscription", changes: { plan: plan.code, amount: 0 } });
    json(res, 200, { ok: true, activated: true, amount: 0 });
    return;
  }

  // 付费套餐生成待支付订单（线下/在线支付确认后激活）
  const payId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const end = periodEnd(now, cycle);
  await query(
    `INSERT INTO subscription_payments (id, company_id, plan_code, billing_cycle, amount, method, status, period_start, period_end, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,now())`,
    [payId, cid, plan.code, cycle, amount, body.method ?? "offline", now.toISOString(), end.toISOString()],
  );
  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "billing.order_created", resourceType: "subscription_payment", resourceId: payId, changes: { plan: plan.code, cycle, amount } });
  json(res, 201, { ok: true, paymentId: payId, amount, planCode: plan.code, billingCycle: cycle,
    payInstruction: "请对公转账或在线支付后点击「确认支付」激活订阅（线下支付需财务核对到账）。" });
}

export async function confirmPayment(req: ApiRequest, res: ServerResponse, paymentId: string): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { reference?: string };
  const pay = await queryOne<{ id: string; plan_code: string; billing_cycle: string; status: string; period_start: string; period_end: string }>(
    "SELECT * FROM subscription_payments WHERE id=$1 AND company_id=$2", [paymentId, cid]);
  if (!pay) { json(res, 404, { error: "支付订单不存在" }); return; }
  if (pay.status === "paid") { json(res, 400, { error: "订单已支付" }); return; }

  await query(
    "UPDATE subscription_payments SET status='paid', reference=$1, paid_at=now() WHERE id=$2",
    [body.reference ?? "", paymentId]);
  await query(
    `UPDATE company_subscriptions SET plan_code=$1, billing_cycle=$2, status='active',
       current_period_start=$3, current_period_end=$4, ai_calls_used=0, updated_at=now() WHERE company_id=$5`,
    [pay.plan_code, pay.billing_cycle, pay.period_start, pay.period_end, cid]);

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "billing.payment_confirmed", resourceType: "subscription_payment", resourceId: paymentId, changes: { plan: pay.plan_code } });
  json(res, 200, { ok: true, activated: true, planCode: pay.plan_code });
}

export async function listPayments(req: ApiRequest, res: ServerResponse): Promise<void> {
  const items = await query(
    "SELECT id, plan_code, billing_cycle, amount, method, status, reference, paid_at, created_at FROM subscription_payments WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50",
    [req.auth!.companyId]);
  json(res, 200, { items, total: items.length });
}
