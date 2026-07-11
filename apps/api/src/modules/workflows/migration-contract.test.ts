import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../../../../migrations/032_workflow_runtime.sql"),
  "utf8"
);

test("workflow runtime migration defines the required tables", () => {
  assert.match(migration, /create table if not exists workflow_runs/i);
  assert.match(migration, /create table if not exists workflow_transition_records/i);
  assert.match(migration, /create table if not exists workflow_command_executions/i);
  assert.match(migration, /create table if not exists workflow_compensation_records/i);
});

test("workflow runtime migration enforces idempotency and core indexes", () => {
  assert.match(migration, /create unique index if not exists idx_workflow_runs_company_object/i);
  assert.match(migration, /create unique index if not exists idx_workflow_commands_idempotent/i);
  assert.match(migration, /create index if not exists idx_workflow_transitions_run_time/i);
  assert.match(migration, /create index if not exists idx_workflow_compensations_run/i);
});
