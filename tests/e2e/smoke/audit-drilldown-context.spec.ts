import type { Page, Route } from "@playwright/test";
import { test, expect } from "../fixtures/auth";

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function installCommonMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("finance-taxation-v2-token", "smoke-token");
    window.localStorage.setItem("finance-taxation-v2-refresh-token", "smoke-refresh-token");
  });

  const exportLog = {
    id: "audit-export-1",
    companyId: "cmp-demo",
    userId: "usr-auditor",
    action: "retry",
    resourceType: "export_job",
    resourceId: "job-export-1",
    resourceLabel: "2026-05 月结资料包",
    userName: "审计专员",
    changes: {
      kind: "reports",
      status: "failed",
      retryCount: 1,
      lastError: "连接器回传失败"
    },
    createdAt: "2026-07-08T10:00:00.000Z"
  };

  const transferLog = {
    id: "audit-transfer-1",
    companyId: "cmp-demo",
    userId: "usr-auditor",
    action: "payroll.transfer.compensated",
    resourceType: "payroll_transfer_batch",
    resourceId: "pt-batch-2026-05",
    resourceLabel: "2026-05 工资代发",
    userName: "审计专员",
    changes: {
      payrollPeriod: "2026-05",
      eventId: "evt-payroll-transfer-1"
    },
    createdAt: "2026-07-08T10:05:00.000Z"
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const { pathname, searchParams } = url;

    if (pathname === "/api/access/me") {
      return json(route, {
        id: "usr-auditor",
        username: "auditor",
        displayName: "审计专员",
        roleIds: ["role-auditor"],
        departmentName: "审计部"
      });
    }

    if (pathname === "/api/inbox") {
      return json(route, { totalPending: 0, items: [] });
    }

    if (pathname === "/api/audit/logs") {
      const resourceType = searchParams.get("resourceType");
      const resourceId = searchParams.get("resourceId");
      const items =
        resourceType === "export_job"
          ? (!resourceId || resourceId === exportLog.resourceId ? [exportLog] : [])
          : resourceType === "payroll_transfer_batch"
            ? (!resourceId || resourceId === transferLog.resourceId ? [transferLog] : [])
            : [];
      return json(route, { items, total: items.length, limit: 20, offset: 0 });
    }

    if (pathname === "/api/reports/snapshots") {
      return json(route, {
        items: [{
          id: "snapshot-2026-05-balance",
          reportType: "balance_sheet",
          periodLabel: "2026-05",
          generatedAt: "2026-07-08T10:00:00.000Z"
        }],
        total: 1
      });
    }

    if (pathname === "/api/payroll/periods") {
      return json(route, {
        items: [{
          period: "2026-05",
          employeeCount: 2,
          grossAmount: 19888.32,
          status: "computed"
        }],
        total: 1
      });
    }

    if (pathname === "/api/vouchers") {
      return json(route, { items: [], total: 0 });
    }

    if (pathname === "/api/documents") {
      return json(route, { items: [], total: 0 });
    }

    if (pathname === "/api/risk/findings") {
      return json(route, { items: [], total: 0 });
    }

    if (pathname === "/api/rnd/projects") {
      return json(route, { items: [], total: 0 });
    }

    if (pathname === "/api/exports/jobs") {
      return json(route, {
        items: [{
          id: "job-export-1",
          kind: "package",
          label: "2026-05 月结资料包",
          fileName: "2026-05-月结资料包.pdf",
          status: "failed",
          retryCount: 1,
          lastError: "连接器回传失败",
          nextRetryAt: "2026-07-08T12:00:00.000Z",
          createdAt: "2026-07-08T09:50:00.000Z"
        }],
        total: 1
      });
    }

    if (pathname === "/api/exports/archive-index") {
      return json(route, { items: [], total: 0 });
    }

    if (pathname === "/api/runtime/payroll-transfer") {
      return json(route, {
        summary: {
          executionState: "succeeded",
          executionLabel: "运行正常",
          executionMessage: "当前工资代发链路可继续处理。",
          authorizationState: "authorized",
          authorizationLabel: "可继续处理",
          authorizationMessage: "当前身份可查看并推进工资代发。",
          stats: [
            { label: "草稿批次", value: "0" },
            { label: "待导出/待执行", value: "0" },
            { label: "已代发", value: "1" }
          ]
        }
      });
    }

    if (pathname === "/api/payroll/transfer/batches") {
      return json(route, {
        items: [{
          id: "pt-batch-2026-05",
          payroll_period: "2026-05",
          employee_count: 2,
          total_amount: 19888.32,
          status: "disbursed",
          bank_transfer_ref: "BANK-202605-01",
          retry_count: 0,
          last_error: null,
          last_attempt_at: "2026-07-08T09:00:00.000Z",
          next_retry_at: null,
          compensation_status: "completed",
          compensation_event_id: "evt-payroll-transfer-1",
          compensated_at: "2026-07-08T09:30:00.000Z"
        }]
      });
    }

    if (pathname === "/api/payroll/transfer/batches/pt-batch-2026-05") {
      return json(route, {
        batch: {
          id: "pt-batch-2026-05",
          payroll_period: "2026-05",
          employee_count: 2,
          total_amount: 19888.32,
          status: "disbursed",
          bank_transfer_ref: "BANK-202605-01",
          retry_count: 0,
          last_error: null,
          last_attempt_at: "2026-07-08T09:00:00.000Z",
          next_retry_at: null,
          compensation_status: "completed",
          compensation_event_id: "evt-payroll-transfer-1",
          compensated_at: "2026-07-08T09:30:00.000Z"
        },
        lines: [
          {
            id: "pt-line-1",
            employee_name: "张三",
            salary_account: "6222020000000001",
            salary_bank: "招商银行上海分行",
            amount: 9988.32,
            status: "ready"
          }
        ]
      });
    }

    return json(route, {});
  });
}

test("audit drilldown restores export scene and highlights target job", async ({ page }) => {
  await installCommonMocks(page);

  await page.goto("/audit?resourceType=export_job&resourceId=job-export-1&logId=audit-export-1");

  await expect(page.getByRole("heading", { name: "审计日志" })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看导出任务" }).first()).toBeVisible();

  await page.getByRole("button", { name: "查看导出任务" }).first().click();

  await expect(page).toHaveURL(/\/pdf-export/);
  await expect(page.getByRole("heading", { name: "PDF 导出中心" })).toBeVisible();
  await expect(page.getByText("已从审计日志恢复到导出任务 2026-05 月结资料包。")).toBeVisible();
  await expect(page.getByText("当前审计回跳定位任务")).toBeVisible();
});

test("audit drilldown restores payroll transfer batch context", async ({ page }) => {
  await installCommonMocks(page);

  await page.goto("/audit?resourceType=payroll_transfer_batch&resourceId=pt-batch-2026-05&logId=audit-transfer-1");

  await expect(page.getByRole("heading", { name: "审计日志" })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看代发批次" }).first()).toBeVisible();

  await page.getByRole("button", { name: "查看代发批次" }).first().click();

  await expect(page).toHaveURL(/\/payroll\/transfer/);
  await expect(page.getByRole("heading", { name: "工资代发与社保" })).toBeVisible();
  await expect(page.getByText("补偿审计追溯")).toBeVisible();
  await expect(page.getByText("代发批次：pt-batch-2026-05")).toBeVisible();
  await expect(page.getByText("经营事项 evt-payroll-transfer-1")).toBeVisible();
});
