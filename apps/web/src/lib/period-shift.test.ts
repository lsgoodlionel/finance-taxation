import { shiftPeriod } from "./period-shift";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 同年内步进 ──────────────────────────────────────────────────────────────
assert(shiftPeriod("2026-07", 1) === "2026-08", "expected next month within year");
assert(shiftPeriod("2026-07", -1) === "2026-06", "expected previous month within year");
assert(shiftPeriod("2026-07", 0) === "2026-07", "expected zero delta to keep period");

// ── 跨年进位 / 借位 ─────────────────────────────────────────────────────────
assert(shiftPeriod("2026-12", 1) === "2027-01", "expected december to roll into next year");
assert(shiftPeriod("2026-01", -1) === "2025-12", "expected january to roll back a year");
assert(shiftPeriod("2026-01", -13) === "2024-12", "expected multi-year negative shift");
assert(shiftPeriod("2026-11", 14) === "2028-01", "expected multi-year positive shift");

// ── 非法输入原样返回 ────────────────────────────────────────────────────────
assert(shiftPeriod("abc", 1) === "abc", "expected malformed string returned as-is");
assert(shiftPeriod("2026-13", 1) === "2026-13", "expected out-of-range month returned as-is");
assert(shiftPeriod("2026-00", -1) === "2026-00", "expected month 00 returned as-is");
assert(shiftPeriod("2026-7", 1) === "2026-7", "expected non-zero-padded month returned as-is");
assert(shiftPeriod("", 1) === "", "expected empty string returned as-is");
assert(shiftPeriod("2026-07", 1.5) === "2026-07", "expected non-integer delta returned as-is");
