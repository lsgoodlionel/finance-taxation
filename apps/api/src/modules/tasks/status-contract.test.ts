import test from "node:test";
import assert from "node:assert/strict";
import { VALID_TASK_STATUSES } from "./routes.js";

test("task status contract matches the V4 workflow", () => {
  assert.deepEqual([...VALID_TASK_STATUSES], [
    "not_started",
    "in_progress",
    "in_review",
    "done",
    "blocked",
    "cancelled"
  ]);
});
