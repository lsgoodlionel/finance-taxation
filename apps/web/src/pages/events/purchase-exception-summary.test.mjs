import test from "node:test";
import assert from "node:assert/strict";
import { derivePurchaseExceptionSummary } from "./purchase-exception-summary.ts";

test("derivePurchaseExceptionSummary returns null for ordinary descriptions", () => {
  assert.equal(derivePurchaseExceptionSummary("expense", "普通事项描述"), null);
});

test("derivePurchaseExceptionSummary explains missing invoice purchase expense", () => {
  const summary = derivePurchaseExceptionSummary(
    "purchase_expense",
    JSON.stringify({
      input: { providedDocumentTypes: ["expense_claim"] },
      expected: {
        classification: "sales_expense",
        documentTypes: ["expense_claim", "invoice_bundle"],
        exceptions: ["missing_invoice_bundle"],
        risks: ["unsupported_tax_deduction"]
      }
    })
  );

  assert.equal(summary?.tone, "warning");
  assert.match(summary?.title ?? "", /缺票/);
  assert.equal(summary?.bullets.includes("当前缺少报销票据包，单据中心会保持“待上传”。"), true);
});

test("derivePurchaseExceptionSummary explains duplicate reimbursement", () => {
  const summary = derivePurchaseExceptionSummary(
    "purchase_expense",
    JSON.stringify({
      input: { providedDocumentTypes: ["expense_claim", "invoice_bundle"] },
      expected: {
        classification: "low_value_consumable",
        documentTypes: ["expense_claim", "invoice_bundle"],
        exceptions: ["duplicate_invoice"],
        risks: ["duplicate_reimbursement"]
      }
    })
  );

  assert.equal(summary?.tone, "error");
  assert.match(summary?.title ?? "", /重复报销/);
  assert.equal(summary?.bullets.includes("当前不会自动生成正式凭证草稿，需先核对历史报销与抵扣记录。"), true);
});

test("derivePurchaseExceptionSummary explains asset reclassification", () => {
  const summary = derivePurchaseExceptionSummary(
    "purchase_expense",
    JSON.stringify({
      input: {
        providedDocumentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
        claimedClassification: "office_supplies"
      },
      expected: {
        classification: "fixed_asset",
        documentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
        exceptions: ["classification_conflict"],
        risks: ["expense_overstatement"]
      }
    })
  );

  assert.equal(summary?.tone, "warning");
  assert.match(summary?.title ?? "", /固定资产/);
  assert.equal(summary?.bullets.includes("系统已按固定资产口径准备资料与凭证，借方科目会切到固定资产。"), true);
});
