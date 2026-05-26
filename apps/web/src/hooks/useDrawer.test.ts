import { createDrawerState } from "./useDrawer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const state = createDrawerState<string>();
assert(!state.isOpen, "expected drawer to start closed");
assert(state.value === null, "expected empty initial value");

state.open("doc-1");
assert(Boolean(state.isOpen), "expected drawer to open");
assert(state.value === "doc-1", "expected drawer value");

state.close();
assert(!state.isOpen, "expected drawer to close");
assert(state.value === null, "expected cleared value");
