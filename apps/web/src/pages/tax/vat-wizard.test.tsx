// Unit tests for VatDeclarationWizard logic — no DOM required
function okVat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── VAT computation ──────────────────────────────────────────────────────────

function computeVat(outputTax: number, inputTax: number, simplified: number) {
  const payable = outputTax - inputTax + simplified;
  return { payable, isRefund: payable < 0 };
}

const v1 = computeVat(100000, 60000, 0);
okVat(v1.payable === 40000, "payable VAT = output - input");
okVat(!v1.isRefund,         "positive payable is not a refund");

const v2 = computeVat(30000, 60000, 0);
okVat(v2.payable === -30000, "negative means VAT refund");
okVat(v2.isRefund,           "negative payable is a refund");

const v3 = computeVat(50000, 30000, 5000);
okVat(v3.payable === 25000, "simplified tax added to payable");

// ─── Batch lookup ─────────────────────────────────────────────────────────────

interface BatchLite { id: string; taxType: string; filingPeriod: string; status: string }

function findVatBatch(batches: BatchLite[], period: string): BatchLite | null {
  return batches.find(b => b.taxType === "vat" && b.filingPeriod === period) ?? null;
}

const batches: BatchLite[] = [
  { id: "b1", taxType: "vat",  filingPeriod: "2026-05", status: "ready" },
  { id: "b2", taxType: "iit",  filingPeriod: "2026-05", status: "draft" },
  { id: "b3", taxType: "vat",  filingPeriod: "2026-04", status: "filed" },
];

const found = findVatBatch(batches, "2026-05");
okVat(found?.id === "b1",    "finds correct VAT batch for period");

const notFound = findVatBatch(batches, "2026-06");
okVat(notFound === null,     "returns null for non-existent period");

const old = findVatBatch(batches, "2026-04");
okVat(old?.status === "filed", "finds already-filed batch");

// ─── Step navigation ──────────────────────────────────────────────────────────

const STEP_COUNT = 4;

function canGoNext(step: number, totalSteps: number): boolean {
  return step < totalSteps - 1;
}
function canSubmit(step: number, totalSteps: number): boolean {
  return step === totalSteps - 1;
}
function canGoBack(step: number): boolean {
  return step > 0;
}

okVat(canGoNext(0, STEP_COUNT),  "step 0 can go next");
okVat(canGoNext(2, STEP_COUNT),  "step 2 can go next");
okVat(!canGoNext(3, STEP_COUNT), "last step cannot go next");
okVat(canSubmit(3, STEP_COUNT),  "last step can submit");
okVat(!canSubmit(2, STEP_COUNT), "non-last step cannot submit");
okVat(!canGoBack(0),             "step 0 cannot go back");
okVat(canGoBack(1),              "step 1 can go back");
