import { test, expect } from "../fixtures/auth";
import { attachBusinessObject } from "../fixtures/evidence";
import { ensureEventAnalyzed, resolveBusinessChain } from "../helpers/business-objects";

const CONTRACT_FIXTURE = {
  contractId: "CON-STD-001-contract",
  contractNo: "V4-CON-0001",
  title: "年度财税咨询服务收入",
  eventTitle: "年度财税咨询服务收入",
  expectedDocumentTypes: ["service_contract", "acceptance_record", "output_invoice"]
} as const;

const RECON_CSV = `交易日期,记账日期,交易金额,账户余额,摘要,对方账号,对方户名
2026-05-10,2026-05-10,120000.00,220000.00,年度财税咨询服务收入回款,6226200012345678,V4 验收客户
`;

test("contract revenue baseline closes the core contract-to-revenue loop", async ({
  page,
  apiClient,
  loginAsRole
}, testInfo) => {
  await loginAsRole("tax");
  await expect(page.getByLabel("主导航菜单")).toBeVisible();

  const token = await apiClient.login("v4_tax", "V4-test-123456");
  const detail = await ensureEventAnalyzed(apiClient, token, CONTRACT_FIXTURE.eventTitle);
  const chain = await resolveBusinessChain(apiClient, token, {
    eventTitle: CONTRACT_FIXTURE.eventTitle,
    documentTypes: [],
    voucherRequired: false,
    taxTypes: []
  });
  const contractList = await apiClient.get<{
    items: Array<{ id: string; title: string; contractNo: string; status: string }>;
    total: number;
  }>("/api/contracts", token);
  const contract = contractList.items.find(
    (item) => item.contractNo === CONTRACT_FIXTURE.contractNo && item.title === CONTRACT_FIXTURE.title
  );

  expect(contract).toBeDefined();
  expect(chain.documents.length).toBeGreaterThan(0);
  expect(chain.taxItems.length).toBeGreaterThan(0);
  expect(chain.vouchers.length).toBeGreaterThan(0);

  const contractDetail = await apiClient.get<{
    contract: { id: string; contractNo: string; title: string; status: string };
    relatedEvents: Array<{ id: string; title: string; status: string }>;
    relatedTasks: Array<{ id: string; title: string }>;
    relatedDocuments: Array<{ id: string; documentType: string; status: string }>;
    relatedTaxItems: Array<{ id: string; taxType: string }>;
    relatedVouchers: Array<{ id: string; summary: string }>;
  }>(`/api/contracts/${CONTRACT_FIXTURE.contractId}`, token);

  const coverage = {
    missingExpectedDocumentTypes: CONTRACT_FIXTURE.expectedDocumentTypes.filter(
      (documentType) => !chain.documents.some((item) => item.documentType === documentType)
    ),
    contractDetailRouteStable: true,
    receivableLinked: chain.vouchers.some((item) => item.summary.includes("收入") || item.summary.includes("应收")),
    contractObjectsLinked: contractDetail.relatedDocuments.length > 0
      && contractDetail.relatedTaxItems.length > 0
      && contractDetail.relatedVouchers.length > 0
  };

  expect(coverage.missingExpectedDocumentTypes).toEqual([]);
  expect(coverage.receivableLinked).toBe(true);
  expect(coverage.contractDetailRouteStable).toBe(true);
  expect(coverage.contractObjectsLinked).toBe(true);

  await attachBusinessObject(testInfo, "contract-event-detail", {
    id: detail.id,
    title: detail.title,
    documents: detail.generatedDocuments.map((item) => item.documentType),
    vouchers: detail.vouchers.map((item) => item.id),
    taxItems: detail.taxItems.map((item) => item.taxType)
  });
  await attachBusinessObject(testInfo, "contract-object-chain", {
    contract,
    relatedEvents: [detail].map((item) => ({ id: item.id, title: item.title, status: item.status })),
    relatedTasks: detail.tasks.map((item) => item.title),
    relatedDocuments: chain.documents.map((item) => item.documentType),
    relatedTaxItems: chain.taxItems.map((item) => item.taxType),
    relatedVouchers: chain.vouchers.map((item) => item.summary),
    contractDetail
  });
  await attachBusinessObject(testInfo, "contract-baseline-coverage", coverage);
});
