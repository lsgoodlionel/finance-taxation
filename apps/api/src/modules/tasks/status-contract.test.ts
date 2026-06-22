import test from "node:test";
import assert from "node:assert/strict";
import { VALID_TASK_STATUSES } from "./routes.js";

test("task status contract matches the V4 workflow", () => {
  assert.equal(VALID_TASK_STATUSES.has("done"), true);
  assert.equal(VALID_TASK_STATUSES.has("completed"), false);
  assert.equal(VALID_TASK_STATUSES.has("in_review"), true);
});
