import { test, expect, loginAs } from "../fixtures/auth";

test("chairman can enter the application", async ({ page }) => {
  await loginAs(page, "chairman");
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("heading", { name: "我的一天" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "打开导航菜单" }).or(page.getByLabel("主导航菜单"))
  ).toBeVisible();
});

test("chairman without stored mode lands on the guided dashboard", async ({ page }) => {
  // V7 双轨：未手动选择过模式时，董事长角色默认进入引导模式，
  // 首页分流到经营驾驶舱（Stage K 将替换为 /home 老板工作台）。
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("finance-taxation-v2-token");
    window.localStorage.removeItem("finance-taxation-v2-refresh-token");
    window.localStorage.removeItem("ft.workspace-mode");
  });
  await page.goto("/");
  await page.getByLabel("用户名").fill("v4_chairman");
  await page.getByLabel("密码").fill("V4-test-123456");
  await page.getByRole("button", { name: "登 录" }).click();

  await expect(page.getByRole("heading", { name: "董事长驾驶舱" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard\/chairman(?:[?#]|$)/);
  // 存在「专业模式」切换入口（桌面在顶栏；窄视口收纳在导航抽屉内）
  const drawerTrigger = page.getByRole("button", { name: "打开导航菜单" });
  if (await drawerTrigger.isVisible().catch(() => false)) {
    await drawerTrigger.click();
  }
  await expect(page.getByText("专业模式").first()).toBeVisible();
});

test("expired session returns to the login gate", async ({ page }) => {
  await loginAs(page, "chairman");
  await page.evaluate(() => {
    localStorage.setItem("finance-taxation-v2-token", "expired");
    localStorage.removeItem("finance-taxation-v2-refresh-token");
  });

  await page.reload();

  // 过期令牌 + 无刷新令牌 → 鉴权 401 → 应用回到登录门。断言最终结果而非捕获特定
  // 401 响应：/inbox 落地页并发请求多，硬等某个响应易竞态超时（不同 CI run 同一提交
  // 一过一挂即为此）。登录门出现 + localStorage 清空已充分证明过期会话被正确处理。
  await expect(page.getByRole("button", { name: "登 录" })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.evaluate(() => ({
      token: localStorage.getItem("finance-taxation-v2-token"),
      refreshToken: localStorage.getItem("finance-taxation-v2-refresh-token")
    }))
  ).resolves.toEqual({ token: null, refreshToken: null });
});
