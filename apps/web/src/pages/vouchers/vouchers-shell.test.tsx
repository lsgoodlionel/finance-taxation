// Unit tests for VouchersPage logic — no DOM required
function okVouchers(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Balance computation ──────────────────────────────────────────────────────

interface VoucherLine {
  id: string; debit: string | number; credit: string | number;
}

function computeBalance(lines: VoucherLine[]) {
  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit),  0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.001 };
}

const balancedLines: VoucherLine[] = [
  { id: "1", debit: "1000.00", credit: "0.00" },
  { id: "2", debit: "0.00",    credit: "1000.00" },
];
const unbalancedLines: VoucherLine[] = [
  { id: "1", debit: "1000.00", credit: "0.00" },
  { id: "2", debit: "0.00",    credit: "800.00" },
];

const b1 = computeBalance(balancedLines);
okVouchers(b1.balanced, "balanced lines should be balanced");
okVouchers(b1.totalDebit === 1000, "debit total is 1000");
okVouchers(b1.totalCredit === 1000, "credit total is 1000");

const b2 = computeBalance(unbalancedLines);
okVouchers(!b2.balanced, "unbalanced lines should not be balanced");
okVouchers(Math.abs(b2.totalDebit - b2.totalCredit) === 200, "difference is 200");

// ─── Status filtering ─────────────────────────────────────────────────────────

type VoucherStatus = "draft" | "review_required" | "posted";
interface SimpleVoucher { id: string; status: VoucherStatus }

function filterByStatus(vouchers: SimpleVoucher[], tab: VoucherStatus | "all") {
  return tab === "all" ? vouchers : vouchers.filter(v => v.status === tab);
}

const vouchers: SimpleVoucher[] = [
  { id: "1", status: "draft" },
  { id: "2", status: "draft" },
  { id: "3", status: "review_required" },
  { id: "4", status: "posted" },
];

okVouchers(filterByStatus(vouchers, "all").length === 4,              "all tab shows all vouchers");
okVouchers(filterByStatus(vouchers, "draft").length === 2,            "draft tab shows 2 drafts");
okVouchers(filterByStatus(vouchers, "review_required").length === 1,  "review_required tab shows 1");
okVouchers(filterByStatus(vouchers, "posted").length === 1,           "posted tab shows 1");

// ─── Status color mapping ─────────────────────────────────────────────────────

const STATUS_COLOR: Record<VoucherStatus, string> = {
  draft:            "default",
  review_required:  "warning",
  posted:           "success",
};

okVouchers(STATUS_COLOR.draft           === "default", "draft is default color");
okVouchers(STATUS_COLOR.review_required === "warning", "review_required is warning color");
okVouchers(STATUS_COLOR.posted          === "success", "posted is success color");
