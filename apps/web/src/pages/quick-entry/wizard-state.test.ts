import {
  canEnterConfirm,
  canSubmit,
  getNextStep,
  getPrevStep,
  QUICK_ENTRY_STEPS,
  requestAdvance
} from "./wizard-state";
import type { QuickDraft } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readyDraft(): QuickDraft {
  return {
    type: "expense",
    amount: "800",
    occurredOn: "2026-07-14",
    counterparty: "",
    department: "",
    note: "请客户吃饭"
  };
}

function emptyDraft(): QuickDraft {
  return { type: "", amount: "", occurredOn: "", counterparty: "", department: "", note: "" };
}

// ── 步骤定义 ─────────────────────────────────────────────────────────────────
assert(QUICK_ENTRY_STEPS.length === 3, "expected exactly 3 steps");
assert(
  QUICK_ENTRY_STEPS.map((step) => step.key).join(",") === "describe,confirm,done",
  "expected describe → confirm → done order"
);

// ── 前进 / 回退 ──────────────────────────────────────────────────────────────
assert(getNextStep("describe") === "confirm", "expected describe → confirm");
assert(getNextStep("confirm") === "done", "expected confirm → done");
assert(getNextStep("done") === "done", "expected done to stay done");
assert(getPrevStep("confirm") === "describe", "expected confirm → describe");
assert(getPrevStep("describe") === "describe", "expected describe to stay first");
assert(getPrevStep("done") === "done", "expected done to disallow going back");

// ── 放行条件 ─────────────────────────────────────────────────────────────────
assert(canEnterConfirm({ hasText: true, hasFile: false }), "expected text to allow confirm");
assert(canEnterConfirm({ hasText: false, hasFile: true }), "expected file to allow confirm");
assert(!canEnterConfirm({ hasText: false, hasFile: false }), "expected empty input to block");
assert(canSubmit(readyDraft()), "expected ready draft to allow submit");
assert(!canSubmit(emptyDraft()), "expected empty draft to block submit");

// ── requestAdvance：按步骤套用守卫 ───────────────────────────────────────────
assert(
  requestAdvance("describe", { hasText: true, hasFile: false, draft: emptyDraft() }) === "confirm",
  "expected describe to advance with text"
);
assert(
  requestAdvance("describe", { hasText: false, hasFile: false, draft: readyDraft() }) === "describe",
  "expected describe to stay without input"
);
assert(
  requestAdvance("confirm", { hasText: true, hasFile: true, draft: readyDraft() }) === "done",
  "expected confirm to advance with ready draft"
);
assert(
  requestAdvance("confirm", { hasText: true, hasFile: true, draft: emptyDraft() }) === "confirm",
  "expected confirm to stay with incomplete draft"
);
assert(
  requestAdvance("done", { hasText: true, hasFile: true, draft: readyDraft() }) === "done",
  "expected done to be terminal"
);
