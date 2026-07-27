/**
 * 深度 a11y 审计 · 键盘导航冒烟（车道 C）
 *
 * 背景：V7 M4-lite 只断言了移动视口 + 触控高度，从未验证过键盘可达性。
 * 本用例作为护栏，覆盖两条最关键的回归风险：
 * 1. guided /home「需要您处理的事」的批准动作必须能纯键盘（Tab + Enter）完成，
 *    不能只响应鼠标 click（回归此前 InboxTasksCard/RiskCard/ApprovalsCard 等
 *    「clickable <div>」反模式的一类问题）。
 * 2. 键盘聚焦时必须有可见的焦点轮廓（global.css 的 :focus-visible 规则），
 *    防止未来样式改动悄悄去掉它。
 */
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/auth";
import { ensureDraftForPeriod, loginGuidedChairman, pickPeriodForProject } from "../helpers/v7-dual-track";

const APPROVE_BUTTON = /批\s*准/;
const MAX_TAB_PRESSES = 40;

/** 从当前焦点开始按 Tab，直到聚焦到目标 locator 或用完尝试次数。 */
async function tabUntilFocused(page: Page, target: ReturnType<Page["getByRole"]>): Promise<boolean> {
  for (let i = 0; i < MAX_TAB_PRESSES; i += 1) {
    const isFocused = await target.evaluate(
      (el) => el === document.activeElement
    ).catch(() => false);
    if (isFocused) return true;
    await page.keyboard.press("Tab");
  }
  return target.evaluate((el) => el === document.activeElement).catch(() => false);
}

test("guided 键盘冒烟：/home 纯键盘（Tab+Enter）批准一笔 AI 草稿", async ({ page, apiClient }, testInfo) => {
  const period = pickPeriodForProject(testInfo, "2025-09", "2025-03");
  const { eventTitle } = await ensureDraftForPeriod(apiClient, period, "键盘冒烟报销");
  await loginGuidedChairman(page);

  const pendingSection = page.locator('section[aria-label="需要您处理的事"]');
  await expect(pendingSection.getByRole("heading", { name: "需要您处理的事" })).toBeVisible();
  await expect(pendingSection.getByRole("button").first()).toBeVisible({ timeout: 15_000 });

  const ourCard = pendingSection
    .locator("div")
    .filter({ hasText: `事由：${eventTitle}` })
    .filter({ has: page.getByRole("button", { name: APPROVE_BUTTON }) })
    .last();

  // 数据可能被挤出前 3 张卡，退回 /inbox 场景由既有鼠标冒烟覆盖；
  // 键盘冒烟只锁定「卡片可见」这条最常见路径，避免和数据竞态耦合过深。
  test.skip(!(await ourCard.isVisible().catch(() => false)), "本用例的草稿卡未落在 /home 前 3 张，交由既有鼠标冒烟覆盖");

  const approveButton = ourCard.getByRole("button", { name: APPROVE_BUTTON });

  // 从页面顶部开始纯键盘导航到「批准」按钮（不调用 .click() / .focus()）
  await page.keyboard.press("Tab");
  const reached = await tabUntilFocused(page, approveButton);
  expect(reached, "键盘 Tab 应能够到达批准按钮（不能只支持鼠标点击）").toBe(true);

  // 聚焦态应有可见轮廓（global.css :focus-visible 规则）
  const outlineStyle = await approveButton.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outlineStyle, "键盘聚焦的按钮应有可见焦点轮廓（不能是 outline: none）").not.toBe("none");

  // Enter 激活（等价于点击），验证批准动作可纯键盘完成
  await page.keyboard.press("Enter");
  await expect(page.getByText(/已批准/).first()).toBeVisible({ timeout: 10_000 });
});
