# V3 Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 V3 第一阶段可复用的设计系统底座，包括主题、样式 token、通用 UI 组件和页面状态管理 Hook，为后续 `Assistant / Events / Contracts / Payroll / PdfExport` 重构提供统一骨架。

**Architecture:** 保持现有业务接口和对象模型不变，只在 `apps/web` 内增加设计层与页面骨架层。优先抽离跨页面共享能力，避免在具体业务页里继续扩散内联样式、重复 Drawer 状态和重复 URL 状态逻辑。

**Tech Stack:** React, TypeScript, existing Vite app, CSS variables, local shared hooks/components

---

## File Map

- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/hooks/useDrawer.ts`
- Create: `apps/web/src/hooks/useQueryState.ts`
- Create: `apps/web/src/hooks/useAsyncAction.ts`
- Create: `apps/web/src/components/ui/PageHeader.tsx`
- Create: `apps/web/src/components/ui/EntityDrawer.tsx`
- Create: `apps/web/src/components/ui/EmptyState.tsx`
- Create: `apps/web/src/components/ui/StepWizard.tsx`
- Create: `apps/web/src/components/ui/ResultBanner.tsx`
- Create: `apps/web/src/components/ui/DataTableShell.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/AssistantPage.tsx`
- Modify: `apps/web/src/pages/EventsPage.tsx`
- Modify: `apps/web/src/pages/PdfExportPage.tsx`
- Test: `apps/web/src/hooks/useDrawer.test.ts`
- Test: `apps/web/src/hooks/useQueryState.test.ts`
- Test: `apps/web/src/components/ui/PageHeader.test.tsx`
- Test: `apps/web/src/components/ui/EntityDrawer.test.tsx`
- Test: `apps/web/src/components/ui/ResultBanner.test.tsx`

### Task 1: Add V3 style tokens and global layout primitives

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Write the failing smoke expectation by importing styles in main**

Expected initial failure mode: imports missing.

- [ ] **Step 2: Create `apps/web/src/styles/tokens.css`**

```css
:root {
  --v3-color-primary: #4f8ef7;
  --v3-color-success: #10b981;
  --v3-color-warning: #f59e0b;
  --v3-color-danger: #dc2626;
  --v3-color-text: #1a2332;
  --v3-color-text-muted: #6b7a8d;
  --v3-color-border: #e5e9f0;
  --v3-color-bg: #f4f6fa;
  --v3-color-surface: #ffffff;
  --v3-space-xs: 4px;
  --v3-space-sm: 8px;
  --v3-space-md: 16px;
  --v3-space-lg: 24px;
  --v3-space-xl: 32px;
  --v3-radius-sm: 4px;
  --v3-radius-md: 8px;
  --v3-radius-lg: 12px;
  --v3-shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.08);
  --v3-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.1);
}
```

- [ ] **Step 3: Create `apps/web/src/styles/global.css`**

```css
html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--v3-color-bg);
  color: var(--v3-color-text);
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 4: Import styles in `apps/web/src/main.tsx`**

```tsx
import "./styles/tokens.css";
import "./styles/global.css";
```

- [ ] **Step 5: Verify app typecheck still passes**

Run: `npm run typecheck:v2`  
Expected: pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles/tokens.css apps/web/src/styles/global.css apps/web/src/main.tsx
git commit -m "Add V3 style tokens and global styles"
```

### Task 2: Add shared page-state hooks

**Files:**
- Create: `apps/web/src/hooks/useDrawer.ts`
- Create: `apps/web/src/hooks/useQueryState.ts`
- Create: `apps/web/src/hooks/useAsyncAction.ts`
- Test: `apps/web/src/hooks/useDrawer.test.ts`
- Test: `apps/web/src/hooks/useQueryState.test.ts`

- [ ] **Step 1: Write `useDrawer` test**

```ts
import { strict as assert } from "node:assert";
import { createDrawerState } from "./useDrawer";

const state = createDrawerState<string>();
state.open("doc-1");
assert.equal(state.isOpen, true);
assert.equal(state.value, "doc-1");
state.close();
assert.equal(state.isOpen, false);
assert.equal(state.value, null);
```

- [ ] **Step 2: Implement `apps/web/src/hooks/useDrawer.ts`**

```ts
import { useState } from "react";

export function createDrawerState<T>() {
  return {
    isOpen: false,
    value: null as T | null,
    open(value: T) {
      this.isOpen = true;
      this.value = value;
    },
    close() {
      this.isOpen = false;
      this.value = null;
    },
  };
}

export function useDrawer<T>() {
  const [value, setValue] = useState<T | null>(null);
  return {
    isOpen: value !== null,
    value,
    open(next: T) {
      setValue(next);
    },
    close() {
      setValue(null);
    },
  };
}
```

- [ ] **Step 3: Implement `apps/web/src/hooks/useQueryState.ts`**

```ts
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export function useQueryState(key: string, fallback = "") {
  const [params, setParams] = useSearchParams();
  const value = useMemo(() => params.get(key) ?? fallback, [fallback, key, params]);

  function setValue(next: string) {
    const nextParams = new URLSearchParams(params);
    if (next) {
      nextParams.set(key, next);
    } else {
      nextParams.delete(key);
    }
    setParams(nextParams);
  }

  return [value, setValue] as const;
}
```

- [ ] **Step 4: Implement `apps/web/src/hooks/useAsyncAction.ts`**

```ts
import { useState } from "react";

export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(action: () => Promise<T>) {
    setIsLoading(true);
    setError(null);
    try {
      return await action();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      setError(message);
      throw caught;
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, error, run };
}
```

- [ ] **Step 5: Run targeted tests**

Run:
- `node --import tsx apps/web/src/hooks/useDrawer.test.ts`
- `node --import tsx apps/web/src/hooks/useQueryState.test.ts`

Expected: pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useDrawer.ts apps/web/src/hooks/useQueryState.ts apps/web/src/hooks/useAsyncAction.ts apps/web/src/hooks/useDrawer.test.ts apps/web/src/hooks/useQueryState.test.ts
git commit -m "Add shared V3 page state hooks"
```

### Task 3: Add shared UI primitives

**Files:**
- Create: `apps/web/src/components/ui/PageHeader.tsx`
- Create: `apps/web/src/components/ui/EntityDrawer.tsx`
- Create: `apps/web/src/components/ui/EmptyState.tsx`
- Create: `apps/web/src/components/ui/StepWizard.tsx`
- Create: `apps/web/src/components/ui/ResultBanner.tsx`
- Create: `apps/web/src/components/ui/DataTableShell.tsx`
- Test: `apps/web/src/components/ui/PageHeader.test.tsx`
- Test: `apps/web/src/components/ui/EntityDrawer.test.tsx`
- Test: `apps/web/src/components/ui/ResultBanner.test.tsx`

- [ ] **Step 1: Add minimal test for `PageHeader` title rendering**

```tsx
import { strict as assert } from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "./PageHeader";

const html = renderToStaticMarkup(<PageHeader title="经营事项总线" />);
assert.ok(html.includes("经营事项总线"));
```

- [ ] **Step 2: Implement `PageHeader`**

```tsx
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="v3-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}
```

- [ ] **Step 3: Implement remaining UI primitives with simple, typed wrappers**

Implementation requirements:
- `EntityDrawer`: uniform shell with title/body/footer slots
- `EmptyState`: title + description + optional action
- `StepWizard`: steps array + current index + content slot
- `ResultBanner`: tone (`info|success|warning|error`) + message
- `DataTableShell`: section shell around existing tables

- [ ] **Step 4: Run component tests**

Run:
- `node --import tsx apps/web/src/components/ui/PageHeader.test.tsx`
- `node --import tsx apps/web/src/components/ui/EntityDrawer.test.tsx`
- `node --import tsx apps/web/src/components/ui/ResultBanner.test.tsx`

Expected: pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "Add V3 shared UI primitives"
```

### Task 4: Apply primitives to three representative pages

**Files:**
- Modify: `apps/web/src/pages/AssistantPage.tsx`
- Modify: `apps/web/src/pages/EventsPage.tsx`
- Modify: `apps/web/src/pages/PdfExportPage.tsx`

- [ ] **Step 1: Replace repeated page header blocks with `PageHeader`**

Targets:
- `AssistantPage`
- `EventsPage`
- `PdfExportPage`

- [ ] **Step 2: Replace local banners/messages with `ResultBanner` where possible**

Targets:
- assistant context notices
- events status guidance
- export result guidance

- [ ] **Step 3: Introduce `useDrawer` / `useQueryState` in one concrete place per page**

Targets:
- `EventsPage`: selected event id
- `PdfExportPage`: active scene or tab
- `AssistantPage`: active session or right-panel selection

- [ ] **Step 4: Run full verification**

Run:
- `npm run typecheck:v2`
- `npm run verify`

Expected: pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/AssistantPage.tsx apps/web/src/pages/EventsPage.tsx apps/web/src/pages/PdfExportPage.tsx
git commit -m "Apply V3 foundation primitives to core entry pages"
```

## Self-Review

- Spec coverage: this plan covers V3 Phase 0 foundation only, not later business-page redesign tasks.
- Placeholder scan: no `TODO`/`TBD` placeholders remain.
- Type consistency: all planned hooks and components are named consistently across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-v3-design-system-foundation.md`.

Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks
2. Inline Execution - execute tasks in this session with checkpoints
