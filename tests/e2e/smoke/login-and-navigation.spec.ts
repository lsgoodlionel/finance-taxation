import { test, expect, loginAs } from "../fixtures/auth";

test("chairman can enter the application", async ({ page }) => {
  await loginAs(page, "chairman");
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByRole("heading", { name: "AI 财税助手" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "打开导航菜单" }).or(page.getByLabel("主导航菜单"))
  ).toBeVisible();
});

test("expired session returns to the login gate", async ({ page }) => {
  await loginAs(page, "chairman");
  await page.evaluate(() => {
    localStorage.setItem("finance-taxation-v2-token", "expired");
    localStorage.removeItem("finance-taxation-v2-refresh-token");
  });

  const unauthorizedResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/access/me") &&
      response.request().method() === "GET" &&
      response.status() === 401
  );
  await page.reload();
  await unauthorizedResponse;

  await expect(page.getByRole("button", { name: "登 录" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.evaluate(() => ({
      token: localStorage.getItem("finance-taxation-v2-token"),
      refreshToken: localStorage.getItem("finance-taxation-v2-refresh-token")
    }))
  ).resolves.toEqual({ token: null, refreshToken: null });
});
