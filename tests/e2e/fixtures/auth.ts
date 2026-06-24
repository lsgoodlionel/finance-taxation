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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.removeItem("finance-taxation-v2-token");
      window.localStorage.removeItem("finance-taxation-v2-refresh-token");
    });
    await page.goto("/");
    await page.getByLabel("用户名").fill(user.username);
    await page.getByLabel("密码").fill(user.password);
    await page.getByRole("button", { name: "登 录" }).click();

    try {
      await expect(navTrigger).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => {
        const url = page.url();
        return url.endsWith("/") || /\/assistant$/.test(url);
      }).toBeTruthy();
      return;
    } catch (error) {
      const loginError = page.getByText(/Request failed|登录失败|AUTH_REQUIRED/i);
      if (attempt === 2 || !(await loginError.isVisible().catch(() => false))) {
        throw error;
      }
      await page.waitForTimeout(1_000);
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
