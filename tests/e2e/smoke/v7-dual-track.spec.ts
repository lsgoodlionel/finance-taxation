/**
 * V7 Stage M · 双轨（guided / pro）E2E 冒烟 + 移动视口轻量断言（M3 + M4-lite）
 *
 * 覆盖：
 * 1. guided：/home 老板工作台批准一笔 AI 草稿，业务点击数 ≤2（M7.1 验收口径）
 * 2. guided：/quick-entry 记一笔 3 步向导（AI 不可用走本地解析降级）
 * 3. guided：/reports 默认落老板摘要视图，不以三大专业报表为首屏
 * 4. pro：/inbox AI 草稿卡批量批准 + /close 月结 8 步看板
 * 5. 旧路由重定向回归（pdf-export / archive-package / boss-qa / documents）
 * 6. 375×812 移动视口：/home 可见、无横向滚动、主按钮触控高度 ≥40px
 *
 * 数据准备全部走 API（helpers/v7-dual-track）：属期按用例 × project 双维隔离，
 * 用例只批准自己创建的草稿（唯一标题定位），desktop / tablet 并行互不污染，
 * 且可重复运行（批准/驳回过的草稿不会重回队列，事项标题含时间戳+随机后缀）。
 */
import type { Page } from "@playwright/test";
import { test, expect, loginAs } from "../fixtures/auth";
import {
  ensureDraftForPeriod,
  loginGuidedChairman,
  pickPeriodForProject
} from "../helpers/v7-dual-track";

const APPROVE_BUTTON = /批\s*准/;
const LEDGER_JARGON = ["借方", "贷方", "科目"] as const;

/** 断言当前可见文案不含记账黑话（guided 白话验收口径）。 */
async function expectNoLedgerJargon(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText();
  for (const word of LEDGER_JARGON) {
    expect(bodyText, `guided 页面不应出现专业术语「${word}」`).not.toContain(word);
  }
}

test("guided 冒烟：/home 批准一笔 AI 草稿，业务点击 ≤2 次（M7.1）", async ({ page, apiClient }, testInfo) => {
  // Arrange：独立属期准备一条属于本用例的待批准草稿
  const period = pickPeriodForProject(testInfo, "2025-12", "2025-06");
  const { eventTitle } = await ensureDraftForPeriod(apiClient, period, "客户招待费");
  await loginGuidedChairman(page);

  // 「需要您处理的事」区加载完成（出现任一待办卡；本用例已保证 ≥1 条草稿）
  const pendingSection = page.locator('section[aria-label="需要您处理的事"]');
  await expect(pendingSection.getByRole("heading", { name: "需要您处理的事" })).toBeVisible();
  await expect(pendingSection.getByRole("button").first()).toBeVisible({ timeout: 15_000 });

  // 只批准自己的草稿卡（卡片影响行含「事由：{唯一标题}」；并行 project 共享队列）
  const ourCard = pendingSection
    .locator("div")
    .filter({ hasText: `事由：${eventTitle}` })
    .filter({ has: page.getByRole("button", { name: APPROVE_BUTTON }) })
    .last();

  // Act：登录后的业务点击计数（不含登录表单）。
  // 主路径：卡在 /home 前 3 张 → 1 次点击批准；
  // 允许路径：被更新的待办挤出前 3 → 「还有 N 件 →」进 /inbox 再批准（共 2 次点击）。
  let businessClicks = 0;
  if (await ourCard.isVisible()) {
    await ourCard.getByRole("button", { name: APPROVE_BUTTON }).click();
    businessClicks += 1;
    await expect(page.getByText(/已批准/).first()).toBeVisible({ timeout: 10_000 });
  } else {
    await pendingSection.getByRole("button", { name: /还有 \d+ 件/ }).click();
    businessClicks += 1;
    const ourItem = page.getByTestId("inbox-ai-draft-item").filter({ hasText: eventTitle }).first();
    await expect(ourItem).toBeVisible({ timeout: 15_000 });
    await ourItem.getByRole("button", { name: APPROVE_BUTTON }).click();
    businessClicks += 1;
    await expect(page.getByText(/已生成草稿凭证|已批准/).first()).toBeVisible({ timeout: 10_000 });
  }

  // Assert：M7.1 —— 批准一笔的业务点击数 ≤2
  expect(businessClicks, "M7.1：批准一笔的业务点击数必须 ≤2").toBeLessThanOrEqual(2);
});

test("guided 冒烟：/quick-entry 记一笔 3 步向导（本地解析降级）", async ({ page }) => {
  await loginGuidedChairman(page);
  await page.goto("/quick-entry");
  await expect(page.getByRole("heading", { name: "记一笔" })).toBeVisible();

  // 步骤指示全程 ≤3 步（固定 3 步：说清楚 → 确认 → 完成）
  const wizardSteps = page.locator(".v3-step-wizard__step");
  await expect(wizardSteps).toHaveCount(3);
  await expect(wizardSteps.filter({ hasText: "说清楚发生了什么" })).toBeVisible();
  await expect(wizardSteps.filter({ hasText: "确认" })).toBeVisible();
  await expect(wizardSteps.filter({ hasText: "完成" })).toBeVisible();
  await expectNoLedgerJargon(page);

  // 第 1 步：白话描述（AI 在测试环境不可用时自动降级本地正则解析）
  await page.getByRole("tab", { name: "打字描述" }).click();
  await page.getByPlaceholder(/昨天请客户吃饭花了 800/).fill("昨天请客户吃饭花了800");
  await page.getByRole("button", { name: /下一步：帮我认出金额和日期/ }).click();

  // 第 2 步：确认页应认出金额 800 与类型（日常花销），文案保持白话
  await expect(page.getByText(/日常花销 800 元/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder("比如 800")).toHaveValue("800");
  await expect(wizardSteps).toHaveCount(3);
  await expectNoLedgerJargon(page);

  // 第 3 步：确认记下 → Result 成功文案
  await page.getByRole("button", { name: /确认记下这笔账/ }).click();
  await expect(page.getByText("已记下！")).toBeVisible({ timeout: 20_000 });
  await expect(wizardSteps).toHaveCount(3);
  await expectNoLedgerJargon(page);
});

test("guided 冒烟：/reports 默认老板摘要视图，不以专业三表为首屏", async ({ page }) => {
  await loginGuidedChairman(page);
  await page.goto("/reports");

  await expect(page.getByRole("heading", { name: "财务报表中心" })).toBeVisible();
  // 顶栏「当前视图」应为老板摘要（guided 分流），而非资产负债表等专业首屏
  await expect(page.getByText("当前视图")).toBeVisible();
  await expect(page.locator('strong:has-text("老板摘要")')).toBeVisible();
  // 工作台呈现老板摘要内容或其白话空态（快照未备好时）
  await expect(
    page.getByText(/这期的经营摘要还没准备好|老板摘要 · /).first()
  ).toBeVisible({ timeout: 15_000 });
});

test("pro 冒烟：/inbox AI 草稿批量批准 + /close 月结 8 步看板", async ({ page, apiClient }, testInfo) => {
  // Arrange：独立属期准备一条属于本用例的待批准草稿
  const period = pickPeriodForProject(testInfo, "2025-11", "2025-05");
  const { eventTitle } = await ensureDraftForPeriod(apiClient, period, "采购报销");
  await loginAs(page, "chairman");
  await expect(page).toHaveURL(/\/inbox(?:[?#]|$)/);

  const draftsCard = page.getByTestId("inbox-ai-drafts");
  await expect(draftsCard).toBeVisible();
  // 按属期批量生成入口始终存在
  await expect(draftsCard.getByRole("button", { name: /生成本期草稿/ })).toBeVisible();

  // 等列表加载后定位本用例的草稿（默认仅显示前 4 条，必要时先展开全部）
  await expect(draftsCard.getByTestId("inbox-ai-draft-item").first()).toBeVisible({ timeout: 15_000 });
  const ourItem = draftsCard.getByTestId("inbox-ai-draft-item").filter({ hasText: eventTitle }).first();
  if (!(await ourItem.isVisible())) {
    await draftsCard.getByRole("button", { name: /展开全部/ }).click();
  }
  await expect(ourItem).toBeVisible();

  // 勾选 1 条 → 批量操作条出现 → 批量批准（Popconfirm 二次确认）
  await ourItem.getByRole("checkbox").check();
  await expect(draftsCard.getByTestId("inbox-draft-batch-bar")).toBeVisible();
  await draftsCard.getByRole("button", { name: /批量批准/ }).click();
  await page.getByRole("button", { name: /确认批准/ }).click();
  await expect(page.getByText(/批量批准完成：成功 1 条/).first()).toBeVisible({ timeout: 15_000 });

  // /close：8 步月结看板，含「结转损益」步骤
  await page.goto("/close");
  await expect(page.getByRole("heading", { name: /月度结账/ })).toBeVisible();
  await expect(page.locator(".ant-steps-item")).toHaveCount(8, { timeout: 15_000 });
  await expect(page.getByText("结转损益").first()).toBeVisible();
});

test("旧路由重定向回归：pdf-export / archive-package / boss-qa / documents", async ({ page }) => {
  await loginAs(page, "chairman");

  const redirectCases: ReadonlyArray<{ legacy: string; expected: RegExp }> = [
    { legacy: "/pdf-export", expected: /\/export-center(?:[?#]|$)/ },
    { legacy: "/archive-package", expected: /\/export-center(?:[?#]|$)/ },
    { legacy: "/boss-qa", expected: /\/assistant(?:[?#]|$)/ },
    { legacy: "/documents", expected: /\/bills\?tab=documents(?:[#]|$)/ }
  ];

  for (const { legacy, expected } of redirectCases) {
    await page.goto(legacy);
    await expect(page, `${legacy} 应重定向`).toHaveURL(expected);
  }
});

test.describe("移动视口 375×812（M4-lite）", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("guided /home 可见、无横向滚动、主按钮触控高度 ≥40px", async ({ page, apiClient }, testInfo) => {
    // Arrange：保证待办区有卡片（草稿卡带主操作按钮）
    const period = pickPeriodForProject(testInfo, "2025-10", "2025-04");
    await ensureDraftForPeriod(apiClient, period, "移动端验收费用");
    await loginGuidedChairman(page);

    // 待办区加载出至少一个操作按钮（批准/看详情/还有 N 件，guided 均为大触控目标）
    const pendingSection = page.locator('section[aria-label="需要您处理的事"]');
    const actionButton = pendingSection.getByRole("button").first();
    await expect(actionButton).toBeVisible({ timeout: 15_000 });

    // 无横向滚动（允许 1px 舍入余量）
    const fitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(fitsViewport, "移动视口下页面不应出现横向滚动").toBe(true);

    // 主操作按钮触控高度 ≥40px
    const box = await actionButton.boundingBox();
    expect(box, "待办区主按钮应有可测量的几何尺寸").not.toBeNull();
    expect(box!.height, "主按钮触控高度应 ≥40px").toBeGreaterThanOrEqual(40);
  });
});
