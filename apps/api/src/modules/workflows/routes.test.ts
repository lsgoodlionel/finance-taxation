import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkflowFilters
} from "./routes.js";

test("normalizeWorkflowFilters reads supported query params", () => {
  const url = new URL("http://127.0.0.1/api/workflows/commands?resourceType=task&resourceId=t-1&status=failed&workflowRunId=run-1");
  const filters = normalizeWorkflowFilters(url);
  assert.equal(filters.resourceType, "task");
  assert.equal(filters.resourceId, "t-1");
  assert.equal(filters.status, "failed");
  assert.equal(filters.workflowRunId, "run-1");
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
