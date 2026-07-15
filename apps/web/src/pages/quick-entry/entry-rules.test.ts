import {
  applyParsedToDraft,
  buildEventPayload,
  buildEventTitle,
  buildMissingItems,
  buildSummaryText,
  getTypePlainLabel,
  isDraftReadyForSubmit,
  isInvoiceMissing,
  MISSING_INVOICE_MARKER,
  pickAttachmentTargetDocument
} from "./entry-rules";
import type { QuickDraft } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeDraft(patch: Partial<QuickDraft> = {}): QuickDraft {
  return {
    type: "expense",
    amount: "800",
    occurredOn: "2026-07-14",
    counterparty: "远大公司",
    department: "",
    note: "昨天请客户吃饭花了 800",
    ...patch
  };
}

// ── 缺件（缺发票）判断规则 ───────────────────────────────────────────────────
assert(isInvoiceMissing("expense", false), "expected expense without attachment to miss invoice");
assert(isInvoiceMissing("travel_expense", false), "expected travel without attachment to miss invoice");
assert(isInvoiceMissing("procurement", false), "expected procurement without attachment to miss invoice");
assert(!isInvoiceMissing("expense", true), "expected attachment to satisfy invoice requirement");
assert(!isInvoiceMissing("sales", false), "expected income type to not require invoice");
assert(!isInvoiceMissing("payroll", false), "expected payroll to not require invoice");
assert(buildMissingItems("expense", false).length === 1, "expected one missing item hint");
assert(buildMissingItems("expense", true).length === 0, "expected no hint with attachment");

// ── 白话摘要与标题 ───────────────────────────────────────────────────────────
assert(getTypePlainLabel("expense") === "日常花销", "expected plain label for expense");
assert(getTypePlainLabel("unknown-type") === "unknown-type", "expected unknown type passthrough");
const summary = buildSummaryText(makeDraft());
assert(summary.includes("日常花销 800 元"), `expected summary type+amount, got ${summary}`);
assert(summary.includes("2026-07-14"), "expected summary date");
assert(summary.includes("对方：远大公司"), "expected summary counterparty");
const summaryNoParty = buildSummaryText(makeDraft({ counterparty: "" }));
assert(!summaryNoParty.includes("对方"), "expected summary without counterparty segment");

assert(buildEventTitle(makeDraft()) === "日常花销 · 远大公司", "expected title with counterparty");
const longNote = "这是一段特别长的白话描述超过十八个字肯定会被截断的吧";
const titleFromNote = buildEventTitle(makeDraft({ counterparty: "", note: longNote }));
assert(titleFromNote.endsWith("…") && titleFromNote.length <= 20, "expected truncated note title");

// ── 事项 payload 组装 ────────────────────────────────────────────────────────
const payload = buildEventPayload(makeDraft(), false);
assert(payload.type === "expense", "expected payload type");
assert(payload.amount === "800", "expected payload amount");
assert(payload.currency === "CNY", "expected CNY currency");
assert(payload.source === "manual", "expected manual source");
assert(payload.department === "综合", "expected default department");
assert(payload.description.includes(MISSING_INVOICE_MARKER), "expected missing invoice marker");
assert(payload.description.includes("对方单位：远大公司"), "expected counterparty in description");

const paidPayload = buildEventPayload(makeDraft({ department: " 销售部 " }), true);
assert(paidPayload.department === "销售部", "expected trimmed department");
assert(!paidPayload.description.includes(MISSING_INVOICE_MARKER), "expected no marker with attachment");

const emptyAmountPayload = buildEventPayload(makeDraft({ amount: "  " }), true);
assert(emptyAmountPayload.amount === null, "expected blank amount to become null");

// ── 提交放行条件 ─────────────────────────────────────────────────────────────
assert(isDraftReadyForSubmit(makeDraft()), "expected complete draft to be ready");
assert(!isDraftReadyForSubmit(makeDraft({ type: "" })), "expected missing type to block");
assert(!isDraftReadyForSubmit(makeDraft({ amount: "abc" })), "expected non-numeric amount to block");
assert(!isDraftReadyForSubmit(makeDraft({ amount: "0" })), "expected zero amount to block");
assert(!isDraftReadyForSubmit(makeDraft({ occurredOn: "昨天" })), "expected invalid date to block");

// ── 解析结果套用（不覆盖已填、不改原对象）────────────────────────────────────
const baseDraft = makeDraft({ type: "", amount: "", occurredOn: "", counterparty: "" });
const applied = applyParsedToDraft(baseDraft, {
  type: "expense",
  amount: "800",
  occurredOn: "2026-07-14",
  counterparty: "远大公司"
});
assert(applied.type === "expense" && applied.amount === "800", "expected parsed fields applied");
assert(baseDraft.type === "" && baseDraft.amount === "", "expected original draft untouched");
const keepUserInput = applyParsedToDraft(makeDraft({ amount: "999" }), {
  type: null,
  amount: "800",
  occurredOn: null,
  counterparty: null
});
assert(keepUserInput.amount === "999", "expected user amount to win over parsed");

// ── 附件挂载目标选择 ─────────────────────────────────────────────────────────
const docs = [
  { id: "d1", documentType: "expense_claim", status: "generated" },
  { id: "d2", documentType: "supplier_invoice", status: "awaiting_upload" },
  { id: "d3", documentType: "receipt", status: "awaiting_upload" }
];
assert(pickAttachmentTargetDocument(docs)?.id === "d2", "expected invoice-like doc preferred");
const noInvoiceDocs = [
  { id: "d1", documentType: "expense_claim", status: "generated" },
  { id: "d3", documentType: "receipt", status: "awaiting_upload" }
];
assert(pickAttachmentTargetDocument(noInvoiceDocs)?.id === "d3", "expected awaiting_upload fallback");
assert(
  pickAttachmentTargetDocument([{ id: "d9", documentType: "contract", status: "ready" }])?.id === "d9",
  "expected first doc as last resort"
);
assert(pickAttachmentTargetDocument([]) === null, "expected empty docs to return null");
