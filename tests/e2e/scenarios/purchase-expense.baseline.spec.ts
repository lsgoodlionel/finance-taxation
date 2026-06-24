import { test, expect } from "../fixtures/auth";
import { attachBusinessObject } from "../fixtures/evidence";
import {
  ensureEventAnalyzed,
  resolveBusinessChain,
  type ExpectedBusinessChain
} from "../helpers/business-objects";

const PURCHASE_FIXTURE = {
  id: "PUR-STD-001",
  title: "临时购买办公显示器",
  expectedDocumentTypes: ["expense_claim", "invoice_bundle"],
  expectedTaxTypes: ["增值税", "企业所得税"]
} as const;

test("purchase expense baseline captures current workflow coverage and gaps", async ({
  page,
  apiClient,
  loginAsRole
}, testInfo) => {
  const employee = await loginAsRole("employee");
  await page.goto("/assistant");
  await expect(page.getByRole("heading", { name: "AI 财税助手" })).toBeVisible();

  const employeeToken = await apiClient.login(employee.username, employee.password);
  const detail = await ensureEventAnalyzed(apiClient, employeeToken, PURCHASE_FIXTURE.title);
  const chain = await resolveBusinessChain(apiClient, employeeToken, {
    eventTitle: PURCHASE_FIXTURE.title,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
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
    assistantSubmissionAutomated: false,
    assistantAttachmentAutomation: false,
    missingExpectedDocumentTypes: PURCHASE_FIXTURE.expectedDocumentTypes.filter(
      (documentType) => !chain.documents.some((item) => item.documentType === documentType)
    ),
    missingExpectedTaxTypes: PURCHASE_FIXTURE.expectedTaxTypes.filter(
      (taxType) => !chain.taxItems.some((item) => item.taxType.includes(taxType))
    ),
    accountantTaxScopeVisible: accountantTax.total > 0,
    notes: [
      "当前基线通过 seeded fixture + analyze 建链，未直接覆盖 AI 对话提交与发票附件自动挂载。",
      "若 accountant 视角税务事项为空，说明会计角色对销售部门事项的税务复核入口仍受 scope 限制。"
    ]
  };

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
