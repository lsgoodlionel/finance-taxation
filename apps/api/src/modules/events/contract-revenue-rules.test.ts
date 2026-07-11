import test from "node:test";
import assert from "node:assert/strict";
import type { BusinessEvent } from "@finance-taxation/domain-model";
import { buildContractRevenueBundle, resolveContractRevenueScenario } from "./contract-revenue-rules.js";

function makeContractRevenueEvent(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: "CON-STD-001",
    companyId: "cmp-v4-service",
    type: "contract_revenue" as unknown as BusinessEvent["type"],
    title: "年度财税咨询服务收入",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["service_contract", "acceptance_record", "output_invoice"],
        contractNo: "V4-CON-0001"
      },
      expected: {
        classification: "service_revenue",
        documentTypes: ["service_contract", "acceptance_record", "output_invoice"],
        exceptions: [],
        risks: [],
        tax: "按 2026-04 增值税纳税义务确认销项税并计入企业所得税收入"
      }
    }),
    department: "人事部",
    ownerId: "usr-v4-tax",
    occurredOn: "2026-04-30",
    amount: "120000.00",
    currency: "CNY",
    status: "needs_review" as unknown as BusinessEvent["status"],
    source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"],
    contractId: "CON-STD-001-contract",
    counterpartyId: null,
    projectId: null,
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    ...overrides
  };
}

test("buildContractRevenueBundle generates standard contract revenue chain", () => {
  const scenario = resolveContractRevenueScenario(makeContractRevenueEvent());
  assert.equal(scenario.missingAcceptanceRecord, false);
  assert.equal(scenario.duplicateContract, false);
  assert.equal(scenario.revenueTimingConflict, false);

  const bundle = buildContractRevenueBundle(makeContractRevenueEvent());
  assert.deepEqual(
    bundle.documentMappings.map((item) => item.documentType),
    ["service_contract", "acceptance_record", "output_invoice"]
  );
  assert.deepEqual(bundle.taxMappings.map((item) => item.taxType), ["增值税", "企业所得税"]);
  assert.equal(bundle.voucherDrafts[0]?.status, "review_required");
  assert.equal(bundle.voucherDrafts[0]?.lines[0]?.accountCode, "1122");
  assert.equal(bundle.voucherDrafts[0]?.lines[1]?.accountCode, "6001");
});

test("resolveContractRevenueScenario flags missing acceptance and defers revenue recognition", () => {
  const event = makeContractRevenueEvent({
    id: "CON-MISSING-001",
    title: "系统实施服务缺少验收单",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["service_contract", "output_invoice"],
        contractNo: "V4-CON-0002"
      },
      expected: {
        classification: "deferred_service_revenue",
        documentTypes: ["service_contract", "acceptance_record", "output_invoice"],
        exceptions: ["missing_acceptance_record"],
        risks: ["premature_revenue_recognition"],
        tax: "已开票部分按税法确认增值税义务，会计与所得税收入时点待核验"
      }
    }),
    amount: "88000.00",
    contractId: "CON-MISSING-001-contract"
  });

  const scenario = resolveContractRevenueScenario(event);
  assert.equal(scenario.missingAcceptanceRecord, true);
  assert.equal(scenario.classification, "deferred_service_revenue");

  const bundle = buildContractRevenueBundle(event);
  assert.equal(bundle.documentMappings.find((item) => item.documentType === "acceptance_record")?.status, "missing");
  assert.deepEqual(bundle.taxMappings.map((item) => item.taxType), ["增值税", "企业所得税"]);
  assert.equal(bundle.voucherDrafts[0]?.status, "draft");
  assert.equal(bundle.voucherDrafts[0]?.lines[1]?.accountCode, "2203");
});

test("buildContractRevenueBundle blocks duplicate contract revenue from creating vouchers", () => {
  const event = makeContractRevenueEvent({
    id: "CON-DUP-001",
    title: "重复导入年度财税咨询合同",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["service_contract", "acceptance_record", "output_invoice"],
        contractNo: "V4-CON-0001",
        duplicateOf: "CON-STD-001"
      },
      expected: {
        classification: "service_revenue",
        documentTypes: ["service_contract", "acceptance_record", "output_invoice"],
        exceptions: ["duplicate_contract"],
        risks: ["revenue_overstatement"],
        tax: "阻止重复生成销项税额"
      }
    })
  });

  const scenario = resolveContractRevenueScenario(event);
  assert.equal(scenario.duplicateContract, true);

  const bundle = buildContractRevenueBundle(event);
  assert.equal(bundle.voucherDrafts.length, 0);
  assert.deepEqual(bundle.taxMappings.map((item) => item.taxType), ["增值税"]);
});

test("buildContractRevenueBundle moves subscription revenue into deferred recognition workflow", () => {
  const event = makeContractRevenueEvent({
    id: "CON-TIME-001",
    title: "跨期订阅服务一次性确认收入",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["service_contract", "billing_schedule", "output_invoice"],
        contractNo: "V4-CON-0004",
        serviceStart: "2026-06-01",
        serviceEnd: "2027-05-31",
        claimedRecognition: "upfront"
      },
      expected: {
        classification: "deferred_subscription_revenue",
        documentTypes: ["service_contract", "billing_schedule", "output_invoice"],
        exceptions: ["revenue_timing_conflict"],
        risks: ["premature_revenue_recognition", "tax_accounting_timing_difference"],
        tax: "增值税按开票或收款义务时点确认，所得税收入按适用规则分期核验"
      }
    }),
    occurredOn: "2026-06-01",
    amount: "240000.00",
    contractId: "CON-TIME-001-contract"
  });

  const scenario = resolveContractRevenueScenario(event);
  assert.equal(scenario.revenueTimingConflict, true);
  assert.equal(scenario.classification, "deferred_subscription_revenue");

  const bundle = buildContractRevenueBundle(event);
  assert.deepEqual(
    bundle.documentMappings.map((item) => item.documentType),
    ["service_contract", "billing_schedule", "output_invoice"]
  );
  assert.equal(bundle.voucherDrafts[0]?.voucherType, "accrual");
  assert.equal(bundle.voucherDrafts[0]?.lines[1]?.accountCode, "2203");
  assert.equal(bundle.taxMappings.find((item) => item.taxType === "企业所得税")?.basis.includes("分期核验"), true);
});
