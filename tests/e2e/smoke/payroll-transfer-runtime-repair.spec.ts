import { test, expect } from "../fixtures/auth";

test("/payroll/transfer shows mocked runtime repair entry and can compensate batch", async ({ page }) => {
  let compensateCalls = 0;
  let batchState = {
    id: "pt-batch-smoke",
    payroll_period: "2026-05",
    employee_count: 2,
    total_amount: 19888.32,
    status: "disbursed",
    bank_transfer_ref: "BANK-202605-01",
    retry_count: 2,
    last_error: "经营事项补偿失败，等待重新补偿。",
    last_attempt_at: "2026-06-29T09:00:00.000Z",
    next_retry_at: "2026-06-30T09:15:00.000Z",
    compensation_status: "failed",
    compensation_event_id: null,
    compensated_at: null
  };

  await page.addInitScript(() => {
    window.localStorage.setItem("finance-taxation-v2-token", "smoke-token");
    window.localStorage.setItem("finance-taxation-v2-refresh-token", "smoke-refresh-token");
  });

  await page.route("**/api/access/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "usr-finance-smoke",
        username: "finance",
        displayName: "财务经理",
        roleIds: ["role-finance-director"],
        departmentName: "财务部"
      })
    });
  });

  await page.route("**/api/inbox", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        totalPending: 0,
        items: []
      })
    });
  });

  await page.route("**/api/runtime/payroll-transfer**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          executionState: "failed",
          executionLabel: "补偿失败待修复",
          executionMessage: "工资代发已完成，但经营事项补偿失败，需要重新执行修复动作。",
          authorizationState: "authorized",
          authorizationLabel: "你可执行修复",
          authorizationMessage: "当前身份可直接补偿工资代发下游事项。",
          stats: [
            { label: "草稿批次", value: "0" },
            { label: "待导出/待执行", value: "0" },
            { label: "已代发", value: "1" }
          ],
          issue: {
            tone: "error",
            title: "代发补偿失败",
            message: "当前批次下游经营事项未闭环，需要重新补偿。",
            detail: "点击修复动作后，应生成或复用经营事项并刷新当前批次状态。"
          },
          actions: [
            {
              key: "mock-runtime-repair",
              label: "执行补偿修复",
              tone: "danger",
              params: {
                batchId: batchState.id
              }
            }
          ]
        }
      })
    });
  });

  await page.route("**/api/payroll/transfer/batches", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [batchState]
      })
    });
  });

  await page.route(`**/api/payroll/transfer/batches/${batchState.id}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        batch: batchState,
        lines: [
          {
            id: "pt-line-1",
            employee_name: "张三",
            salary_account: "6222020000000001",
            salary_bank: "招商银行上海分行",
            amount: 9988.32,
            status: "ready"
          },
          {
            id: "pt-line-2",
            employee_name: "李四",
            salary_account: "6222020000000002",
            salary_bank: "招商银行上海分行",
            amount: 9900,
            status: "ready"
          }
        ]
      })
    });
  });

  await page.route(`**/api/payroll/transfer/batches/${batchState.id}/compensate`, async (route) => {
    compensateCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 150));
    batchState = {
      ...batchState,
      compensation_status: "completed",
      compensation_event_id: "evt-payroll-transfer-001",
      compensated_at: "2026-06-30T09:20:00.000Z",
      last_error: null,
      next_retry_at: null
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        eventId: "evt-payroll-transfer-001",
        reused: false
      })
    });
  });

  await page.route("**/api/audit/logs**", async (route) => {
    const url = new URL(route.request().url());
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");
    const items =
      resourceType === "payroll_transfer_batch" && resourceId === batchState.id
        ? [
            {
              id: "audit-payroll-transfer-disbursed",
              companyId: "cmp-demo",
              userId: "usr-finance-smoke",
              action: batchState.compensation_status === "completed"
                ? "payroll.transfer.compensated"
                : "payroll.transfer.disbursed",
              resourceType: "payroll_transfer_batch",
              resourceId: batchState.id,
              resourceLabel: batchState.payroll_period,
              userName: "财务经理",
              changes: {
                eventId: batchState.compensation_event_id,
                bankTransferRef: batchState.bank_transfer_ref
              },
              createdAt: batchState.compensation_status === "completed"
                ? "2026-06-30T09:20:00.000Z"
                : "2026-06-29T09:00:00.000Z"
            }
          ]
        : [];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items,
        total: items.length,
        limit: 20,
        offset: 0
      })
    });
  });

  await page.goto("/payroll/transfer");

  await expect(page.getByRole("heading", { name: "工资代发与社保" })).toBeVisible();
  const periodCell = page.getByRole("cell", { name: "2026-05" }).first();
  await expect(periodCell).toBeVisible();
  await periodCell.click();
  await expect(page.getByText("异常 / 修复提示", { exact: true })).toBeVisible();
  await expect(page.getByText("代发补偿失败")).toBeVisible();
  await expect(page.getByRole("button", { name: "执行补偿修复" })).toBeVisible();
  await expect(page.getByText("工资代发已完成，但下游经营事项联动未闭环")).toBeVisible();
  await expect(page.getByRole("button", { name: "补偿联动事项" })).toBeVisible();
  await expect(page.getByText("补偿审计追溯")).toBeVisible();
  await expect(page.getByText(`代发批次：${batchState.id}`)).toBeVisible();
  await expect(page.getByText(`银行批次号 ${batchState.bank_transfer_ref}`)).toBeVisible();

  await page.getByRole("button", { name: "执行补偿修复" }).dblclick();

  await expect(page.getByText("已补偿生成经营事项 evt-payroll-transfer-001")).toBeVisible();
  await expect.poll(() => compensateCalls).toBe(1);
  await expect(page.getByText("工资代发已完成，但下游经营事项联动未闭环")).toHaveCount(0);
  await expect(page.getByText("payroll.transfer.compensated")).toBeVisible();
  // 审计行文案（含「银行批次号」）与补偿 toast（「已补偿生成经营事项…」）都含
  // 该事项 id,用含「银行批次号」的正则只匹配审计行,避免 strict-mode 命中两元素。
  await expect(page.getByText(/经营事项 evt-payroll-transfer-001.*银行批次号/)).toBeVisible();
});
