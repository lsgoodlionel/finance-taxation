import test from "node:test";
import assert from "node:assert/strict";
import type { TaskStatus } from "@finance-taxation/domain-model";
import { isTaskOverdue, TERMINAL_STATUSES } from "./overdue.js";

const NOW = new Date("2026-05-16T12:00:00.000Z");

test("isTaskOverdue returns false when dueAt is null", () => {
  assert.equal(
    isTaskOverdue({ dueAt: null, status: "not_started" }, NOW),
    false
  );
});

test("isTaskOverdue returns false when dueAt is in the future", () => {
  assert.equal(
    isTaskOverdue({ dueAt: "2026-12-31T00:00:00.000Z", status: "in_progress" }, NOW),
    false
  );
});

test("isTaskOverdue returns true when dueAt is past and task is active", () => {
  assert.equal(
    isTaskOverdue({ dueAt: "2026-01-01T00:00:00.000Z", status: "in_progress" }, NOW),
    true
  );
});

test("isTaskOverdue returns false for terminal statuses even if overdue", () => {
  for (const status of TERMINAL_STATUSES) {
    assert.equal(
      isTaskOverdue({ dueAt: "2026-01-01T00:00:00.000Z", status: status as TaskStatus }, NOW),
      false,
      `expected false for terminal status: ${status}`
    );
  }
});

test("isTaskOverdue returns false when dueAt equals now exactly (boundary)", () => {
  assert.equal(
    isTaskOverdue({ dueAt: NOW.toISOString(), status: "in_review" }, NOW),
    false
  );
});

test("isTaskOverdue returns true for blocked task with past due date", () => {
  assert.equal(
    isTaskOverdue({ dueAt: "2026-03-01T00:00:00.000Z", status: "blocked" }, NOW),
    true
  );
});
