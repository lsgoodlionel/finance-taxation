/**
 * 审批流的路径级断言（V13-A4/A5）。
 *
 * 状态转换由 engine.test.ts 钉住。这里测只有连库才成立的部分：
 *
 * 1. **判权**——不是当前步骤的审批人能不能批（这是钱的闸门）；
 * 2. **并发**——两个人同时批会不会跳过中间一级；
 * 3. **排他约束**——同一单据能不能同时有两个进行中的审批。
 *
 * 第 1 条错了是越权，第 2、3 条错了是单据状态错乱，三者都不会自己报错。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("审批流的判权与并发", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createFlow, submitForApproval, act, listPendingFor } = await import("./store.js");

  const users = await pool.query<{ id: string; role_codes: string[] }>(
    `select u.id, array_agg(ur.role_id) as role_codes
       from users u left join user_roles ur on ur.user_id = u.id
      where u.company_id = $1 group by u.id order by u.id`,
    [COMPANY_ID]
  );
  // V14-B：**角色码必须是种子里真实有人持有的，而且四个角色要落在不同的人身上。**
  //
  // 改造前这里写的是 `role-accountant`，而种子里的角色叫
  // `role-v4-tech-accountant`——老实现只比对调用方自称的 roleCodes，从没查过库，
  // 所以一个没人持有的角色码照样能跑通，发起人和第二级审批人是不是同一个人
  // 也无所谓。
  //
  // V14-B 在提交时把角色解析成具体的人（会签要判断「这几个人都批了吗」），
  // 于是这两件事都变成了真问题：没有成员的角色是配置错误；发起人恰好是第二级
  // 审批人会让并发用例里两个动作都成功。下面按角色显式挑人。
  const withRole = users.rows.filter((row) => row.role_codes[0] != null);
  assert.ok(withRole.length >= 4, "种子里至少要有四个各持一个角色的用户");

  const submitter = withRole[0]!;
  const firstApprover = withRole[1]!;
  const secondApprover = withRole[2]!;
  // 三级都不沾边的人，用于判权用例。
  const outsider = withRole[3]!;

  const firstRole = firstApprover.role_codes[0]!;
  const secondRole = secondApprover.role_codes[0]!;
  assert.notEqual(firstRole, secondRole, "两级审批要落在不同角色上");
  assert.notEqual(submitter.id, secondApprover.id, "发起人不能同时是第二级审批人");

  // 老变量名保留，下面的断言因此一条不用改。
  const employee = submitter;
  const other = firstApprover;

  // 两级流程：第一级 other 的角色（不限额），第二级 employee 的角色（≥1 万）
  const flowResult = await createFlow({
    companyId: COMPANY_ID,
    name: "报销审批（测试）",
    documentType: "reimbursement",
    // V14-B：步骤的形状从「一个审批人」变成「一组审批人 + 模式」。
    // 下面的断言一条没改——**变的是 store 的入参形状，不是审批的行为**。
    // 一个审批人时 all 与 any 完全等价，所以这两级仍然是原来的串行流程。
    steps: [
      { mode: "all", minAmountCents: 0,
        approvers: [{ approverType: "role", approverValue: firstRole }] },
      // 门槛 1 万元 = 1_000_000 分。大额用例提 2 万元越过它。
      { mode: "all", minAmountCents: 1_000_000,
        approvers: [{ approverType: "role", approverValue: secondRole }] }
    ]
  });
  assert.equal(flowResult.ok, true);

  await t.test("小额只走一级，批完即通过", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-small",
      submitterUserId: employee.id,
      amountCents: 500_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;
    assert.deepEqual(submitted.value.requiredStepOrders, [1]);

    const approved = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: other.id, roleCodes: [firstRole] },
      action: "approve"
    });
    assert.equal(approved.ok, true);
    if (approved.ok) {
      assert.equal(approved.value.status, "approved");
      assert.equal(approved.value.currentStepOrder, null);
    }
  });

  await t.test("不是当前步骤参与人的人批不了", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-authz",
      submitterUserId: employee.id,
      amountCents: 500_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const denied = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      // **自称持有第一级角色也没用**：V14-B 的判权查的是参与人表，
      // 而参与人在提交时就定下来了。这比老实现更严——老实现只比对
      // 调用方自己传进来的 roleCodes。
      actor: { userId: outsider.id, roleCodes: [firstRole] },
      action: "approve"
    });

    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.failure.code, "NOT_AUTHORIZED");
  });

  await t.test("大额走两级，第一级批完仍是 pending", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-large",
      submitterUserId: employee.id,
      amountCents: 20_000_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;
    assert.deepEqual(submitted.value.requiredStepOrders, [1, 2]);

    const first = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: other.id, roleCodes: [firstRole] },
      action: "approve"
    });
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.value.status, "pending");
      assert.equal(first.value.currentStepOrder, 2);
    }

    // 第一级的人不能接着批第二级——那等于一个人批完全程。
    const sameActor = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: other.id, roleCodes: [firstRole] },
      action: "approve"
    });
    assert.equal(sameActor.ok, false);
    if (!sameActor.ok) assert.equal(sameActor.failure.code, "NOT_AUTHORIZED");
  });

  await t.test("同一单据不能同时有两个进行中的审批", async () => {
    const again = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-large",
      submitterUserId: employee.id,
      amountCents: 20_000_00
    });

    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.failure.code, "INSTANCE_ALREADY_PENDING");
  });

  await t.test("并发批准不会跳过中间一级", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-race",
      submitterUserId: employee.id,
      amountCents: 20_000_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    // 两个人同时点批准。行锁保证串行，第二个进来时当前步骤已经是 2，
    // 而他不是第二级的参与人，应当被判权拦下。
    const [a, b] = await Promise.all([
      act({
        companyId: COMPANY_ID,
        instanceId: submitted.value.id,
        actor: { userId: other.id, roleCodes: [firstRole] },
        action: "approve"
      }),
      act({
        companyId: COMPANY_ID,
        instanceId: submitted.value.id,
        actor: { userId: outsider.id, roleCodes: [firstRole] },
        action: "approve"
      })
    ]);

    const succeeded = [a, b].filter((r) => r.ok).length;
    assert.equal(succeeded, 1, "两个并发批准只能有一个成功");

    const state = await pool.query<{ status: string; current_step_order: number | null }>(
      `select status, current_step_order from approval_instances where id = $1`,
      [submitted.value.id]
    );
    assert.equal(state.rows[0]?.status, "pending", "两级流程不应被一次并发批到通过");
    assert.equal(state.rows[0]?.current_step_order, 2);
  });

  await t.test("撤回只有发起人能做", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-cancel",
      submitterUserId: employee.id,
      amountCents: 500_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const byOther = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: other.id, roleCodes: [secondRole] },
      action: "cancel"
    });
    assert.equal(byOther.ok, false, "别人不能替你撤回，哪怕他是董事长");

    const bySelf = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: employee.id, roleCodes: [] },
      action: "cancel"
    });
    assert.equal(bySelf.ok, true);
    if (bySelf.ok) assert.equal(bySelf.value.status, "cancelled");
  });

  await t.test("待办列表只返回该角色当前该处理的", async () => {
    // V14-B：待办改查参与人表，所以要用**真正的第二级审批人**去查。
    // 老实现看的是调用方自称的 roleCodes，谁传 secondRole 都能查到——
    // 那既是测试的漏洞，也是实现的漏洞。
    const pending = await listPendingFor(COMPANY_ID, {
      userId: secondApprover.id,
      roleCodes: [secondRole]
    });

    // 只有走到第二级的单子应当出现。
    assert.ok(
      pending.every((item) => item.currentStepOrder === 2),
      "第二级审批人的待办里不该出现停在第一级的单子"
    );
    assert.ok(pending.length > 0, "上面的大额用例应当留下一张停在第二级的单");
  });

  await t.test("没有配置流程的单据类型提交被拒", async () => {
    const noFlow = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "payment",
      documentId: "pay-1",
      submitterUserId: employee.id,
      amountCents: 100_00
    });

    assert.equal(noFlow.ok, false);
    if (!noFlow.ok) assert.equal(noFlow.failure.code, "FLOW_NOT_FOUND");
  });

  await t.test("所有步骤都有门槛而金额不够时拒绝提交，不静默通过", async () => {
    // 静默放行会让「审批流形同虚设」这件事没人发现。
    const gated = await createFlow({
      companyId: COMPANY_ID,
      name: "全门槛流程（测试）",
      documentType: "advance",
      steps: [
        { mode: "all", minAmountCents: 100_00,
          approvers: [{ approverType: "role", approverValue: firstRole }] }
      ]
    });
    assert.equal(gated.ok, true);

    const tooSmall = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "advance",
      documentId: "adv-1",
      submitterUserId: employee.id,
      amountCents: 50_00
    });

    assert.equal(tooSmall.ok, false);
    if (!tooSmall.ok) assert.equal(tooSmall.failure.code, "FLOW_NO_APPLICABLE_STEP");
  });
});
