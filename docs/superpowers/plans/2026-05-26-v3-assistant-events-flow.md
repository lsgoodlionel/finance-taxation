# V3 Assistant Events Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `AssistantPage` 和 `EventsPage` 重构为统一的“入口 -> 分析 -> 事项 -> 下游对象”主流程壳，减少大文件堆叠，明确下一步动作。

**Architecture:** 不改现有后端接口和业务对象模型，只重构前端页面结构。先抽出页面壳、侧栏、结果卡、上下文面板等纯前端组件，再把原有状态和操作函数迁入这些组件，最后用 URL 状态和 Drawer 壳统一页面行为。

**Tech Stack:** React, TypeScript, existing Vite app, local shared UI hooks/components, current assistant/events APIs

---

## File Map

- Create: `apps/web/src/pages/assistant/AssistantShell.tsx`
- Create: `apps/web/src/pages/assistant/AssistantHistoryPanel.tsx`
- Create: `apps/web/src/pages/assistant/AssistantStatusPanel.tsx`
- Create: `apps/web/src/pages/assistant/AssistantComposer.tsx`
- Create: `apps/web/src/pages/events/EventsShell.tsx`
- Create: `apps/web/src/pages/events/EventListPanel.tsx`
- Create: `apps/web/src/pages/events/EventCreatePanel.tsx`
- Create: `apps/web/src/pages/events/EventDetailPanel.tsx`
- Create: `apps/web/src/pages/assistant/assistant-shell.test.tsx`
- Create: `apps/web/src/pages/events/events-shell.test.tsx`
- Modify: `apps/web/src/pages/AssistantPage.tsx`
- Modify: `apps/web/src/pages/EventsPage.tsx`
- Modify: `apps/web/src/lib/entry-guidance.ts`

### Task 1: Extract assistant shell and static subcomponents

**Files:**
- Create: `apps/web/src/pages/assistant/AssistantShell.tsx`
- Create: `apps/web/src/pages/assistant/AssistantHistoryPanel.tsx`
- Create: `apps/web/src/pages/assistant/AssistantStatusPanel.tsx`
- Create: `apps/web/src/pages/assistant/AssistantComposer.tsx`
- Create: `apps/web/src/pages/assistant/assistant-shell.test.tsx`
- Modify: `apps/web/src/pages/AssistantPage.tsx`

- [x] **Step 1: Write failing shell render test**
- [x] **Step 2: Create assistant shell components with static props**
- [x] **Step 3: Replace top-level layout in `AssistantPage.tsx` with shell composition**
- [x] **Step 4: Verify assistant page still typechecks and shell test passes**
- [ ] **Step 5: Commit**

### Task 2: Extract events shell and three-panel structure

**Files:**
- Create: `apps/web/src/pages/events/EventsShell.tsx`
- Create: `apps/web/src/pages/events/EventListPanel.tsx`
- Create: `apps/web/src/pages/events/EventCreatePanel.tsx`
- Create: `apps/web/src/pages/events/EventDetailPanel.tsx`
- Create: `apps/web/src/pages/events/events-shell.test.tsx`
- Modify: `apps/web/src/pages/EventsPage.tsx`

- [x] **Step 1: Write failing events shell render test**
- [x] **Step 2: Create three-panel shell components**
- [x] **Step 3: Move list/create/detail layout markup out of `EventsPage.tsx`**
- [x] **Step 4: Keep existing behavior intact while reducing top-level page size**
- [x] **Step 5: Verify typecheck and shell test**
- [ ] **Step 6: Commit**

### Task 3: Unify assistant-to-events flow cues

**Files:**
- Modify: `apps/web/src/pages/AssistantPage.tsx`
- Modify: `apps/web/src/pages/EventsPage.tsx`
- Modify: `apps/web/src/lib/entry-guidance.ts`

- [x] **Step 1: Standardize entry/result subtitles for assistant and events**
- [x] **Step 2: Make assistant status panel explicitly show “next step” and target page**
- [x] **Step 3: Make events detail panel explicitly show downstream objects and target actions**
- [x] **Step 4: Verify typecheck and focused tests**
- [ ] **Step 5: Commit**

## Self-Review

- Spec coverage: plan covers only `AssistantPage` and `EventsPage` V3 first-stage shell refactor.
- Placeholder scan: no `TODO`/`TBD` placeholders remain.
- Type consistency: component names, file names, and target pages are aligned.

## Progress Update

- `Task 1` 已完成实现与验证，等待本分支统一提交。
- `Task 2` 已完成实现与验证，`EventsPage` 顶层布局已改为壳组件组合。
- `Task 3` 已完成第一轮主入口提示统一，等待本分支统一提交。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-v3-assistant-events-flow.md`.

Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks
2. Inline Execution - execute tasks in this session with checkpoints
