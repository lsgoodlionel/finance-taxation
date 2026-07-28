import type { TaxFilingBatch } from "@finance-taxation/domain-model";
import {
  countFiledObligations,
  countOverdueObligations,
  currentFilingPeriod,
  deriveTaxObligations
} from "./tax-obligations";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeBatch(overrides: Partial<TaxFilingBatch> = {}): TaxFilingBatch {
  return {
    id: "tax-batch-1",
    companyId: "c1",
    taxType: "vat",
    filingPeriod: "2026-05",
    status: "ready",
    itemIds: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides
  };
}

// ── 申报期：默认当月，两位月份补零 ──────────────────────────────────────────
assert(currentFilingPeriod(new Date(2026, 4, 20)) === "2026-05", "expected zero padded period");
assert(currentFilingPeriod(new Date(2026, 11, 1)) === "2026-12", "expected december period");

// ── 月度税种三项；季末月才追加季度税种 ──────────────────────────────────────
const may = deriveTaxObligations([], "2026-05", new Date(2026, 5, 1));
assert(may.length === 3, `expected 3 monthly obligations, got ${may.length}`);
assert(may.every((item) => item.frequency === "monthly"), "expected only monthly taxes outside quarter end");

const june = deriveTaxObligations([], "2026-06", new Date(2026, 6, 1));
assert(june.length === 4, `expected quarterly tax at quarter end, got ${june.length}`);
assert(june.some((item) => item.taxType === "cit"), "expected the quarterly tax to appear in june");

// ── 截止日：次月 15 日 ──────────────────────────────────────────────────────
const vat = may.find((item) => item.taxType === "vat");
assert(vat, "expected a vat obligation");
assert(vat.dueDate.getFullYear() === 2026, "expected due date year");
assert(vat.dueDate.getMonth() === 5, "expected due date in the following month (0-based june)");
assert(vat.dueDate.getDate() === 15, "expected the 15th as the deadline");

// ── 状态：已提交/已留档算已申报，过期未报算逾期 ──────────────────────────────
const beforeDue = deriveTaxObligations([], "2026-05", new Date(2026, 5, 10));
assert(beforeDue.every((item) => item.status === "pending"), "expected pending before the deadline");
assert(
  beforeDue.find((item) => item.taxType === "vat")?.daysRemaining === 5,
  "expected days remaining to count down to the deadline"
);

const afterDue = deriveTaxObligations([], "2026-05", new Date(2026, 5, 20));
assert(afterDue.every((item) => item.status === "overdue"), "expected overdue once the deadline passed");
assert(countOverdueObligations(afterDue) === 3, "expected all three monthly taxes overdue");

const submitted = deriveTaxObligations(
  [makeBatch({ status: "submitted" })],
  "2026-05",
  new Date(2026, 5, 20)
);
assert(
  submitted.find((item) => item.taxType === "vat")?.status === "filed",
  "expected a submitted batch to clear the obligation even after the deadline"
);
assert(countOverdueObligations(submitted) === 2, "expected the filed tax to drop out of the overdue count");
assert(countFiledObligations(submitted) === 1, "expected one filed obligation");

const archived = deriveTaxObligations([makeBatch({ status: "archived" })], "2026-05", new Date(2026, 5, 20));
assert(
  archived.find((item) => item.taxType === "vat")?.status === "filed",
  "expected an archived batch to count as filed"
);

// 未走完流程的批次不算已申报——角标必须继续催
const draft = deriveTaxObligations([makeBatch({ status: "review_required" })], "2026-05", new Date(2026, 5, 20));
assert(
  draft.find((item) => item.taxType === "vat")?.status === "overdue",
  "expected an unfinished batch to stay overdue"
);
assert(
  draft.find((item) => item.taxType === "vat")?.batchStatus === "review_required",
  "expected the batch status carried through for display"
);

// ── 批次匹配按税种关键字 + 申报期前缀，不误伤其它税种 ────────────────────────
const mismatch = deriveTaxObligations(
  [makeBatch({ taxType: "vat", filingPeriod: "2026-04", status: "submitted" })],
  "2026-05",
  new Date(2026, 5, 10)
);
assert(
  mismatch.find((item) => item.taxType === "vat")?.batchId === null,
  "expected a different period's batch not to be matched"
);

// ── 非法申报期不抛错，返回空表 ──────────────────────────────────────────────
assert(deriveTaxObligations([], "", new Date()).length === 0, "expected empty for a blank period");
assert(deriveTaxObligations([], "not-a-period", new Date()).length === 0, "expected empty for a bad period");

console.log("tax-obligations-ok");
