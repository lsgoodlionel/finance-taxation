import { test, expect } from "../fixtures/auth";
import { attachBusinessObject } from "../fixtures/evidence";
import {
  ensureEventAnalyzed,
  resolveBusinessChain,
  type ExpectedBusinessChain
} from "../helpers/business-objects";

const PURCHASE_FIXTURE = {
  id: "PUR-STD-001",
  title: `临时购买办公显示器 ${Date.now()}`,
  expectedDocumentTypes: ["expense_claim", "invoice_bundle"],
  expectedTaxTypes: ["增值税", "企业所得税"]
} as const;

test("purchase expense baseline covers assistant-driven event creation and auto-analysis", async ({
  page,
  apiClient,
  loginAsRole
}, testInfo) => {
  const employee = await loginAsRole("employee");
  await page.goto("/assistant");
  await expect(page.getByRole("heading", { name: "AI 财税助手" })).toBeVisible();

  await page.getByPlaceholder(/描述经营事项、报销内容等/).fill(`${PURCHASE_FIXTURE.title} 1999元，准备报销`);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText(/建议创建经营事项/)).toBeVisible();
  await expect(page.getByText(new RegExp(`\\[费用\\]\\s+${PURCHASE_FIXTURE.title}`))).toBeVisible();
  await page.getByRole("button", { name: "一键处理" }).click();
  await expect(page.getByText(/全流程处理已启动|经营事项已创建/)).toBeVisible();

  const employeeToken = await apiClient.login(employee.username, employee.password);
  const detail = await ensureEventAnalyzed(apiClient, employeeToken, PURCHASE_FIXTURE.title);
  const chain = await resolveBusinessChain(apiClient, employeeToken, {
    eventTitle: PURCHASE_FIXTURE.title,
    documentTypes: PURCHASE_FIXTURE.expectedDocumentTypes,
    voucherRequired: false,
    taxTypes: ["企业所得税"]
  } satisfies ExpectedBusinessChain);

  expect(detail.tasks.length).toBeGreaterThan(0);
  expect(chain.documents.length).toBeGreaterThan(0);
  expect(chain.taxItems.length).toBeGreaterThan(0);
  expect(chain.vouchers.length).toBeGreaterThan(0);

  const managerToken = await apiClient.login("v4_manager", "V4-test-123456");
  const managerTasks = await apiClient.get<{ items: Array<{ id: string; title: string }>; total: number }>(
    `/api/tasks?businessEventId=${detail.id}`,
    managerToken
  );
  expect(managerTasks.total).toBeGreaterThan(0);

  await loginAsRole("accountant");
  await page.goto("/tax");
  await expect(page.getByRole("heading", { name: "税务中心" })).toBeVisible();
  const accountantToken = await apiClient.login("v4_accountant", "V4-test-123456");
  const accountantTax = await apiClient.get<{ items: Array<{ id: string; taxType: string }>; total: number }>(
    `/api/tax-items?businessEventId=${detail.id}`,
    accountantToken
  );

  const gaps = {
    assistantSubmissionAutomated: true,
    assistantAttachmentAutomation: true,
    missingExpectedDocumentTypes: PURCHASE_FIXTURE.expectedDocumentTypes.filter(
      (documentType) => !chain.documents.some((item) => item.documentType === documentType)
    ),
    missingExpectedTaxTypes: PURCHASE_FIXTURE.expectedTaxTypes.filter(
      (taxType) => !chain.taxItems.some((item) => item.taxType.includes(taxType))
    ),
    accountantTaxScopeVisible: accountantTax.total > 0,
    notes: [
      "当前基线已直接覆盖 assistant 对话创建事项与自动分析链路。",
      "若 accountant 视角税务事项为空，说明会计角色对销售部门事项的税务复核入口仍受 scope 限制。"
    ]
  };

  expect(gaps.missingExpectedDocumentTypes).toEqual([]);
  expect(gaps.missingExpectedTaxTypes).toEqual([]);

  await attachBusinessObject(testInfo, "purchase-fixture", PURCHASE_FIXTURE);
  await attachBusinessObject(testInfo, "purchase-event-detail", {
    id: detail.id,
    title: detail.title,
    documents: detail.generatedDocuments.map((item) => item.documentType),
    vouchers: detail.vouchers.map((item) => item.id),
    tasks: detail.tasks.map((item) => item.title),
    taxItems: detail.taxItems.map((item) => item.taxType)
  });
  await attachBusinessObject(testInfo, "purchase-baseline-gaps", gaps);
});
