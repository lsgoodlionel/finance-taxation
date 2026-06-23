import { test, expect, loginAs } from "../fixtures/auth";

test("finance flow bar preserves the core navigation chain", async ({ page }) => {
  await loginAs(page, "manager");
  await page.goto("/events");

  await expect(page.getByText("经营事项总线")).toBeVisible();
  await expect(page.getByRole("button", { name: /经营事项/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /任务分派/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /单据补齐/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /凭证记账/ })).toBeVisible();

  await page.getByRole("button", { name: /任务分派/ }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByText("任务中心")).toBeVisible();
});
