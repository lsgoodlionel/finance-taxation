import { test, expect } from "../fixtures/auth";
import { attachBusinessObject } from "../fixtures/evidence";
import {
  ensureEventAnalyzed,
  getEventDetailByTitle,
  resolveBusinessChain
} from "../helpers/business-objects";

const CONTRACT_EXCEPTION_FIXTURES = {
  missingAcceptance: "系统实施服务缺少验收单",
  duplicate: "重复导入年度财税咨询合同",
  timingConflict: "跨期订阅服务一次性确认收入"
} as const;

test("contract revenue exception scenarios generate expected chains and risk findings", async ({
  page,
  apiClient,
  loginAsRole
}, testInfo) => {
  await loginAsRole("tax");
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "经营事项总线" })).toBeVisible();

  const token = await apiClient.login("v4_tax", "V4-test-123456");

  const missingDetail = await ensureEventAnalyzed(apiClient, token, CONTRACT_EXCEPTION_FIXTURES.missingAcceptance);
  const missingChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: CONTRACT_EXCEPTION_FIXTURES.missingAcceptance,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const missingRisk = await apiClient.post<{ items: Array<{ ruleCode: string; severity: string }>; total: number }>(
    `/api/events/${missingDetail.id}/risk-check`,
    token,
    {}
  );

  expect(missingChain.documents.find((item) => item.documentType === "acceptance_record")?.status).toBe("awaiting_upload");
  expect(missingChain.vouchers[0]?.status).toBe("draft");
  expect(missingRisk.items.some((item) => item.ruleCode === "PREMATURE_REVENUE_RECOGNITION")).toBe(true);

  const duplicateDetail = await ensureEventAnalyzed(apiClient, token, CONTRACT_EXCEPTION_FIXTURES.duplicate);
  const duplicateChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: CONTRACT_EXCEPTION_FIXTURES.duplicate,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const duplicateRisk = await apiClient.post<{ items: Array<{ ruleCode: string; severity: string }>; total: number }>(
    `/api/events/${duplicateDetail.id}/risk-check`,
    token,
    {}
  );

  expect(duplicateChain.vouchers.length).toBe(0);
  expect(duplicateRisk.items.some((item) => item.ruleCode === "REVENUE_OVERSTATEMENT")).toBe(true);

  const timingDetail = await ensureEventAnalyzed(apiClient, token, CONTRACT_EXCEPTION_FIXTURES.timingConflict);
  const timingChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: CONTRACT_EXCEPTION_FIXTURES.timingConflict,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const timingRisk = await apiClient.post<{ items: Array<{ ruleCode: string; severity: string }>; total: number }>(
    `/api/events/${timingDetail.id}/risk-check`,
    token,
    {}
  );

  expect(timingChain.documents.map((item) => item.documentType)).toEqual([
    "service_contract",
    "billing_schedule",
    "output_invoice"
  ]);
  expect(timingChain.vouchers[0]?.summary.includes("合同负债")).toBe(true);
  expect(timingRisk.items.some((item) => item.ruleCode === "TAX_ACCOUNTING_TIMING_DIFFERENCE")).toBe(true);

  await attachBusinessObject(testInfo, "contract-exception-missing-acceptance", {
    event: await getEventDetailByTitle(apiClient, token, CONTRACT_EXCEPTION_FIXTURES.missingAcceptance),
    chain: missingChain,
    risk: missingRisk
  });
  await attachBusinessObject(testInfo, "contract-exception-duplicate", {
    event: await getEventDetailByTitle(apiClient, token, CONTRACT_EXCEPTION_FIXTURES.duplicate),
    chain: duplicateChain,
    risk: duplicateRisk
  });
  await attachBusinessObject(testInfo, "contract-exception-timing", {
    event: await getEventDetailByTitle(apiClient, token, CONTRACT_EXCEPTION_FIXTURES.timingConflict),
    chain: timingChain,
    risk: timingRisk
  });
});
