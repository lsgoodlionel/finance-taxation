import { test, expect } from "../fixtures/auth";
import { attachBusinessObject } from "../fixtures/evidence";
import {
  ensureEventAnalyzed,
  getEventDetailByTitle,
  resolveBusinessChain
} from "../helpers/business-objects";

const TRAVEL_EXCEPTION_FIXTURES = {
  missingHotel: "北京展会差旅缺少住宿发票",
  duplicate: "重复提交上海客户拜访差旅",
  crossPeriod: "跨期差旅报销计入错误月份"
} as const;

test("travel expense exception scenarios generate expected chains and risk findings", async ({
  page,
  apiClient,
  loginAsRole
}, testInfo) => {
  await loginAsRole("manager");
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "经营事项总线" })).toBeVisible();

  const token = await apiClient.login("v4_manager", "V4-test-123456");

  const missingDetail = await ensureEventAnalyzed(apiClient, token, TRAVEL_EXCEPTION_FIXTURES.missingHotel);
  const missingChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: TRAVEL_EXCEPTION_FIXTURES.missingHotel,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const missingRisk = await apiClient.post<{ items: Array<{ ruleCode: string; severity: string }>; total: number }>(
    `/api/events/${missingDetail.id}/risk-check`,
    token,
    {}
  );

  expect(missingChain.documents.find((item) => item.documentType === "hotel_invoice")?.status).toBe("awaiting_upload");
  expect(missingChain.taxItems.map((item) => item.taxType)).toEqual(["企业所得税"]);
  expect(missingChain.vouchers[0]?.status).toBe("draft");
  expect(missingRisk.items.some((item) => item.ruleCode === "UNSUPPORTED_TRAVEL_COST")).toBe(true);

  const duplicateDetail = await ensureEventAnalyzed(apiClient, token, TRAVEL_EXCEPTION_FIXTURES.duplicate);
  const duplicateChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: TRAVEL_EXCEPTION_FIXTURES.duplicate,
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
  expect(duplicateChain.taxItems.map((item) => item.taxType)).toEqual(["增值税"]);
  expect(duplicateRisk.items.some((item) => item.ruleCode === "DUPLICATE_REIMBURSEMENT")).toBe(true);

  const crossPeriodDetail = await ensureEventAnalyzed(apiClient, token, TRAVEL_EXCEPTION_FIXTURES.crossPeriod);
  const crossPeriodChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: TRAVEL_EXCEPTION_FIXTURES.crossPeriod,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const crossPeriodRisk = await apiClient.post<{ items: Array<{ ruleCode: string; severity: string }>; total: number }>(
    `/api/events/${crossPeriodDetail.id}/risk-check`,
    token,
    {}
  );

  expect(crossPeriodChain.vouchers[0]?.voucherType).toBe("accrual");
  expect(crossPeriodRisk.items.some((item) => item.ruleCode === "CUTOFF_MISSTATEMENT")).toBe(true);

  await attachBusinessObject(testInfo, "travel-exception-missing-hotel", {
    event: await getEventDetailByTitle(apiClient, token, TRAVEL_EXCEPTION_FIXTURES.missingHotel),
    chain: missingChain,
    risk: missingRisk
  });
  await attachBusinessObject(testInfo, "travel-exception-duplicate", {
    event: await getEventDetailByTitle(apiClient, token, TRAVEL_EXCEPTION_FIXTURES.duplicate),
    chain: duplicateChain,
    risk: duplicateRisk
  });
  await attachBusinessObject(testInfo, "travel-exception-cross-period", {
    event: await getEventDetailByTitle(apiClient, token, TRAVEL_EXCEPTION_FIXTURES.crossPeriod),
    chain: crossPeriodChain,
    risk: crossPeriodRisk
  });
});
