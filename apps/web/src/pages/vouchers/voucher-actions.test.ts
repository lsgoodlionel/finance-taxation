// Unit tests for voucher-actions — no DOM required
import type { Voucher } from "@finance-taxation/domain-model";
import {
  filterVouchersByTab,
  formatVoucherCode,
  NEXT_ACTION_LABELS,
  resolveNextAction,
  runSequentialBatch,
  splitBatchTargets,
  voucherAmount,
  type BatchProgress,
} from "./voucher-actions";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeVoucher(id: string, status: Voucher["status"], debits: string[] = []): Voucher {
  return {
    id,
    companyId: "c1",
    businessEventId: "",
    mappingId: "",
    voucherType: "general",
    summary: `voucher-${id}`,
    status,
    lines: debits.map((debit, index) => ({
      id: `${id}-l${index}`,
      summary: "",
      accountCode: "1001",
      accountName: "库存现金",
      debit,
      credit: "0",
    })),
    approvedAt: null,
    postedAt: null,
    source: "analysis",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

// ─── resolveNextAction: keyboard "a" smart action ─────────────────────────────

ok(resolveNextAction("draft") === "validate_approve", "draft next action is validate+approve");
ok(resolveNextAction("review_required") === "post", "review_required next action is post");
ok(resolveNextAction("posted") === "none", "posted has no next action");
ok(NEXT_ACTION_LABELS.validate_approve === "校验并审核", "validate_approve label");
ok(NEXT_ACTION_LABELS.post === "过账", "post label");

// ─── filterVouchersByTab ──────────────────────────────────────────────────────

const all = [
  makeVoucher("v1", "draft"),
  makeVoucher("v2", "draft"),
  makeVoucher("v3", "review_required"),
  makeVoucher("v4", "posted"),
];
ok(filterVouchersByTab(all, "all").length === 4, "all tab keeps every voucher");
ok(filterVouchersByTab(all, "draft").length === 2, "draft tab filters drafts");
ok(filterVouchersByTab(all, "posted").length === 1, "posted tab filters posted");
const filteredCopy = filterVouchersByTab(all, "all");
ok(filteredCopy !== all, "filter returns a new array, never the original");

// ─── voucherAmount / formatVoucherCode ────────────────────────────────────────

ok(voucherAmount(makeVoucher("v5", "draft", ["1000.00", "234.50"])) === 1234.5, "amount sums debit side");
ok(voucherAmount(makeVoucher("v6", "draft", ["abc"])) === 0, "invalid debit counts as zero");
ok(formatVoucherCode("voucher-abcd1234") === "ABCD1234", "code is last 8 chars uppercased");

// ─── splitBatchTargets ────────────────────────────────────────────────────────

const targets = splitBatchTargets(all, ["v1", "v3", "v4"]);
ok(targets.approvable.length === 1 && targets.approvable[0]?.id === "v1", "only checked drafts are approvable");
ok(targets.postable.length === 1 && targets.postable[0]?.id === "v3", "only checked review_required are postable");

const noneChecked = splitBatchTargets(all, []);
ok(noneChecked.approvable.length === 0 && noneChecked.postable.length === 0, "nothing checked yields empty targets");

// ─── runSequentialBatch ───────────────────────────────────────────────────────

async function main() {
  const progressLog: BatchProgress[] = [];
  const results = await runSequentialBatch(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    async (item) => {
      if (item.id === "b") throw new Error("校验未通过");
      return "成功";
    },
    (progress) => progressLog.push(progress)
  );

  ok(results.length === 3, "batch returns one result per item");
  ok(results[0]?.ok === true && results[2]?.ok === true, "items around a failure still succeed");
  ok(results[1]?.ok === false, "failing item is reported as failed");
  ok(results[1]?.message === "校验未通过", "failure keeps the error message");
  ok(progressLog.length === 3, "progress fires once per item");
  ok(progressLog[2]?.done === 3 && progressLog[2]?.total === 3, "final progress is n/n");

  const empty = await runSequentialBatch([], async () => undefined);
  ok(empty.length === 0, "empty batch yields empty results");
}

await main();
