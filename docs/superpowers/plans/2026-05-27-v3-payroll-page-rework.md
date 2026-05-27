# V3 Payroll Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `PayrollPage` 从“员工 + 工资计算 + 参数设置”三域混写的大页面，重构为清晰的 V3 工资工作台。

**Architecture:** 不改后端接口和现有工资业务逻辑，先重构前端结构。优先抽出壳组件、Header、TabBar，再逐步把员工管理、工资运行、税务复核和参数设置拆入子组件，保留当前工资事项、税务复核、凭证建议和风险联动能力。

**Tech Stack:** React, TypeScript, existing Vite app, current payroll/tax/risk APIs, local V3 shared UI components

## File Map

- Create: `apps/web/src/pages/payroll/PayrollShell.tsx`
- Create: `apps/web/src/pages/payroll/PayrollHeader.tsx`
- Create: `apps/web/src/pages/payroll/PayrollTabBar.tsx`
- Create: `apps/web/src/pages/payroll/payroll-shell.test.tsx`
- Modify: `apps/web/src/pages/PayrollPage.tsx`

### Task 1: Extract payroll page shell

- [x] Create shell render test
- [x] Add shell/header/tab bar components
- [x] Move top-level layout out of `PayrollPage.tsx`
- [x] Keep behavior intact and pass typecheck
- [x] Commit

### Task 2: Split employees / payroll / policy sections

- [x] Extract employees section container
- [x] Extract payroll section container
- [x] Extract policy section container
- [x] Keep existing actions and drilldown behavior intact
- [x] Verify typecheck and focused tests
- [x] Commit

### Task 3: Prioritize workflow summary and next-step cues

- [x] Make payroll section show workflow summary before tables
- [x] Normalize payroll entry/result guidance
- [x] Verify typecheck and focused tests
- [x] Commit

## Progress Update

- `Task 1` 已完成实现与验证，等待本分支提交。
- `Task 2` 已完成 employees / payroll / policy 三段容器拆分，现有工资计算、税务复核、风险联动和 drilldown 行为保持不变。
- `Task 3` 已完成第一轮工资工作流摘要前置展示，并已通过 focused test 与前端 typecheck。
