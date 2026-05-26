# V3 Contracts Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `ContractsPage` 从“单文件堆叠的列表 + 详情 + 履约链”重构为更清晰的 V3 合同履约工作台。

**Architecture:** 不改后端接口和合同履约业务逻辑，先重构前端页面结构。优先抽出壳组件、筛选条、列表面板和详情工作台，再逐步把表单和履约动作下沉到子组件。

**Tech Stack:** React, TypeScript, existing Vite app, current contracts APIs and contract workflow helpers

## File Map

- Create: `apps/web/src/pages/contracts/ContractsShell.tsx`
- Create: `apps/web/src/pages/contracts/ContractsHeader.tsx`
- Create: `apps/web/src/pages/contracts/ContractsFiltersBar.tsx`
- Create: `apps/web/src/pages/contracts/contracts-shell.test.tsx`
- Modify: `apps/web/src/pages/ContractsPage.tsx`

### Task 1: Extract contracts page shell

- [x] Create shell render test
- [x] Add shell/header/filter bar components
- [x] Move top-level layout out of `ContractsPage.tsx`
- [x] Keep behavior intact and pass typecheck
- [x] Commit

### Task 2: Split contract list and detail workbench

- [x] Extract list panel
- [x] Extract detail workbench container
- [ ] Keep existing actions and drilldown behavior intact
- [ ] Verify typecheck and focused tests
- [ ] Commit

### Task 3: Normalize V3 entry/result guidance for contracts

- [x] Add V3 header/subtitle and next-step cues
- [x] Make detail view show workflow summary first
- [ ] Verify typecheck and focused tests
- [ ] Commit

## Progress Update

- `Task 1` 已完成并提交。
- `Task 2` 已完成列表面板和详情工作台壳拆分，下一步继续下沉内部块和动作区。
- `Task 3` 已完成第一轮合同页 V3 摘要优先展示。
