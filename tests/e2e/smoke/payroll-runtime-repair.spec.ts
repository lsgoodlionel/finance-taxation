import { expect, test } from "../fixtures/auth";

test("/payroll renders runtime repair action and feedback", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("finance-taxation-v2-token", "payroll-smoke-token");
    window.localStorage.setItem("finance-taxation-v2-refresh-token", "payroll-smoke-refresh");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/access/me") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-manager",
          companyId: "cmp-v4-tech",
          username: "v4_manager",
          displayName: "工资经理",
          roleIds: ["role-finance-director", "role-accountant"],
          departmentName: "财务部"
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
        body: JSON.stringify({ items: [], totalPending: 0 })
      });
      return;
    }

    if (url.pathname === "/api/employees") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 })
      });
      return;
    }

    if (url.pathname === "/api/payroll/periods") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [{
            period: "2026-05",
            headcount: 8,
            totalGross: 128000,
            totalSocialSecurityEmployee: 9600,
            totalSocialSecurityEmployer: 19200,
            totalHousingFundEmployee: 8960,
            totalHousingFundEmployer: 8960,
            totalIit: 3200,
            totalNetPay: 97040,
            status: "confirmed"
          }],
          total: 1
        })
      });
      return;
    }

    if (url.pathname === "/api/payroll/policy") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          policy: {
            id: "payroll-policy-smoke",
            companyId: "cmp-v4-tech",
            socialSecurityBaseMin: 3000,
            socialSecurityBaseMax: 36921,
            pensionEmployeeRate: 0.08,
            pensionEmployerRate: 0.16,
            medicalEmployeeRate: 0.02,
            medicalEmployerRate: 0.095,
            unemploymentEmployeeRate: 0.005,
            unemploymentEmployerRate: 0.005,
            housingFundEmployeeRate: 0.07,
            housingFundEmployerRate: 0.07,
            iitThreshold: 5000,
            updatedAt: "2026-07-01T00:00:00.000Z"
          }
        })
      });
      return;
    }

    if (url.pathname === "/api/payroll/review-ledgers") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 })
      });
      return;
    }

    if (url.pathname === "/api/tax/individual-income-tax-materials") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          companyId: "cmp-v4-tech",
          filingPeriod: "2026-05",
          payrollEventCount: 0,
          withholdingItemCount: 0,
          totalPayrollAmount: "0",
          checklist: []
        })
      });
      return;
    }

    if (url.pathname === "/api/runtime/payroll") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          summary: {
            executionState: "failed",
            executionLabel: "存在失败原因",
            executionMessage: "当前工资链路存在失败原因，需执行修复动作后继续推进。",
            authorizationState: "authorized",
            authorizationLabel: "你可执行修复",
            authorizationMessage: "当前身份可直接处理修复动作。",
            stats: [
              { label: "已确认工资", value: "8" },
              { label: "待复核台账", value: "2" },
              { label: "风险项", value: "1" }
            ],
            issue: {
              tone: "error",
              title: "工资台账待修复",
              message: "当前工资链路存在失败原因，需执行修复动作后继续推进。",
              detail: "这里展示失败原因、修复建议和下一步入口。"
            },
            actions: [
              {
                key: "mock-runtime-repair",
                label: "执行修复动作",
                tone: "danger",
                params: {}
              }
            ]
          }
        })
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
        stats: [],
        records: [],
        batches: [],
        findings: [],
        profiles: [],
        vouchers: [],
        tasks: [],
        documents: [],
        events: [],
        obligations: [],
        checklist: []
      })
    });
  });

  await page.goto("/payroll");
  await expect(page.getByRole("heading", { name: "工资运行态与授权态" })).toBeVisible();
  await expect(page.getByText("异常 / 修复提示", { exact: true })).toBeVisible();
  await expect(page.getByText("工资台账待修复")).toBeVisible();

  const actionButton = page.getByRole("button", { name: "执行修复动作" });
  await expect(actionButton).toBeVisible();
  await actionButton.click();

  await expect(page.getByText("已触发“执行修复动作”，请按工资流程继续处理。")).toBeVisible();
});
