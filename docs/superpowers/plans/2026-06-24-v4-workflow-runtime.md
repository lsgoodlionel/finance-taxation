# V4 Workflow Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Introduce a shared V4 workflow runtime that standardizes business state transitions, authorization gates, idempotent command execution, retry metadata, and compensation/manual-takeover handling without breaking existing purchase, travel, contract, tax, voucher, and payroll flows.

**Architecture:** Add a small workflow runtime module in the API that sits underneath existing domain routes. The runtime will provide typed workflow states, transition validation, separation-of-duties authorization checks, command execution records with idempotency keys and retries, and compensation/manual-takeover records. Existing modules continue to own business logic, but they call the runtime to validate transitions and persist execution evidence.

**Tech Stack:** TypeScript, Node.js test runner, PostgreSQL, existing audit service, existing role/permission middleware, React/Vite for later status consumption.

---

## File Structure

### New files

- `apps/api/src/modules/workflows/runtime.ts` - core workflow state machine and transition validation.
- `apps/api/src/modules/workflows/authorization.ts` - separation-of-duties and high-risk authorization rules.
- `apps/api/src/modules/workflows/commands.ts` - idempotent command execution contract and status transitions.
- `apps/api/src/modules/workflows/persistence.ts` - read/write helpers for workflow runs, commands, retries, and compensations.
- `apps/api/src/modules/workflows/routes.ts` - runtime inspection, retry, cancel, and compensation endpoints.
- `apps/api/src/modules/workflows/runtime.test.ts` - state machine contract tests.
- `apps/api/src/modules/workflows/authorization.test.ts` - authorization and SoD tests.
- `apps/api/src/modules/workflows/commands.test.ts` - idempotency, retry, and compensation tests.
- `apps/api/src/modules/workflows/routes.test.ts` - endpoint contract tests.
- `migrations/032_workflow_runtime.sql` - workflow runtime tables and indexes.
- `docs/v4/runbooks/workflow-runtime.md` - operating notes for retry, cancel, manual takeover, and audit reading.

### Modified files

- `packages/domain-model/src/index.ts` - shared workflow state, command status, and runtime record types.
- `apps/api/src/app.ts` - register workflow runtime routes.
- `apps/api/src/middleware/auth.ts` - add workflow permissions to roles.
- `apps/api/src/modules/events/routes.ts` - adapt event status transitions to runtime checks.
- `apps/api/src/modules/tasks/routes.ts` - align task updates with runtime command logging.
- `apps/api/src/modules/tax/routes.ts` - push filing review/archive state through runtime records.
- `apps/api/src/modules/contracts/routes.ts` - route contract terminal and approval states through runtime checks.
- `docs/v4-progress-board.md` - mark current progress.

## Task 1: Define the shared runtime contract

- [ ] Add shared workflow state types covering `draft`, `collecting_documents`, `ready_for_review`, `under_review`, `awaiting_authorization`, `executing`, `completed`, `blocked`, `cancelled`, and `correcting`.
- [ ] Model transition metadata with previous state, next state, actor, basis, rule version, related materials, and occurred-at time.
- [ ] Implement a runtime helper that validates allowed transitions and returns stable error codes for invalid jumps.
- [ ] Add tests covering happy-path progression, terminal states, correction loops, and invalid transitions.

## Task 2: Add authorization and separation-of-duties checks

- [ ] Encode SoD checks for requester vs approver, accountant vs cashier, preparer vs reviewer, reviewer vs posting, and command preparation vs final authorization.
- [ ] Distinguish low-risk transitions from high-risk actions that require explicit authorizer identity.
- [ ] Return deterministic denial codes and user-readable reasons that routes can surface directly.
- [ ] Add tests proving that forbidden role combinations are blocked rather than only warned.

## Task 3: Add idempotent command runtime and persistence

- [ ] Create tables for workflow runs, transition history, command executions, retry attempts, and compensation/manual-takeover records.
- [ ] Require each command to carry an idempotency key, business object version, executor, input snapshot, timeout policy, retry policy, and optional authorizer.
- [ ] Implement command status flow `waiting -> running -> succeeded|failed|cancelled`.
- [ ] Prevent duplicate execution when the same idempotency key and object version have already succeeded.
- [ ] Add tests for first-run success, duplicate replay, retry scheduling metadata, and compensation handoff creation.

## Task 4: Expose runtime inspection and control endpoints

- [ ] Add list/detail endpoints for workflow runs and command executions.
- [ ] Add retry, cancel, and manual-takeover/compensation endpoints with permission guards.
- [ ] Ensure endpoint payloads include progress, attempt count, next retry time, last error code, initiator, and authorizer.
- [ ] Add tests for auth failures, missing records, retryability rules, and successful state changes.

## Task 5: Integrate runtime into the first business routes

- [ ] Route business-event status updates through the shared runtime transition validator.
- [ ] Record task progression, tax batch review/submit/archive, and contract closure actions through runtime records.
- [ ] Align contract approval/closure actions with runtime state names or mapped adapters without breaking existing API responses.
- [ ] Keep current route contracts stable unless a spec gap requires an explicit compatibility adapter.

## Task 6: Verification, docs, and progress update

- [ ] Run focused workflow runtime tests and affected module tests.
- [ ] Document how operators inspect failed commands, authorize high-risk actions, and take over blocked jobs.
- [ ] Update the progress board with the latest branch status and remaining follow-up items if any work is deferred.
