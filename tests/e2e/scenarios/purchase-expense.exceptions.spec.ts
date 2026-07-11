import { test, expect } from "../fixtures/auth";
import { attachBusinessObject } from "../fixtures/evidence";
import {
  ensureEventAnalyzed,
  getEventDetailByTitle,
  resolveBusinessChain
} from "../helpers/business-objects";

const PURCHASE_EXCEPTION_FIXTURES = {
  missing: "客户活动用品采购缺少发票",
  duplicate: "重复提交办公耗材采购",
  reclassified: "高价值研发工作站误分类办公用品"
} as const;

test("purchase expense exception scenarios generate expected chains and risk findings", async ({
  page,
  apiClient,
  loginAsRole
}, testInfo) => {
  await loginAsRole("manager");
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "经营事项总线" })).toBeVisible();

  const token = await apiClient.login("v4_manager", "V4-test-123456");

  const missingDetail = await ensureEventAnalyzed(apiClient, token, PURCHASE_EXCEPTION_FIXTURES.missing);
  const missingChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: PURCHASE_EXCEPTION_FIXTURES.missing,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const missingRisk = await apiClient.post<{ items: Array<{ ruleCode: string; severity: string }>; total: number }>(
    `/api/events/${missingDetail.id}/risk-check`,
    token,
    {}
  );

  expect(missingChain.tasks.length).toBeGreaterThan(0);
  expect(
    missingChain.documents.find((item) => item.documentType === "invoice_bundle")?.status
  ).toBe("awaiting_upload");
  expect(missingChain.taxItems.map((item) => item.taxType)).toEqual(["企业所得税"]);
  expect(missingChain.vouchers[0]?.status).toBe("draft");
  expect(missingRisk.items.some((item) => item.ruleCode === "UNSUPPORTED_TAX_DEDUCTION")).toBe(true);

  const duplicateDetail = await ensureEventAnalyzed(apiClient, token, PURCHASE_EXCEPTION_FIXTURES.duplicate);
  const duplicateChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: PURCHASE_EXCEPTION_FIXTURES.duplicate,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const duplicateRisk = await apiClient.post<{ items: Array<{ ruleCode: string; severity: string }>; total: number }>(
    `/api/events/${duplicateDetail.id}/risk-check`,
    token,
    {}
  );

  expect(duplicateChain.documents.length).toBeGreaterThan(0);
  expect(duplicateChain.vouchers.length).toBe(0);
  expect(duplicateChain.taxItems.map((item) => item.taxType)).toEqual(["增值税"]);
  expect(duplicateRisk.items.some((item) => item.ruleCode === "DUPLICATE_REIMBURSEMENT")).toBe(true);

  const reclassifiedDetail = await ensureEventAnalyzed(apiClient, token, PURCHASE_EXCEPTION_FIXTURES.reclassified);
  const reclassifiedChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: PURCHASE_EXCEPTION_FIXTURES.reclassified,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const reclassifiedRisk = await apiClient.post<{ items: Array<{ ruleCode: string; severity: string }>; total: number }>(
    `/api/events/${reclassifiedDetail.id}/risk-check`,
    token,
    {}
  );

  expect(reclassifiedChain.documents.map((item) => item.documentType)).toEqual([
    "purchase_request",
    "invoice_bundle",
    "acceptance_record"
  ]);
  expect(reclassifiedRisk.items.some((item) => item.ruleCode === "EXPENSE_OVERSTATEMENT")).toBe(true);

  const voucherId = reclassifiedChain.vouchers[0]?.id;
  expect(voucherId).toBeTruthy();
  const voucherDetail = await apiClient.get<{
    id: string;
    status: string;
    lines: Array<{ accountCode: string; accountName: string }>;
  }>(`/api/vouchers/${voucherId}`, token);
  expect(voucherDetail.lines[0]?.accountCode).toBe("1601");

  await attachBusinessObject(testInfo, "purchase-exception-missing", {
    event: await getEventDetailByTitle(apiClient, token, PURCHASE_EXCEPTION_FIXTURES.missing),
    chain: missingChain,
    risk: missingRisk
  });
  await attachBusinessObject(testInfo, "purchase-exception-duplicate", {
    event: await getEventDetailByTitle(apiClient, token, PURCHASE_EXCEPTION_FIXTURES.duplicate),
    chain: duplicateChain,
    risk: duplicateRisk
  });
  await attachBusinessObject(testInfo, "purchase-exception-reclassified", {
    event: await getEventDetailByTitle(apiClient, token, PURCHASE_EXCEPTION_FIXTURES.reclassified),
    chain: reclassifiedChain,
    risk: reclassifiedRisk,
    voucherDetail
  });
});
