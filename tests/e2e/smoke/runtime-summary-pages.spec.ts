import { test, expect } from "../fixtures/auth";

const CASES = [
  {
    route: "/tasks",
    role: "accountant" as const,
    heading: "任务中心",
    panelTitle: "任务运行态与授权态",
    runtimePath: "/api/runtime/tasks",
    actionLabel: "重开阻塞任务",
    actionPath: "/api/tasks/task-runtime-repair-001",
    issueTitle: "阻塞任务：补资料",
    actionResponse: { ok: true },
    actionMatcher: (request: string) => request.includes("\"status\":\"not_started\""),
    successText: "已重开阻塞任务，当前可继续补资料或重新推进。"
  },
  {
    route: "/tax",
    role: "tax" as const,
    heading: "税务中心",
    panelTitle: "税务运行态与授权态",
    runtimePath: "/api/runtime/tax",
    actionLabel: "重新复核批次",
    actionPath: "/api/tax-filing-batches/tax-batch-runtime-repair-001/review",
    issueTitle: "税务批次待复核修正",
    sharedRepairEntry: false,
    actionResponse: {
      id: "tax-batch-runtime-repair-001",
      companyId: "cmp-runtime",
      taxType: "增值税",
      filingPeriod: "2026-05",
      status: "ready",
      itemIds: [],
      items: [],
      reviews: [],
      archives: [],
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:30:00.000Z"
    },
    actionMatcher: (request: string) =>
      request.includes("\"reviewResult\":\"approved\"") &&
      request.includes("\"reviewNotes\":\"runtime quick retry\""),
    successText: "批次 tax-batch-runtime-repair-001 已重新复核。"
  },
  {
    route: "/vouchers",
    role: "accountant" as const,
    heading: "凭证中心",
    panelTitle: "凭证运行态与授权态",
    runtimePath: "/api/runtime/vouchers",
    actionLabel: "重新校验凭证",
    actionPath: "/api/vouchers/voucher-runtime-repair-001/validate",
    issueTitle: "凭证分录为空",
    actionResponse: {
      valid: false,
      totals: { debit: "0.00", credit: "0.00" },
      issues: ["请先补充分录后重新校验。"]
    },
    actionMatcher: () => true,
    successText: "请先补充分录后重新校验。"
  },
  {
    route: "/payroll/transfer",
    role: "manager" as const,
    heading: "工资代发与社保",
    panelTitle: "工资代发运行态与授权态",
    runtimePath: "/api/runtime/payroll-transfer",
    actionLabel: "补偿联动事项",
    actionPath: "/api/payroll/transfer/batches/ptb-runtime-repair-001/compensate",
    issueTitle: "代发补偿失败",
    actionResponse: {
      eventId: "evt-payroll-transfer-runtime-001",
      reused: false
    },
    actionMatcher: () => true,
    successText: "已补偿生成经营事项 evt-payroll-transfer-runtime-001"
  }
];

for (const item of CASES) {
  test(`${item.route} shows workflow runtime summary`, async ({ page, loginAsRole }, testInfo) => {
    const runtimeResponses: Array<{ url: string; status: number }> = [];
    page.on("response", (response) => {
      if (response.url().includes(item.runtimePath)) {
        runtimeResponses.push({
          url: response.url(),
          status: response.status()
        });
      }
    });

    await loginAsRole(item.role);
    await page.goto(item.route);
    await expect(page.getByRole("heading", { name: item.heading })).toBeVisible();
    const panel = page.locator("section").filter({
      has: page.getByRole("heading", { name: item.panelTitle })
    }).first();
    await expect(page.getByRole("heading", { name: item.panelTitle })).toBeVisible();
    await expect(panel.getByText("运行态", { exact: true })).toBeVisible();
    await expect(panel.getByText("授权态", { exact: true })).toBeVisible();
    if (item.route === "/payroll") {
      await expect(page.getByText("加载失败，请检查后端连接。")).toHaveCount(0);
    }
    await expect
      .poll(() => runtimeResponses.some((entry) => entry.status === 200), {
        message: `${item.route} should request ${item.runtimePath} and receive 200`
      })
      .toBeTruthy();
    await testInfo.attach(`${item.route}-runtime`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });
  });

  if (item.sharedRepairEntry !== false) {
    test(`${item.route} runs runtime repair action through the shared entry`, async ({ page, loginAsRole }) => {
    let actionRequestBody = "";
    let actionRequestCount = 0;
    let payrollTransferBatch = {
      id: "ptb-runtime-repair-001",
      payroll_period: "2026-05",
      employee_count: 1,
      total_amount: 9988.32,
      status: "disbursed",
      bank_transfer_ref: "BANK-202605-01",
      retry_count: 1,
      last_error: "经营事项补偿失败",
      last_attempt_at: "2026-06-29T09:00:00.000Z",
      next_retry_at: "2026-06-30T09:15:00.000Z",
      compensation_status: "failed",
      compensation_event_id: null,
      compensated_at: null
    };

    if (item.route === "/tax") {
      await page.addInitScript(() => {
        window.localStorage.setItem("finance-taxation-v2-token", "smoke-tax-token");
        window.localStorage.setItem("finance-taxation-v2-refresh-token", "smoke-tax-refresh");
      });
      await page.route("**/api/access/me", async (route) => {
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
      });
      await page.route("**/api/access/menu", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ items: [] })
        });
      });
      await page.route("**/api/inbox", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ totalPending: 0, items: [] })
        });
      });
    } else {
      await loginAsRole(item.role);
    }

    await page.route(`**${item.runtimePath}**`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          summary: {
            executionState: "failed",
            executionLabel: "存在失败原因",
            executionMessage: "当前链路存在失败原因，需执行修复动作后继续推进。",
            authorizationState: "authorized",
            authorizationLabel: "你可执行修复",
            authorizationMessage: "当前身份可直接处理修复动作。",
            stats: [
              { label: "待处理", value: "1" },
              { label: "异常项", value: "1" },
              { label: "已完成", value: "0" }
            ],
            issue: {
              tone: "error",
              title: item.issueTitle,
              message: "当前链路存在失败原因，需执行修复动作后继续推进。",
              detail: "这里展示失败原因、修复建议和下一步入口。"
            },
            actions: [
              {
                key:
                  item.route === "/tasks"
                    ? "retry-blocked-task"
                    : item.route === "/tax"
                      ? "retry-tax-review"
                      : item.route === "/vouchers"
                        ? "retry-voucher-validate"
                        : "compensate-transfer-batch",
                label: item.actionLabel,
                tone: "danger",
                params:
                  item.route === "/tasks"
                    ? { taskId: "task-runtime-repair-001" }
                    : item.route === "/tax"
                      ? { batchId: "tax-batch-runtime-repair-001" }
                      : item.route === "/vouchers"
                        ? { voucherId: "voucher-runtime-repair-001" }
                        : { batchId: "ptb-runtime-repair-001" }
              }
            ]
          }
        })
      });
    });

    await page.route(`**${item.actionPath}`, async (route) => {
      actionRequestCount += 1;
      actionRequestBody = route.request().postData() ?? "";
      if (item.route === "/payroll/transfer") {
        payrollTransferBatch = {
          ...payrollTransferBatch,
          compensation_status: "completed",
          compensation_event_id: "evt-payroll-transfer-runtime-001",
          compensated_at: "2026-06-30T09:20:00.000Z",
          last_error: null,
          next_retry_at: null
        };
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(item.actionResponse)
      });
    });

    if (item.route === "/tax") {
      await page.route("**/api/tax-filing-batches**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/tax-filing-batches") {
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              items: [
                {
                  id: "tax-batch-runtime-repair-001",
                  companyId: "cmp-runtime",
                  taxType: "增值税",
                  filingPeriod: "2026-05",
                  status: "ready",
                  itemIds: [],
                  createdAt: "2026-06-01T09:00:00.000Z",
                  updatedAt: "2026-06-01T09:30:00.000Z"
                }
              ],
              total: 1
            })
          });
          return;
        }
        if (url.pathname === "/api/tax-filing-batches/tax-batch-runtime-repair-001") {
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(item.actionResponse)
          });
          return;
        }
        await route.continue();
      });
      await page.route("**/api/tax-items**", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ items: [], total: 0 })
        });
      });
      await page.route("**/api/taxpayer-profiles**", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "tax-profile-runtime-1",
                companyId: "cmp-runtime",
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
      });
    }

    if (item.route === "/payroll/transfer") {
      await page.route("**/api/payroll/transfer/batches", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            items: [payrollTransferBatch]
          })
        });
      });
      await page.route("**/api/payroll/transfer/batches/ptb-runtime-repair-001", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            batch: payrollTransferBatch,
            lines: [
              {
                id: "pt-line-runtime-1",
                employee_name: "张三",
                salary_account: "6222020000000001",
                salary_bank: "招商银行上海分行",
                amount: 9988.32,
                status: "ready"
              }
            ]
          })
        });
      });
    }

    await page.goto(item.route);
    await expect(page.getByText("异常 / 修复提示", { exact: true })).toBeVisible();
    if (item.route !== "/tax") {
      await expect(page.getByText(item.issueTitle)).toBeVisible();
    }
    const repairButton = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: item.panelTitle }) })
      .first()
      .getByRole("button", { name: item.actionLabel });
    await expect(repairButton).toBeVisible();

    await repairButton.click();

    if (item.route !== "/vouchers") {
      await expect(page.getByRole("button", { name: "处理中..." })).toBeVisible();
    }
    await expect
      .poll(() => actionRequestCount, {
        message: `${item.route} should submit the runtime repair action`
      })
      .toBe(1);
    expect(item.actionMatcher(actionRequestBody)).toBeTruthy();
    await expect(page.getByText(item.successText)).toBeVisible();
    });
  }
}
