import { test, expect } from "../fixtures/auth";

type EventDetailPayload = {
  id: string;
  title: string;
  generatedDocuments: Array<{ id: string }>;
  vouchers: Array<{ id: string }>;
};

const TARGET_EVENT = {
  id: "evt-020",
  title: "2026年4月个人所得税扣缴申报"
} as const;

test("finance flow navigation keeps an existing business event context visible across result pages", async ({
  page,
  apiClient
}) => {
  await page.goto("/");
  await page.getByLabel("用户名").fill("finance");
  await page.getByLabel("密码").fill("123456");
  await page.getByRole("button", { name: "登 录" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  const token = await apiClient.login("finance", "123456");
  const event = await apiClient.get<EventDetailPayload>(`/api/events/${TARGET_EVENT.id}`, token);
  expect(event.generatedDocuments.length).toBeGreaterThan(0);

  await page.goto("/events");
  await page.getByRole("button", { name: TARGET_EVENT.title }).click();
  await expect(page.getByRole("heading", { name: event.title })).toBeVisible();

  await page.getByRole("button", { name: "前往单据中心 →" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("heading", { name: "单据中心" })).toBeVisible();
  await expect(page.getByText(event.id)).toBeVisible();

  await page.getByRole("button", { name: "查看凭证中心" }).click();
  await expect(page).toHaveURL(/\/vouchers$/);
  await expect(page.getByRole("heading", { name: "凭证中心" })).toBeVisible();
  await expect(page.getByText(event.id)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByText(event.id)).toBeVisible();
});
