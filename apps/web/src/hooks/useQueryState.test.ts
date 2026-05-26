import { applyQueryState } from "./useQueryState";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(applyQueryState("?tab=reports", "tab", "tax") === "tab=tax", "expected query overwrite");
assert(applyQueryState("?tab=reports&scene=monthly", "tab", "") === "scene=monthly", "expected query removal");
assert(applyQueryState("", "tab", "reports") === "tab=reports", "expected query insertion");
