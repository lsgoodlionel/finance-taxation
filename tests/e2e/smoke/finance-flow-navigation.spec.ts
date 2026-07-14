import { test, expect } from "../fixtures/auth";

type EventDetailPayload = {
  id: string;
  title: string;
  generatedDocuments: Array<{ id: string; title: string }>;
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
  await expect(page).toHaveURL(/\/inbox$/);
  const token = await apiClient.login("finance", "123456");
  const event = await apiClient.get<EventDetailPayload>(`/api/events/${TARGET_EVENT.id}`, token);
  expect(event.generatedDocuments.length).toBeGreaterThan(0);
  const targetDocument = event.generatedDocuments[0];

  await page.goto("/events");
  await page.getByRole("button", { name: TARGET_EVENT.title }).click();
  await expect(page.getByRole("heading", { name: event.title })).toBeVisible();

  // G2 票据中心聚合：/documents 深链现在重定向到 /bills?tab=documents（Tab 容器）。
  await page.getByRole("button", { name: "前往单据中心 →" }).click();
  await expect(page).toHaveURL(/\/bills\?tab=documents/);
  await expect(page.getByRole("heading", { name: "单据中心" })).toBeVisible();
  // 等待页面默认自动选中的单据详情先加载完成，避免与下面手动选中的异步请求竞态
  // （单据详情由两个独立的 fetch 链路写入同一份 state，先到先得）。
  await expect(page.getByRole("button", { name: "查看凭证中心" })).toBeVisible();

  // 该深链经由 <Navigate replace> 重定向，不再携带原 router state 自动定位目标单据；
  // 在单据列表中按标题手动选中目标单据，以继续核对事项上下文（符合新 IA 下的真实行为）。
  const targetDetailLoaded = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/documents/${targetDocument.id}`) &&
      response.request().method() === "GET" &&
      response.status() === 200
  );
  await page.getByRole("row", { name: targetDocument.title }).click();
  // 等待目标单据自身的详情请求完成，避免与默认选中单据的详情请求产生竞态覆盖。
  await targetDetailLoaded;

  await page.getByRole("button", { name: "查看凭证中心" }).click();
  await expect(page).toHaveURL(/\/vouchers$/);
  await expect(page.getByRole("heading", { name: "凭证中心" })).toBeVisible();
  await expect(page.getByText(event.id)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/bills\?tab=documents/);
  await expect(page.getByRole("heading", { name: "单据中心" })).toBeVisible();
});
