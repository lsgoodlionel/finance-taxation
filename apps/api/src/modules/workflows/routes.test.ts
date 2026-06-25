import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKFLOW_COMMAND_CANCEL_PATH,
  WORKFLOW_COMMAND_COMPENSATIONS_PATH,
  WORKFLOW_COMMAND_DETAIL_PATH,
  WORKFLOW_COMMAND_RETRY_PATH,
  WORKFLOW_RUN_DETAIL_PATH,
  normalizeWorkflowFilters
} from "./routes.js";

test("normalizeWorkflowFilters reads supported query params", () => {
  const url = new URL("http://127.0.0.1/api/workflows/commands?resourceType=task&resourceId=t-1&status=failed&workflowRunId=run-1&state=blocked");
  const filters = normalizeWorkflowFilters(url);
  assert.equal(filters.resourceType, "task");
  assert.equal(filters.resourceId, "t-1");
  assert.equal(filters.status, "failed");
  assert.equal(filters.workflowRunId, "run-1");
  assert.equal(filters.state, "blocked");
});

test("normalizeWorkflowFilters leaves unrelated params empty", () => {
  const url = new URL("http://127.0.0.1/api/workflows/runs?page=1");
  const filters = normalizeWorkflowFilters(url);
  assert.equal(filters.resourceType, null);
  assert.equal(filters.resourceId, null);
  assert.equal(filters.state, null);
  assert.equal(filters.workflowRunId, null);
  assert.equal(filters.status, null);
});

test("workflow route patterns match stable path contracts", () => {
  assert.equal("/api/workflows/runs/run-1".match(WORKFLOW_RUN_DETAIL_PATH)?.[1], "run-1");
  assert.equal("/api/workflows/commands/cmd-1".match(WORKFLOW_COMMAND_DETAIL_PATH)?.[1], "cmd-1");
  assert.equal("/api/workflows/commands/cmd-1/retry".match(WORKFLOW_COMMAND_RETRY_PATH)?.[1], "cmd-1");
  assert.equal("/api/workflows/commands/cmd-1/cancel".match(WORKFLOW_COMMAND_CANCEL_PATH)?.[1], "cmd-1");
  assert.equal("/api/workflows/commands/cmd-1/compensations".match(WORKFLOW_COMMAND_COMPENSATIONS_PATH)?.[1], "cmd-1");
});

test("workflow control route patterns reject invalid path variants", () => {
  assert.equal(WORKFLOW_RUN_DETAIL_PATH.test("/api/workflows/runs"), false);
  assert.equal(WORKFLOW_COMMAND_DETAIL_PATH.test("/api/workflows/commands/cmd-1/retry"), false);
  assert.equal(WORKFLOW_COMMAND_RETRY_PATH.test("/api/workflows/commands/cmd-1/retry/extra"), false);
  assert.equal(WORKFLOW_COMMAND_CANCEL_PATH.test("/api/workflows/commands/cmd-1/cancelled"), false);
  assert.equal(WORKFLOW_COMMAND_COMPENSATIONS_PATH.test("/api/workflows/commands/cmd-1/compensation"), false);
});
