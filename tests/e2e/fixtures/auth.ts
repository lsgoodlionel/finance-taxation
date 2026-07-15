import { test as base, expect, type Page } from "@playwright/test";
import { createTestApiClient, type TestApiClient } from "../helpers/api-client";

export type V4Role =
  | "chairman"
  | "employee"
  | "manager"
  | "accountant"
  | "cashier"
  | "tax"
  | "auditor";

const USERS: Record<V4Role, { username: string; password: string }> = {
  chairman: { username: "v4_chairman", password: "V4-test-123456" },
  employee: { username: "v4_employee", password: "V4-test-123456" },
  manager: { username: "v4_manager", password: "V4-test-123456" },
  accountant: { username: "v4_accountant", password: "V4-test-123456" },
  cashier: { username: "v4_cashier", password: "V4-test-123456" },
  tax: { username: "v4_tax", password: "V4-test-123456" },
  auditor: { username: "v4_auditor", password: "V4-test-123456" }
};

export async function loginAs(page: Page, role: V4Role): Promise<void> {
  const user = USERS[role];
  const navTrigger = page.getByRole("button", { name: "打开导航菜单" }).or(page.getByLabel("主导航菜单"));
  const commonLanding = page.getByRole("heading", { name: /我的一天|AI 财税助手|任务中心|税务中心|凭证中心|工资管理|工资代发与社保/i });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.removeItem("finance-taxation-v2-token");
      window.localStorage.removeItem("finance-taxation-v2-refresh-token");
      // V7 双轨：基线套件统一在专业模式下运行（否则 chairman 默认进引导模式、
      // 落点变为 /dashboard/chairman，既有导航断言不再匹配）。引导模式的默认
      // 行为由 login-and-navigation.spec.ts 的专项用例覆盖。
      window.localStorage.setItem("ft.workspace-mode", "pro");
    });
    await page.goto("/");
    await page.getByLabel("用户名").fill(user.username);
    await page.getByLabel("密码").fill(user.password);
    await page.getByRole("button", { name: "登 录" }).click();

    try {
      await Promise.race([
        expect(navTrigger).toBeVisible({ timeout: 10_000 }),
        expect(commonLanding).toBeVisible({ timeout: 10_000 })
      ]);
      await expect.poll(async () => {
        const url = page.url();
        const hasToken = await page.evaluate(() => Boolean(window.localStorage.getItem("finance-taxation-v2-token")));
        return hasToken &&
          (url.endsWith("/") || /\/inbox(?:[?#]|$)/.test(url));
      }).toBeTruthy();
      return;
    } catch (error) {
      const loginError = page.getByText(/Request failed|登录失败|AUTH_REQUIRED|Too Many Requests/i);
      if (attempt === 2 || !(await loginError.isVisible().catch(() => false))) {
        throw error;
      }
      // Back off progressively — rate-limit style errors need more headroom than 1s.
      await page.waitForTimeout((attempt + 1) * 2_000);
    }
  }
}

type AuthFixtures = {
  apiClient: TestApiClient;
  loginAsRole: (role: V4Role) => Promise<{ username: string; password: string }>;
};

export const test = base.extend<AuthFixtures>({
  apiClient: async ({}, use) => {
    await use(createTestApiClient());
  },
  loginAsRole: async ({ page }, use) => {
    await use(async (role: V4Role) => {
      const user = USERS[role];
      await loginAs(page, role);
      return user;
    });
  }
});

export { expect };
