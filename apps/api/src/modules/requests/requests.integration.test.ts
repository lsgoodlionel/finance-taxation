/**
 * 申请单的路径级断言（V13-B1/B2）。
 *
 * 状态机由 lifecycle.test.ts 钉住。这里测状态变更的**连带动作**——
 * 那是本模块真正复杂的地方，且三件事都不会自己报错：
 *
 * 1. approve 时占用预算，重复调用不占两遍；
 * 2. approve 时派生业务事项，重复调用不产生第二条；
 * 3. complete 时占用转实际、cancel/reject 时释放。
 *
 * 「派生两条事项」尤其隐蔽：总线上会出现两条一模一样的记录，其中一条永远
 * 没有票据，而这要等到月底对账才被发现。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const TRAVEL_ACCOUNT = "660203";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("申请单的状态流转与连带动作", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createRequest, transitionRequest, getRequest, updateRequest } = await import("./store.js");
  const { createBudget } = await import("../budget/budget-store.js");
  const { loadBudgetUsage, getBudget } = await import("../budget/queries.js");

  const userRow = await pool.query<{ id: string }>(
    `select id from users where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;

  // 种子已经播了 2026-04 的差旅费预算（seed-acceptance-data 的 SEED_BUDGETS），
  // 但那条属于 cmp-v4-tech 以外的公司也有，这里显式建一条 2026-09 的，
  // 避免与种子数据和其他用例互相干扰。
  const budgetResult = await createBudget({
    companyId: COMPANY_ID,
    periodType: "month",
    periodKey: "2026-09",
    costCenterId: null,
    accountCode: TRAVEL_ACCOUNT,
    amountCents: 10_000_00,
    controlPolicy: "warn",
    note: null
  });
  assert.equal(budgetResult.ok, true);
  const budgetId = budgetResult.ok ? budgetResult.value.id : "";

  async function usage() {
    const budget = await getBudget(COMPANY_ID, budgetId);
    return loadBudgetUsage(budget!);
  }

  const created = await createRequest({
    companyId: COMPANY_ID,
    requestType: "travel",
    title: "去上海出差",
    purpose: "客户验收",
    amountCents: 3_000_00,
    costCenterId: null,
    accountCode: TRAVEL_ACCOUNT,
    expectedDate: "2026-09-15",
    requesterUserId: userId,
    note: null
  });
  assert.equal(created.ok, true);
  const requestId = created.ok ? created.value.id : "";

  await t.test("单据号按月编，形如 REQ-202609-0001", async () => {
    const found = await getRequest(COMPANY_ID, requestId);
    assert.match(found!.requestNo, /^REQ-202609-\d{4}$/);
  });

  await t.test("草稿阶段不占用预算", async () => {
    // 草稿是「还没想好」，占用它等于让没提交的单子挤掉别人的额度。
    assert.equal((await usage()).encumberedCents, 0);
  });

  await t.test("草稿可以改内容", async () => {
    const updated = await updateRequest(COMPANY_ID, requestId, { amountCents: 3_500_00 });
    assert.equal(updated.ok, true);
    if (updated.ok) assert.equal(updated.value.amountCents, 3_500_00);
  });

  await t.test("提交后仍不占用——占用发生在批准那一刻", async () => {
    const submitted = await transitionRequest({
      companyId: COMPANY_ID,
      id: requestId,
      action: "submit",
      actorUserId: userId
    });
    assert.equal(submitted.ok, true);
    if (submitted.ok) assert.equal(submitted.value.status, "pending");
    assert.equal((await usage()).encumberedCents, 0);
  });

  await t.test("审批中不能改内容", async () => {
    // 审批中还能改金额，等于审批人批的和最终生效的不是一个东西。
    const denied = await updateRequest(COMPANY_ID, requestId, { amountCents: 9_999_00 });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.failure.code, "REQUEST_NOT_EDITABLE");
  });

  await t.test("批准时占用预算并派生业务事项", async () => {
    const approved = await transitionRequest({
      companyId: COMPANY_ID,
      id: requestId,
      action: "approve",
      actorUserId: userId
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;

    assert.equal(approved.value.status, "approved");
    assert.equal((await usage()).encumberedCents, 3_500_00, "批准后应占用申请金额");

    assert.ok(approved.value.businessEventId, "应派生业务事项");
    const event = await pool.query<{ status: string; amount: string; description: string }>(
      `select status, amount, description from business_events where id = $1`,
      [approved.value.businessEventId]
    );
    assert.equal(event.rows[0]?.status, "awaiting_documents", "派生的事项应等待补票据");
    assert.match(event.rows[0]!.description, /来自申请单 REQ-/, "事项应记住来源单据");
  });

  await t.test("重复批准不会占两遍预算、不会派生第二条事项", async () => {
    // 网络重试与用户连点在生产里是常态。
    const eventsBefore = await pool.query<{ count: string }>(
      `select count(*) as count from business_events where company_id = $1`,
      [COMPANY_ID]
    );

    const again = await transitionRequest({
      companyId: COMPANY_ID,
      id: requestId,
      action: "approve",
      actorUserId: userId
    });
    // 状态机会拒绝（approved 不允许 approve），这本身就是第一道防线。
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.failure.code, "REQUEST_INVALID_TRANSITION");

    assert.equal((await usage()).encumberedCents, 3_500_00, "占用金额不应翻倍");
    const eventsAfter = await pool.query<{ count: string }>(
      `select count(*) as count from business_events where company_id = $1`,
      [COMPANY_ID]
    );
    assert.equal(eventsAfter.rows[0]!.count, eventsBefore.rows[0]!.count, "不应多出事项");
  });

  await t.test("完成时占用转实际，不再计入已占用", async () => {
    const completed = await transitionRequest({
      companyId: COMPANY_ID,
      id: requestId,
      action: "complete",
      actorUserId: userId
    });
    assert.equal(completed.ok, true);

    const after = await usage();
    assert.equal(after.encumberedCents, 0, "转实际后占用应归零");
    // 账上还没有分录（报销落账是批次 B4 的事），所以实际发生额仍是 0。
    // 这不是 bug：占用已经让位，等报销凭证过账后实际发生额自然出现。
    assert.equal(after.actualCents, 0);
  });

  await t.test("驳回释放占用", async () => {
    const second = await createRequest({
      companyId: COMPANY_ID,
      requestType: "travel",
      title: "去北京出差",
      purpose: "参加会议",
      amountCents: 2_000_00,
      costCenterId: null,
      accountCode: TRAVEL_ACCOUNT,
      expectedDate: "2026-09-20",
      requesterUserId: userId,
      note: null
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;

    await transitionRequest({
      companyId: COMPANY_ID,
      id: second.value.id,
      action: "submit",
      actorUserId: userId
    });
    await transitionRequest({
      companyId: COMPANY_ID,
      id: second.value.id,
      action: "approve",
      actorUserId: userId
    });
    assert.equal((await usage()).encumberedCents, 2_000_00);

    // 已批准的单子作废——出差批了但没去成，很常见。
    const cancelled = await transitionRequest({
      companyId: COMPANY_ID,
      id: second.value.id,
      action: "cancel",
      actorUserId: userId
    });
    assert.equal(cancelled.ok, true);
    assert.equal((await usage()).encumberedCents, 0, "作废应释放占用");
  });

  await t.test("被驳回后可以改了再提", async () => {
    const third = await createRequest({
      companyId: COMPANY_ID,
      requestType: "payment",
      title: "预付款",
      purpose: "供应商要求",
      amountCents: 1_000_00,
      costCenterId: null,
      accountCode: TRAVEL_ACCOUNT,
      expectedDate: "2026-09-25",
      requesterUserId: userId,
      note: null
    });
    assert.equal(third.ok, true);
    if (!third.ok) return;

    await transitionRequest({
      companyId: COMPANY_ID,
      id: third.value.id,
      action: "submit",
      actorUserId: userId
    });
    const rejected = await transitionRequest({
      companyId: COMPANY_ID,
      id: third.value.id,
      action: "reject",
      actorUserId: userId
    });
    assert.equal(rejected.ok, true);

    // 驳回后可编辑
    const edited = await updateRequest(COMPANY_ID, third.value.id, { amountCents: 800_00 });
    assert.equal(edited.ok, true);

    // 改完再提，回到审批中
    const resubmitted = await transitionRequest({
      companyId: COMPANY_ID,
      id: third.value.id,
      action: "submit",
      actorUserId: userId
    });
    assert.equal(resubmitted.ok, true);
    if (resubmitted.ok) assert.equal(resubmitted.value.status, "pending");
  });

  await t.test("没填科目的申请可以正常流转，只是不做预算联动", async () => {
    // 申请阶段还没想好挂哪个科目是最常见的初始状态。拦住会让这类申请
    // 完全提不上来。
    const noAccount = await createRequest({
      companyId: COMPANY_ID,
      requestType: "other",
      title: "杂项申请",
      purpose: "暂未确定科目",
      amountCents: 500_00,
      costCenterId: null,
      accountCode: null,
      expectedDate: "2026-09-28",
      requesterUserId: userId,
      note: null
    });
    assert.equal(noAccount.ok, true);
    if (!noAccount.ok) return;

    await transitionRequest({
      companyId: COMPANY_ID,
      id: noAccount.value.id,
      action: "submit",
      actorUserId: userId
    });
    const approved = await transitionRequest({
      companyId: COMPANY_ID,
      id: noAccount.value.id,
      action: "approve",
      actorUserId: userId
    });

    assert.equal(approved.ok, true);
    if (approved.ok) assert.ok(approved.value.businessEventId, "仍应派生事项");
    assert.equal((await usage()).encumberedCents, 0, "无科目则不占用任何预算");
  });

  await t.test("只有发起人能提交与撤回", async () => {
    const other = await pool.query<{ id: string }>(
      `select id from users where company_id = $1 and id <> $2 limit 1`,
      [COMPANY_ID, userId]
    );
    const otherUserId = other.rows[0]!.id;

    const draft = await createRequest({
      companyId: COMPANY_ID,
      requestType: "other",
      title: "别人的单",
      purpose: "测试",
      amountCents: 100_00,
      costCenterId: null,
      accountCode: null,
      expectedDate: "2026-09-29",
      requesterUserId: userId,
      note: null
    });
    assert.equal(draft.ok, true);
    if (!draft.ok) return;

    const denied = await transitionRequest({
      companyId: COMPANY_ID,
      id: draft.value.id,
      action: "submit",
      actorUserId: otherUserId
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.failure.code, "REQUEST_NOT_OWNER");
  });
});
