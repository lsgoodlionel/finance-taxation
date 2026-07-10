import test from "node:test";
import assert from "node:assert/strict";
import type { BusinessEvent } from "@finance-taxation/domain-model";
import { buildPurchaseExpenseBundle, resolvePurchaseExpenseScenario } from "./purchase-expense-rules.js";

function makePurchaseEvent(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: "PUR-STD-001",
    companyId: "cmp-v4-tech",
    type: "purchase_expense" as unknown as BusinessEvent["type"],
    title: "临时购买办公显示器",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["expense_claim", "invoice_bundle"],
        claimedClassification: "office_supplies"
      },
      expected: {
        classification: "low_value_consumable",
        documentTypes: ["expense_claim", "invoice_bundle"],
        exceptions: [],
        risks: [],
        tax: "合规增值税专用发票在 2026-04 认证抵扣"
      }
    }),
    department: "销售部",
    ownerId: "usr-v4-employee",
    occurredOn: "2026-04-08",
    amount: "1280.00",
    currency: "CNY",
    status: "needs_review" as unknown as BusinessEvent["status"],
    source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"],
    contractId: null,
    counterpartyId: null,
    projectId: null,
    createdAt: "2026-04-08T00:00:00.000Z",
    updatedAt: "2026-04-08T00:00:00.000Z",
    ...overrides
  };
}

test("resolvePurchaseExpenseScenario flags missing invoice bundle and suppresses input VAT", () => {
  const scenario = resolvePurchaseExpenseScenario(
    makePurchaseEvent({
      id: "PUR-MISSING-001",
      title: "客户活动用品采购缺少发票",
      description: JSON.stringify({
        input: {
          providedDocumentTypes: ["expense_claim"]
        },
        expected: {
          classification: "sales_expense",
          documentTypes: ["expense_claim", "invoice_bundle"],
          exceptions: ["missing_invoice_bundle"],
          risks: ["unsupported_tax_deduction"],
          tax: "缺少发票不得抵扣进项税，企业所得税税前扣除待核验"
        }
      }),
      amount: "860.00"
    })
  );

  assert.equal(scenario.missingInvoiceBundle, true);
  assert.equal(scenario.duplicateInvoice, false);
  assert.equal(scenario.classificationConflict, false);

  const bundle = buildPurchaseExpenseBundle(
    makePurchaseEvent({
      id: "PUR-MISSING-001",
      title: "客户活动用品采购缺少发票",
      description: JSON.stringify({
        input: {
          providedDocumentTypes: ["expense_claim"]
        },
        expected: {
          classification: "sales_expense",
          documentTypes: ["expense_claim", "invoice_bundle"],
          exceptions: ["missing_invoice_bundle"],
          risks: ["unsupported_tax_deduction"],
          tax: "缺少发票不得抵扣进项税，企业所得税税前扣除待核验"
        }
      }),
      amount: "860.00"
    })
  );

  assert.equal(bundle.documentMappings.find((item) => item.documentType === "invoice_bundle")?.status, "missing");
  assert.deepEqual(bundle.taxMappings.map((item) => item.taxType), ["企业所得税"]);
  assert.equal(bundle.voucherDrafts[0]?.status, "draft");
});

test("buildPurchaseExpenseBundle blocks duplicate reimbursement from generating voucher drafts", () => {
  const scenario = resolvePurchaseExpenseScenario(
    makePurchaseEvent({
      id: "PUR-DUP-001",
      title: "重复提交办公耗材采购",
      description: JSON.stringify({
        input: {
          providedDocumentTypes: ["expense_claim", "invoice_bundle"]
        },
        expected: {
          classification: "low_value_consumable",
          documentTypes: ["expense_claim", "invoice_bundle"],
          exceptions: ["duplicate_invoice"],
          risks: ["duplicate_reimbursement"],
          tax: "阻止同一发票重复抵扣"
        }
      })
    })
  );

  assert.equal(scenario.duplicateInvoice, true);

  const bundle = buildPurchaseExpenseBundle(
    makePurchaseEvent({
      id: "PUR-DUP-001",
      title: "重复提交办公耗材采购",
      description: JSON.stringify({
        input: {
          providedDocumentTypes: ["expense_claim", "invoice_bundle"]
        },
        expected: {
          classification: "low_value_consumable",
          documentTypes: ["expense_claim", "invoice_bundle"],
          exceptions: ["duplicate_invoice"],
          risks: ["duplicate_reimbursement"],
          tax: "阻止同一发票重复抵扣"
        }
      })
    })
  );

  assert.equal(bundle.voucherDrafts.length, 0);
});

test("buildPurchaseExpenseBundle reclassifies high-value misclassified purchase into asset flow", () => {
  const scenario = resolvePurchaseExpenseScenario(
    makePurchaseEvent({
      id: "PUR-CLASS-001",
      title: "高价值研发工作站误分类办公用品",
      description: JSON.stringify({
        input: {
          providedDocumentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
          claimedClassification: "office_supplies"
        },
        expected: {
          classification: "fixed_asset",
          documentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
          exceptions: ["classification_conflict"],
          risks: ["expense_overstatement"],
          tax: "进项税可按规定抵扣，所得税按固定资产折旧扣除"
        }
      }),
      amount: "26800.00"
    })
  );

  assert.equal(scenario.classificationConflict, true);
  assert.equal(scenario.classification, "fixed_asset");

  const bundle = buildPurchaseExpenseBundle(
    makePurchaseEvent({
      id: "PUR-CLASS-001",
      title: "高价值研发工作站误分类办公用品",
      description: JSON.stringify({
        input: {
          providedDocumentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
          claimedClassification: "office_supplies"
        },
        expected: {
          classification: "fixed_asset",
          documentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
          exceptions: ["classification_conflict"],
          risks: ["expense_overstatement"],
          tax: "进项税可按规定抵扣，所得税按固定资产折旧扣除"
        }
      }),
      amount: "26800.00"
    })
  );

  assert.deepEqual(
    bundle.documentMappings.map((item) => item.documentType),
    ["purchase_request", "invoice_bundle", "acceptance_record"]
  );
  assert.equal(bundle.voucherDrafts[0]?.lines[0]?.accountCode, "1601");
});
