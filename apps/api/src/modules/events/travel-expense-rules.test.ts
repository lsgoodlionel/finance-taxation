import test from "node:test";
import assert from "node:assert/strict";
import type { BusinessEvent } from "@finance-taxation/domain-model";
import { buildTravelExpenseBundle, resolveTravelExpenseScenario } from "./travel-expense-rules.js";

function makeTravelEvent(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: "TRV-STD-001",
    companyId: "cmp-v4-tech",
    type: "travel_expense" as unknown as BusinessEvent["type"],
    title: "上海客户拜访差旅报销",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"]
      },
      expected: {
        classification: "travel_expense",
        documentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
        exceptions: [],
        risks: [],
        tax: "符合差旅制度的交通住宿票据按规定抵扣并税前扣除"
      }
    }),
    department: "销售部",
    ownerId: "usr-v4-employee",
    occurredOn: "2026-04-22",
    amount: "3560.00",
    currency: "CNY",
    status: "needs_review" as unknown as BusinessEvent["status"],
    source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"],
    contractId: null,
    counterpartyId: null,
    projectId: null,
    createdAt: "2026-04-22T00:00:00.000Z",
    updatedAt: "2026-04-22T00:00:00.000Z",
    ...overrides
  };
}

test("buildTravelExpenseBundle generates standard travel chain with required travel documents", () => {
  const scenario = resolveTravelExpenseScenario(makeTravelEvent());
  assert.equal(scenario.missingHotelInvoice, false);
  assert.equal(scenario.duplicateClaim, false);
  assert.equal(scenario.accountingPeriodConflict, false);

  const bundle = buildTravelExpenseBundle(makeTravelEvent());
  assert.deepEqual(
    bundle.documentMappings.map((item) => item.documentType),
    ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"]
  );
  assert.deepEqual(bundle.taxMappings.map((item) => item.taxType), ["增值税", "企业所得税"]);
  assert.equal(bundle.voucherDrafts[0]?.status, "review_required");
  assert.equal(bundle.voucherDrafts[0]?.lines[0]?.accountCode, "6601");
});

test("resolveTravelExpenseScenario marks missing hotel invoice and suppresses transport-hotel VAT deduction", () => {
  const event = makeTravelEvent({
    id: "TRV-MISSING-001",
    title: "北京展会差旅缺少住宿发票",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["travel_request", "expense_claim", "transport_invoice"]
      },
      expected: {
        classification: "travel_expense",
        documentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
        exceptions: ["missing_hotel_invoice"],
        risks: ["unsupported_travel_cost"],
        tax: "缺失住宿发票部分不得抵扣且税前扣除待补证"
      }
    }),
    amount: "4280.00"
  });

  const scenario = resolveTravelExpenseScenario(event);
  assert.equal(scenario.missingHotelInvoice, true);

  const bundle = buildTravelExpenseBundle(event);
  assert.equal(bundle.documentMappings.find((item) => item.documentType === "hotel_invoice")?.status, "missing");
  assert.deepEqual(bundle.taxMappings.map((item) => item.taxType), ["企业所得税"]);
  assert.equal(bundle.voucherDrafts[0]?.status, "draft");
});

test("buildTravelExpenseBundle blocks duplicate trip claims from creating vouchers", () => {
  const event = makeTravelEvent({
    id: "TRV-DUP-001",
    title: "重复提交上海客户拜访差旅",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"]
      },
      expected: {
        classification: "travel_expense",
        documentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
        exceptions: ["duplicate_trip_claim"],
        risks: ["duplicate_reimbursement"],
        tax: "阻止重复抵扣交通住宿进项税"
      }
    })
  });

  const scenario = resolveTravelExpenseScenario(event);
  assert.equal(scenario.duplicateClaim, true);

  const bundle = buildTravelExpenseBundle(event);
  assert.equal(bundle.voucherDrafts.length, 0);
  assert.deepEqual(bundle.taxMappings.map((item) => item.taxType), ["增值税"]);
});

test("buildTravelExpenseBundle upgrades cross-period travel claim into accrual workflow", () => {
  const event = makeTravelEvent({
    id: "TRV-TIME-001",
    title: "跨期差旅报销计入错误月份",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
        claimedPeriod: "2026-05"
      },
      expected: {
        classification: "travel_expense_accrual",
        documentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
        exceptions: ["accounting_period_conflict"],
        risks: ["cutoff_misstatement"],
        tax: "发票抵扣期按认证月份处理，所得税费用按实际归属期确认"
      }
    }),
    occurredOn: "2026-05-03",
    amount: "6920.00"
  });

  const scenario = resolveTravelExpenseScenario(event);
  assert.equal(scenario.accountingPeriodConflict, true);
  assert.equal(scenario.classification, "travel_expense_accrual");

  const bundle = buildTravelExpenseBundle(event);
  assert.equal(bundle.voucherDrafts[0]?.voucherType, "accrual");
  assert.equal(bundle.voucherDrafts[0]?.status, "review_required");
  assert.equal(bundle.taxMappings.find((item) => item.taxType === "企业所得税")?.basis.includes("实际归属期"), true);
});
