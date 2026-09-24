/**
 * 凭证的关键动作**在页面上真的点得到**（V16 收口）。
 *
 * ## 为什么单独加这一条
 *
 * 这一轮最贵的两个教训都是同一个形状：
 *
 * 1. **红冲按钮是死代码**。V15 我补了红冲入口，提交信息里还嘲讽了
 *    「手册承诺了一个不存在的按钮」——而我补的按钮同样不存在，
 *    因为它嵌在 `{!isPosted && ...}` 里，条件恒假。
 *    当时 tsc 干净、1025 条单测全绿、前台入口护栏也绿。
 *
 * 2. **前台无法过账任何凭证**。`postVoucher()` 写死发空 body，
 *    而服务端要求终审人，每次 400。API 层的过账测试全是绿的——
 *    因为测试自己把 `authorizerUserId` 传进去了。
 *
 * 两者的共同点：**所有不打开浏览器的检查都通过了**。
 *
 * 既有的 `accounting-closed-loop.spec.ts` 走 API，专门验业务链路；
 * 这一条走**页面**，只验一件事——按钮在不在、点不点得动。
 * 两条各司其职，不要合并。
 */

import { test, expect } from "../fixtures/auth";
import { loginAs } from "../fixtures/auth";

test("凭证中心：草稿能审核、待过账能过账（要选终审人）、已过账能红冲", async ({
  page,
  apiClient
}) => {
  // **先用 API 造一张确定合规的凭证**，再回页面上点它。
  //
  // 不从列表里碰运气挑：种子里的凭证形状各异（有的用汇总科目，过账会被
  // 正确地拦下来），挑到哪一张会让这条测试时红时绿。
  // 这条测试要验的是**按钮能不能点**，不该被数据形状干扰。
  const employee = await apiClient.login("v4_employee", "V4-test-123456");
  const event = await apiClient.post<{ id: string }>("/api/events", employee, {
    type: "expense",
    title: "[E2E] 凭证动作可点性",
    occurredOn: new Date().toISOString().slice(0, 10),
    description: "验证审核/过账/红冲三个按钮"
  });
  const accountantToken = await apiClient.login("v4_accountant", "V4-test-123456");
  const voucher = await apiClient.post<{ id: string }>("/api/vouchers", accountantToken, {
    templateKey: "expense",
    amount: "1234.56",
    businessEventId: event.id,
    summary: "[E2E] 凭证动作可点性"
  });

  // **复核用财务负责人、过账用会计**：职责分离要求复核人 ≠ 过账人。
  // 第一版让会计一个人走完，被服务端正确地拦下来（WORKFLOW_DUTY_CONFLICT）——
  // 那是规则在起作用，不是缺陷。
  await apiClient.post(`/api/vouchers/${voucher.id}/approve`, await apiClient.login("v4_manager", "V4-test-123456"));

  await loginAs(page, "accountant");
  await page.goto("/vouchers");
  await expect(page.getByRole("heading", { name: /凭证中心/ })).toBeVisible();

  // 用搜索定位到刚建的那一张，不依赖列表顺序。
  const targetRow = page.locator("tbody tr").filter({ hasText: "[E2E] 凭证动作可点性" }).first();
  await expect(targetRow, `刚建的凭证 ${voucher.id} 应当出现在列表里`).toBeVisible({
    timeout: 15_000
  });
  await targetRow.click();

  // 收窄到详情面板：列表每行也有快捷按钮，不限定区域会命中五个同名按钮。
  const detailPanel = page.getByRole("region", { name: "凭证详情" });
  await expect(detailPanel).toBeVisible({ timeout: 10_000 });

  // ── 待过账：过账按钮在，且点开后要选终审人 ──────────────────────────────
  //
  // 复核已由财务负责人在上面做掉了（职责分离）。
  // 「审核通过」按钮本身的可见性由 voucher-detail-actions.test.tsx 逐状态钉住，
  // 这里不重复——那条是渲染测试，跑得快得多。
  // 不用 exact：按钮带图标，可访问名不是纯文本。
  // 用 /^过账$/ 仍能与「打印预览」区分开。
  const postButton = detailPanel.getByRole("button", { name: /过账/ }).first();
  await expect(postButton, "复核之后必须能过账").toBeVisible({ timeout: 10_000 });
  await postButton.click();

  // **终审人选择器必须出现**。此前这里直接发空 body，每次 400
  // WORKFLOW_AUTHORIZATION_REQUIRED，还以未翻译的英文弹出来。
  const dialog = page.locator(".ant-modal-confirm").last();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(
    dialog.getByText("终审人（必填）"),
    "过账对话框必须让人选终审人——服务端要求终审人 ≠ 执行人"
  ).toBeVisible();

  // 选一个终审人再确认。名单由服务端按 ledger.post 过滤，
  // 当前用户被排除掉（他是执行人）。
  await dialog.locator(".ant-select").click();
  await page.locator(".ant-select-item-option").first().click();
  // 点**对话框里**那个确认按钮：列表行上也有同名按钮，
  // 不限定范围会点到别的地方去（第一版就是这样，对话框一直开着）。
  // 抓一下过账请求的真实响应，失败时能看到原因而不是只看到「对话框没关」。
  const postResponse = page.waitForResponse(
    (r) => r.url().includes("/post") && r.request().method() === "POST",
    { timeout: 15_000 }
  );
  await dialog.getByRole("button", { name: /确认过账/ }).click();
  const response = await postResponse;
  const body = await response.text();
  expect(
    response.status(),
    `过账请求失败：${response.status()} ${body.slice(0, 300)}`
  ).toBe(200);
  await expect(dialog, "确认之后对话框应当关掉").toBeHidden({ timeout: 15_000 });

  // ── 已过账：红冲按钮必须在 ──────────────────────────────────────────────
  //
  // 这是那个「三道防线全绿、按钮却不存在」的按钮。
  await expect(
    detailPanel.getByRole("button", { name: "红冲" }),
    "已过账凭证必须有红冲入口——这是唯一合法的更正出口，手册里写着它"
  ).toBeVisible({ timeout: 15_000 });
});
