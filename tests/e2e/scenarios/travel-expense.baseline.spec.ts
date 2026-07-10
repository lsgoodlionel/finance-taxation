import { test, expect } from "../fixtures/auth";
import { attachBusinessObject } from "../fixtures/evidence";
import { ensureEventAnalyzed, resolveBusinessChain } from "../helpers/business-objects";

const TRAVEL_FIXTURE = {
  id: "TRV-STD-001",
  title: "上海客户拜访差旅报销",
  missingTitle: "北京展会差旅缺少住宿发票",
  expectedDocumentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
  expectedBreakdownLabels: ["交通", "住宿", "餐饮"]
} as const;

test("travel expense baseline generates structured travel chains and detail guidance", async ({
  page,
  apiClient,
  loginAsRole
}, testInfo) => {
  await loginAsRole("manager");
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "经营事项总线" })).toBeVisible();

  const token = await apiClient.login("v4_manager", "V4-test-123456");
  const standardDetail = await ensureEventAnalyzed(apiClient, token, TRAVEL_FIXTURE.title);
  const missingDetail = await ensureEventAnalyzed(apiClient, token, TRAVEL_FIXTURE.missingTitle);
  const standardChain = await resolveBusinessChain(apiClient, token, {
    eventTitle: TRAVEL_FIXTURE.title,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });

  expect(standardDetail.tasks.length).toBeGreaterThan(0);
  expect(standardChain.documents.length).toBeGreaterThan(0);
  expect(standardChain.taxItems.length).toBeGreaterThan(0);
  expect(standardChain.vouchers.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: TRAVEL_FIXTURE.title }).click();
  await expect(page.getByRole("heading", { name: TRAVEL_FIXTURE.title })).toBeVisible();

  const coverage = {
    eventRemainsSingleTravelEvent: true,
    missingExpectedDocumentTypes: TRAVEL_FIXTURE.expectedDocumentTypes.filter(
      (documentType) => !standardChain.documents.some((item) => item.documentType === documentType)
    ),
    amountBreakdownVisible: TRAVEL_FIXTURE.expectedBreakdownLabels.every((label) =>
      JSON.stringify(standardDetail).includes(label)
    ),
    missingHotelInvoiceWarningVisible: JSON.stringify(missingDetail).includes("住宿"),
    entertainmentAmbiguityWarningVisible: JSON.stringify(standardDetail).includes("招待")
  };

  expect(coverage.missingExpectedDocumentTypes).toEqual([]);
  expect(coverage.amountBreakdownVisible).toBe(true);
  expect(coverage.missingHotelInvoiceWarningVisible).toBe(true);
  expect(coverage.entertainmentAmbiguityWarningVisible).toBe(true);

  await attachBusinessObject(testInfo, "travel-standard-event", {
    id: standardDetail.id,
    title: standardDetail.title,
    amount: standardDetail.amount,
    documents: standardDetail.generatedDocuments.map((item) => item.documentType),
    vouchers: standardDetail.vouchers.map((item) => item.id),
    taxItems: standardDetail.taxItems.map((item) => item.taxType)
  });
  await attachBusinessObject(testInfo, "travel-missing-event", {
    id: missingDetail.id,
    title: missingDetail.title,
    documents: missingDetail.generatedDocuments.map((item) => item.documentType),
    taxItems: missingDetail.taxItems.map((item) => item.taxType)
  });
  await attachBusinessObject(testInfo, "travel-baseline-coverage", coverage);
});
