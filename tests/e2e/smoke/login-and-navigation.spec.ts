import { test, expect, loginAs } from "../fixtures/auth";

test("chairman can enter the application", async ({ page }) => {
  await loginAs(page, "chairman");
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByText("AI 财税助手")).toBeVisible();
});

test("expired session returns to the login gate", async ({ page }) => {
  await loginAs(page, "accountant");
  await page.evaluate(() => {
    localStorage.setItem("finance-taxation-v2-token", "expired");
    localStorage.removeItem("finance-taxation-v2-refresh-token");
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "登 录" })).toBeVisible();
});
