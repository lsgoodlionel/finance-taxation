/**
 * 会签 / 或签 / 动态加签的路径级断言（V14-B）。
 *
 * 推进条件的判断已由 `engine.test.ts` 的 `isStepSatisfied` 钉住。这里测只有
 * 连库才成立的：参与人在提交时真的被解析成了具体的人、会签真的要等齐、
 * 或签真的一个人就够、加签真的只有当前步骤的人能做。
 *
 * 与 `approval.integration.test.ts` 分开一个文件：那个文件是 V13 的回归护栏
 * （护栏 2），混进新用例会让「哪些是老的」看不出来。
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

test("会签、或签与动态加签", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createFlow, submitForApproval, act, addParticipant, listParticipants, listPendingFor } =
    await import("./store.js");

  const users = await pool.query<{ id: string; role_codes: string[] }>(
    `select u.id, array_agg(ur.role_id) as role_codes
       from users u left join user_roles ur on ur.user_id = u.id
      where u.company_id = $1 group by u.id order by u.id`,
    [COMPANY_ID]
  );
  const withRole = users.rows.filter((row) => row.role_codes[0] != null);
  assert.ok(withRole.length >= 4, "种子里至少要有四个各持一个角色的用户");

  const submitter = withRole[0]!;
  const alice = withRole[1]!;
  const bob = withRole[2]!;
  const carol = withRole[3]!;

  await t.test("会签：两个人都批完才推进", async () => {
    const flow = await createFlow({
      companyId: COMPANY_ID,
      name: "会签流程（测试）",
      documentType: "reimbursement",
      steps: [
        {
          mode: "all",
          minAmountCents: 0,
          approvers: [
            { approverType: "user", approverValue: alice.id },
            { approverType: "user", approverValue: bob.id }
          ]
        }
      ]
    });
    assert.equal(flow.ok, true);

    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-countersign",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const participants = await listParticipants(submitted.value.id);
    assert.equal(participants.length, 2, "会签步骤应当物化出两个参与人");
    assert.ok(participants.every((p) => p.status === "pending"));

    // 第一个人批完——**不能推进**。
    const first = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: alice.id, roleCodes: alice.role_codes },
      action: "approve"
    });
    assert.equal(first.ok, true);
    assert.equal(first.ok && first.value.status, "pending", "会签只批了一个就通过了");
    assert.equal(first.ok && first.value.currentStepOrder, 1);

    // 他自己的待办应当消失了——他做完了，等的是别人。
    const aliceTodo = await listPendingFor(COMPANY_ID, {
      userId: alice.id,
      roleCodes: alice.role_codes
    });
    assert.equal(
      aliceTodo.some((item) => item.id === submitted.value.id),
      false,
      "批过的人待办里还留着这条"
    );

    // 而另一个人的待办里还在。
    const bobTodo = await listPendingFor(COMPANY_ID, {
      userId: bob.id,
      roleCodes: bob.role_codes
    });
    assert.equal(bobTodo.some((item) => item.id === submitted.value.id), true);

    // 第二个人批完——通过。
    const second = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: bob.id, roleCodes: bob.role_codes },
      action: "approve"
    });
    assert.equal(second.ok, true);
    assert.equal(second.ok && second.value.status, "approved");
    assert.equal(second.ok && second.value.currentStepOrder, null);
  });

  await t.test("会签：同一个人不能批两次", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-double",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: alice.id, roleCodes: alice.role_codes },
      action: "approve"
    });
    const again = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: alice.id, roleCodes: alice.role_codes },
      action: "approve"
    });

    assert.equal(again.ok, false);
    assert.equal(again.ok === false && again.failure.code, "PARTICIPANT_ALREADY_ACTED");
  });

  await t.test("会签：一人驳回即整单驳回，不等其他人", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-veto",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const rejected = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: bob.id, roleCodes: bob.role_codes },
      action: "reject",
      comment: "金额不合理"
    });

    // 会签的意思是「都同意才算过」，一票否决是它的定义而不是简化。
    assert.equal(rejected.ok, true);
    assert.equal(rejected.ok && rejected.value.status, "rejected");
  });

  await t.test("或签：任一人批准即推进", async () => {
    const flow = await createFlow({
      companyId: COMPANY_ID,
      name: "或签流程（测试）",
      documentType: "advance",
      steps: [
        {
          mode: "any",
          minAmountCents: 0,
          approvers: [
            { approverType: "user", approverValue: alice.id },
            { approverType: "user", approverValue: bob.id }
          ]
        }
      ]
    });
    assert.equal(flow.ok, true);

    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "advance",
      documentId: "adv-either",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const approved = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: alice.id, roleCodes: alice.role_codes },
      action: "approve"
    });
    assert.equal(approved.ok, true);
    assert.equal(approved.ok && approved.value.status, "approved");

    // 另一个人的待办里也应当没有了——单据已经结束。
    const bobTodo = await listPendingFor(COMPANY_ID, {
      userId: bob.id,
      roleCodes: bob.role_codes
    });
    assert.equal(bobTodo.some((item) => item.id === submitted.value.id), false);
  });

  await t.test("角色下没有成员时提交被拒，不静默跳过这一级", async () => {
    const flow = await createFlow({
      companyId: COMPANY_ID,
      name: "空角色流程（测试）",
      documentType: "contract",
      steps: [
        {
          mode: "all",
          minAmountCents: 0,
          approvers: [{ approverType: "role", approverValue: "role-nobody-holds-this" }]
        }
      ]
    });
    assert.equal(flow.ok, true);

    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "contract",
      documentId: "ct-empty-role",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });

    // 跳过等于让这一级审批凭空消失，而消失是看不见的。
    assert.equal(submitted.ok, false);
    assert.equal(submitted.ok === false && submitted.failure.code, "FLOW_STEP_HAS_NO_APPROVER");
  });

  await t.test("建流程时空审批人的步骤被拒", async () => {
    const flow = await createFlow({
      companyId: COMPANY_ID,
      name: "空步骤流程（测试）",
      documentType: "payment",
      steps: [{ mode: "all", minAmountCents: 0, approvers: [] }]
    });
    assert.equal(flow.ok, false);
    assert.equal(flow.ok === false && flow.failure.code, "FLOW_STEP_HAS_NO_APPROVER");
  });

  // ── 动态加签 ────────────────────────────────────────────────────────

  await t.test("加签：当前步骤的人能把别人拉进来，会签因此多等一个", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-added",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const added = await addParticipant({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      targetUserId: carol.id,
      actorUserId: alice.id
    });
    assert.equal(added.ok, true);
    if (!added.ok) return;
    assert.equal(added.value.length, 3);

    const carolRow = added.value.find((p) => p.userId === carol.id)!;
    // 「本来就有的」与「审批中被拉进来的」要分得出来——审计第一个会问这个。
    assert.equal(carolRow.isAdded, true);
    assert.equal(carolRow.addedByUserId, alice.id);

    // 原来两个人批完还不够，现在要等第三个。
    for (const actor of [alice, bob]) {
      const r = await act({
        companyId: COMPANY_ID,
        instanceId: submitted.value.id,
        actor: { userId: actor.id, roleCodes: actor.role_codes },
        action: "approve"
      });
      assert.equal(r.ok, true);
      assert.equal(r.ok && r.value.status, "pending", "加签进来的人还没批就通过了");
    }

    const final = await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: carol.id, roleCodes: carol.role_codes },
      action: "approve"
    });
    assert.equal(final.ok, true);
    assert.equal(final.ok && final.value.status, "approved");
  });

  await t.test("非参与人加不了签", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-add-authz",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    // 加签的语义是「这事我拿不准，得让 X 也看看」，说这句话的人必须是正在
    // 处理这一步的人。任何人都能加签的话，加签就成了往别人流程里塞人的工具。
    const denied = await addParticipant({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      targetUserId: carol.id,
      actorUserId: submitter.id
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false && denied.failure.code, "NOT_AUTHORIZED");
  });

  await t.test("已结束的单加不了签", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-add-closed",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    await act({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      actor: { userId: alice.id, roleCodes: alice.role_codes },
      action: "reject"
    });

    const denied = await addParticipant({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      targetUserId: carol.id,
      actorUserId: alice.id
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false && denied.failure.code, "INVALID_TRANSITION");
  });

  await t.test("同一人重复加签是无操作，不报错", async () => {
    const submitted = await submitForApproval({
      companyId: COMPANY_ID,
      documentType: "reimbursement",
      documentId: "rmb-add-twice",
      submitterUserId: submitter.id,
      amountCents: 100_00
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    await addParticipant({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      targetUserId: carol.id,
      actorUserId: alice.id
    });
    const again = await addParticipant({
      companyId: COMPANY_ID,
      instanceId: submitted.value.id,
      targetUserId: carol.id,
      actorUserId: alice.id
    });

    // 报错没有意义——目的（这个人要参与）已经达成了。
    assert.equal(again.ok, true);
    assert.equal(again.ok && again.value.length, 3);
  });
});
