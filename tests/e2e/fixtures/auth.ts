import { test as base, expect, type Page } from "@playwright/test";

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
  await page.goto("/");
  await page.getByLabel("用户名").fill(user.username);
  await page.getByLabel("密码").fill(user.password);
  await page.getByRole("button", { name: "登 录" }).click();
  await expect(page.getByText("AI 财税助手")).toBeVisible();
}

export const test = base;
export { expect };
