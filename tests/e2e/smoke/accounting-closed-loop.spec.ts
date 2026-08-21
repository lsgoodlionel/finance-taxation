/**
 * 核心账务闭环的 E2E（P0-1）。
 *
 * ## 为什么必须有这一条
 *
 * 一个月回顾把「E2E 补齐核心账务闭环：起草 → 审核 → 过账 → 红冲 → 报表」
 * 列进 P0，理由是**这条线此前只有单元覆盖**。而本月最严重的四个缺陷里，
 * 「过账恒 400」和「结转后损益全归零」都在这条线上——单元测试全绿，
 * 功能自上线起从未可用。
 *
 * ## 走 API 而不是点 UI
 *
 * 这条链路的价值在于「五步真的能连起来」，不在于按钮长什么样。
 * 点 UI 会引入弹窗时序、表格分页这些与账务无关的脆弱点，
 * 而它们一旦 flaky，人就会开始忽略这条测试的失败——那时它就白做了。
 *
 * UI 侧的覆盖由其余九个 smoke 用例负责。
 *
 * ## 职责分离是硬约束
 *
 * 复核人 ≠ 过账人、过账人 ≠ 终审人。所以这条链路**必须三个人走**：
 * 会计起草并复核、出纳过账、财务负责人终审。
 * 用一个人跑通反而说明约束坏了。
 */

import { test, expect } from "../fixtures/auth";

interface VoucherPayload {
  id: string;
  status: string;
  voucherWord?: string | null;
  voucherSeq?: number | null;
}

interface EventPayload {
  id: string;
}

interface TrialBalancePayload {
  isBalanced: boolean;
  totals: {
    closing: { debit: string; credit: string; difference: string; isBalanced: boolean };
  };
}

test("账务闭环：起草 → 审核 → 过账 → 红冲 → 报表", async ({ apiClient }) => {
  // 三个角色各自的 token——职责分离要求这三步不能是同一个人。
  const accountant = await apiClient.login("v4_accountant", "V4-test-123456");
  const cashier = await apiClient.login("v4_cashier", "V4-test-123456");
  const manager = await apiClient.login("v4_manager", "V4-test-123456");

  // ── 起草 ──────────────────────────────────────────────────────────────
  //
  // 凭证必须挂在经营事项上——那是「凭证是业务的产物」这个设计的表达。
  const events = await apiClient.get<{ items: EventPayload[] }>("/api/events", accountant);
  const eventId = (events.items ?? (events as unknown as EventPayload[]))[0]?.id;
  expect(eventId, "种子里应当有经营事项，否则凭证建不出来").toBeTruthy();

  const draft = await apiClient.post<VoucherPayload>("/api/vouchers", accountant, {
    templateKey: "expense",
    amount: 1234.56,
    businessEventId: eventId,
    summary: "E2E 账务闭环测试"
  });
  expect(draft.id, "起草应当返回凭证 id").toBeTruthy();
  expect(draft.status, "新建的凭证必须是草稿").toBe("draft");

  // ── 审核 ──────────────────────────────────────────────────────────────
  const approved = await apiClient.post<VoucherPayload>(
    `/api/vouchers/${draft.id}/approve`,
    accountant
  );
  expect(approved.status, "复核后应当变成已审核").toBe("approved");

  // ── 过账 ──────────────────────────────────────────────────────────────
  //
  // 这一步曾**对任何调用恒返回 400**，而 809 个测试全绿。
  // 换出纳来过账：复核人 ≠ 过账人。
  const posted = await apiClient.post<VoucherPayload>(`/api/vouchers/${draft.id}/post`, cashier, {
    authorizerUserId: "usr-v4-manager"
  });
  expect(posted.status, "过账后应当是 posted").toBe("posted");
  // 过账时才分配凭证字号——草稿不占号，否则作废的草稿会在号段里留洞。
  expect(posted.voucherSeq, "过账应当分配凭证号").toBeTruthy();

  // ── 报表：过账后的数进得去 ────────────────────────────────────────────
  //
  // 「结转后损益全归零」那个缺陷就在这一步暴露不出来——因为没人走到这里。
  const period = new Date().toISOString().slice(0, 7);
  const trial = await apiClient.get<TrialBalancePayload>(
    `/api/reports/trial-balance?period=${period}`,
    manager
  );
  // 试算平衡是账本身对不对的判据。三组合计任一组不平，
  // 三张法定报表照样出得来、只是它们是错的。
  expect(
    trial.totals.closing.isBalanced,
    `期末合计不平衡，差额 ${trial.totals.closing.difference}`
  ).toBe(true);

  // ── 红冲 ──────────────────────────────────────────────────────────────
  //
  // 已过账的凭证唯一合法的更正出口。改是不允许的——改会让历史报表对不上。
  const reversal = await apiClient.post<VoucherPayload>(
    `/api/vouchers/${draft.id}/reverse`,
    cashier,
    { reason: "E2E 闭环测试红冲" }
  );
  expect(reversal.id, "红冲应当生成一张新凭证").toBeTruthy();
  expect(reversal.id).not.toBe(draft.id);
  // 红冲生成的是**草稿**，同样要走复核过账——系统不给自己开免检通道。
  expect(reversal.status, "红冲凭证应当是草稿").toBe("draft");

  // ── 红冲之后账仍然平 ──────────────────────────────────────────────────
  const afterReversal = await apiClient.get<TrialBalancePayload>(
    `/api/reports/trial-balance?period=${period}`,
    manager
  );
  expect(
    afterReversal.totals.closing.isBalanced,
    "红冲草稿还没过账，账面不该变化，更不该变得不平"
  ).toBe(true);
});

test("职责分离：同一个人不能既复核又过账", async ({ apiClient }) => {
  // 这条约束**任何角色都绕不过去**，包括董事长。它不是可配置的选项，
  // 而是内控的底线——上面那条闭环之所以要三个人走，就是因为它。
  const accountant = await apiClient.login("v4_accountant", "V4-test-123456");

  const events = await apiClient.get<{ items: EventPayload[] }>("/api/events", accountant);
  const eventId = (events.items ?? (events as unknown as EventPayload[]))[0]?.id;

  const draft = await apiClient.post<VoucherPayload>("/api/vouchers", accountant, {
    templateKey: "expense",
    amount: 99.99,
    businessEventId: eventId,
    summary: "E2E 职责分离测试"
  });
  await apiClient.post(`/api/vouchers/${draft.id}/approve`, accountant);

  // 同一个会计既复核又过账——应当被拒。
  let rejected = false;
  try {
    await apiClient.post(`/api/vouchers/${draft.id}/post`, accountant, {
      authorizerUserId: "usr-v4-manager"
    });
  } catch {
    rejected = true;
  }
  expect(rejected, "复核人自己过账竟然成功了——职责分离约束失效").toBe(true);
});
