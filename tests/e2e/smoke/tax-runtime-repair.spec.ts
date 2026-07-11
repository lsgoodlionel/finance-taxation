import { test, expect } from "../fixtures/auth";

const BATCH_ID = "TAX-BATCH-RETRY";

const draftBatch = {
  id: BATCH_ID,
  companyId: "company-demo",
  taxType: "增值税",
  filingPeriod: "2026-05",
  status: "review_required",
  itemIds: ["tax-item-runtime-1"],
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-06-01T09:00:00.000Z"
};

const reviewedBatchDetail = {
  ...draftBatch,
  status: "ready",
  updatedAt: "2026-06-01T09:30:00.000Z",
  items: [],
  reviews: [
    {
      id: "tax-review-runtime-1",
      companyId: "company-demo",
      batchId: BATCH_ID,
      reviewedByUserId: "user-tax",
      reviewedByName: "税务专员",
      reviewResult: "approved",
      reviewNotes: "runtime quick retry",
      reviewedAt: "2026-06-01T09:30:00.000Z"
    }
  ],
  archives: []
};

test("/tax renders runtime repair action and submits retry feedback", async ({ page }, testInfo) => {
  let reviewRequestBody = "";
  let reviewRequestCount = 0;

  await page.addInitScript(() => {
    window.localStorage.setItem("finance-taxation-v2-token", "smoke-tax-token");
    window.localStorage.setItem("finance-taxation-v2-refresh-token", "smoke-tax-refresh");
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/access/me") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-tax",
          companyId: "company-demo",
          username: "v4_tax",
          displayName: "税务专员",
          roleIds: ["role-tax-specialist"],
          departmentName: "税务部"
        })
      });
      return;
    }

    if (url.pathname === "/api/access/menu") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [] })
      });
      return;
    }

    if (url.pathname === "/api/inbox") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          totalPending: 0,
          items: []
        })
      });
      return;
    }

    if (url.pathname === "/api/runtime/tax") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          summary: {
            executionState: "failed",
            executionLabel: "存在失败原因",
            executionMessage: "当前税务链路存在失败原因，需先执行修复动作。",
            authorizationState: "authorized",
            authorizationLabel: "你可执行修复",
            authorizationMessage: "当前身份可直接推进税务复核修复。",
            stats: [
              { label: "待处理", value: "1" },
              { label: "异常项", value: "1" },
              { label: "已完成", value: "0" }
            ],
            issue: {
              tone: "error",
              title: "税务批次待复核修正",
              message: "当前批次存在失败原因，建议先重新复核再继续提交。",
              detail: `建议先对批次 ${BATCH_ID} 重新复核，再继续提交或归档。`
            },
            actions: [
              {
                key: "retry-tax-review",
                label: "重新复核批次",
                tone: "danger",
                params: { batchId: BATCH_ID }
              }
            ]
          }
        })
      });
      return;
    }

    if (url.pathname === "/api/tax-filing-batches") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [draftBatch],
          total: 1
        })
      });
      return;
    }

    if (url.pathname === "/api/tax-items") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: "tax-item-runtime-1",
              companyId: "company-demo",
              businessEventId: "event-runtime-1",
              mappingId: "mapping-runtime-1",
              taxType: "增值税",
              treatment: "销项税额待复核",
              basis: "业务招待发票待校验",
              filingPeriod: "2026-05",
              status: "review_required",
              source: "analysis",
              createdAt: "2026-06-01T09:00:00.000Z",
              updatedAt: "2026-06-01T09:00:00.000Z"
            }
          ],
          total: 1
        })
      });
      return;
    }

    if (url.pathname === "/api/taxpayer-profiles") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: "tax-profile-runtime-1",
              companyId: "company-demo",
              taxpayerType: "general_vat",
              effectiveFrom: "2026-01-01",
              status: "active",
              notes: "runtime smoke",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-06-01T09:00:00.000Z"
            }
          ],
          total: 1
        })
      });
      return;
    }

    if (url.pathname === `/api/tax-filing-batches/${BATCH_ID}`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...draftBatch,
          items: [],
          reviews: [],
          archives: []
        })
      });
      return;
    }

    if (url.pathname === `/api/tax-filing-batches/${BATCH_ID}/review`) {
      reviewRequestCount += 1;
      reviewRequestBody = route.request().postData() ?? "";
      await page.waitForTimeout(300);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(reviewedBatchDetail)
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        items: [],
        total: 0,
        totalPending: 0,
        profiles: [],
        batches: [],
        checklist: []
      })
    });
  });

  await page.goto("/tax");

  await expect(page.getByRole("heading", { name: "税务中心" })).toBeVisible();
  await expect(page.getByText("异常 / 修复提示", { exact: true })).toBeVisible();
  await expect(page.getByText("税务批次待复核修正")).toBeVisible();
  const repairButton = page.getByRole("button", { name: "重新复核批次" });
  await expect(repairButton).toBeVisible();

  await repairButton.click();

  await expect(page.getByRole("button", { name: "处理中..." })).toBeVisible();
  await expect.poll(() => reviewRequestCount, {
    message: "expected tax runtime repair action to submit a review request"
  }).toBe(1);
  expect(reviewRequestBody).toContain("\"reviewResult\":\"approved\"");
  expect(reviewRequestBody).toContain("\"reviewNotes\":\"runtime quick retry\"");
  await expect(page.getByText(`批次 ${BATCH_ID} 已重新复核。`)).toBeVisible();

  await testInfo.attach("tax-runtime-repair", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png"
  });
});
