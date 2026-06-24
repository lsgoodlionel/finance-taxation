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

test("contract revenue baseline captures current close-the-loop coverage and reconciliation gaps", async ({
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

  const importResult = {
    ok: false as const,
    skipped: true,
    sample: RECON_CSV,
    reason: "known_api_gap: /api/banking/statements/import is routed through JSON body parsing and can crash the API process"
  };
  const reconResult = {
    ok: false as const,
    skipped: true,
    reason: "reconciliation run skipped because stable statement import baseline is not available yet"
  };
  const candidates = {
    ok: false as const,
    skipped: true,
    reason: "candidate listing skipped because stable statement import baseline is not available yet"
  };

  const gaps = {
    missingExpectedDocumentTypes: CONTRACT_FIXTURE.expectedDocumentTypes.filter(
      (documentType) => !chain.documents.some((item) => item.documentType === documentType)
    ),
    contractDetailRouteStable: false,
    contractsPageStable: false,
    bankStatementImportStable: false,
    receivableLinked: chain.vouchers.some((item) => item.summary.includes("收入") || item.summary.includes("应收")),
    bankReceiptImported: importResult.ok,
    reconciliationCandidatesVisible: false,
    reconciliationRunOk: reconResult.ok,
    notes: [
      "当前基线使用 seeded 合同与事项，重点验证合同对象链和回款对账入口是否可达。",
      "已知缺陷：/api/contracts/:id 当前会因 attachment_ids 列缺失触发 API 进程退出，因此本基线不直接调用该接口。",
      "已知缺陷：ContractsPage 当前会联动触发详情接口，导致合同页实测不可作为稳定验收入口。",
      "已知缺陷：/api/banking/statements/import 当前会先进入全局 JSON 解析，CSV 直传可导致 API 进程退出。"
    ]
  };

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
    relatedVouchers: chain.vouchers.map((item) => item.summary)
  });
  await attachBusinessObject(testInfo, "contract-reconciliation", {
    importResult,
    reconResult,
    candidates
  });
  await attachBusinessObject(testInfo, "contract-baseline-gaps", gaps);
});
