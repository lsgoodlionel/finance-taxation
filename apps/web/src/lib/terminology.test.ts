import { TERMINOLOGY, getTermEntry } from "./terminology";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// 词条数 ≥ 30
assert(TERMINOLOGY.length >= 30, `expected at least 30 term entries, got ${TERMINOLOGY.length}`);

// 必填字段完整
for (const entry of TERMINOLOGY) {
  assert(entry.key.trim().length > 0, "expected non-empty key");
  assert(entry.term.trim().length > 0, `expected non-empty term for key ${entry.key}`);
  assert(entry.plain.trim().length > 0, `expected non-empty plain for key ${entry.key}`);
  assert(entry.brief.trim().length > 0, `expected non-empty brief for key ${entry.key}`);
  if (entry.detail !== undefined) {
    assert(entry.detail.trim().length > 0, `expected non-empty detail for key ${entry.key}`);
  }
}

// key 唯一
const keys = TERMINOLOGY.map((entry) => entry.key);
assert(new Set(keys).size === keys.length, "expected unique term keys");

// 核心高频术语必须覆盖
const REQUIRED_KEYS = [
  "posting", "journal-entry", "voucher", "debit", "credit", "debit-credit-balance",
  "accrual", "depreciation", "amortization", "close-income", "accrual-basis",
  "reconciliation", "working-paper", "period-lock", "reopen-period",
  "output-vat", "input-vat", "vat", "surtax", "stamp-duty", "cit", "iit",
  "super-deduction", "rnd-collection", "three-statements", "balance-sheet",
  "income-statement", "cash-flow-statement", "account", "opening-balance",
  "trial-balance", "archive", "audit-trail", "invoice-tax-consistency",
  "filing-batch", "taxpayer-profile"
];
for (const key of REQUIRED_KEYS) {
  assert(getTermEntry(key) !== null, `expected required term key ${key} to exist`);
}

// 查询函数行为
const posting = getTermEntry("posting");
assert(posting?.term === "过账", "expected posting entry to resolve 过账");
assert(posting?.plain.includes("账本"), "expected posting plain wording to stay boss-friendly");
assert(getTermEntry("no-such-term") === null, "expected unknown key to return null");
