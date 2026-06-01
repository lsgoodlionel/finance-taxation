# V3 Risk / Audit Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `RiskPage` 与 `AuditPage` 重构为同一套 V3 工作台体系下的“风险闭环工作台 + 审计追溯台”，保留现有 API 和 drilldown 语义不变。

**Architecture:** 先用 focused tests 固定 URL 状态、drilldown 初始化和跨页承接行为，再把两页拆成轻量路由入口 + shell + 子面板结构。`RiskPage` 优先围绕“发现 -> 整改 -> 关闭 -> 复盘”重构，`AuditPage` 围绕“筛选 -> 展开 -> 定位 -> 回跳”重构，并通过 `risk-url-state.ts` / `audit-url-state.ts` 收敛页面停留状态。

**Tech Stack:** React, TypeScript, React Router, existing Vite app, current risk/audit APIs, existing drilldown helpers, existing server-rendered focused tests

---

## File Map

- Create: `apps/web/src/pages/risk/risk-workbench.test.tsx`
- Create: `apps/web/src/pages/risk/RiskPageShell.tsx`
- Create: `apps/web/src/pages/risk/RiskWorkbenchHeader.tsx`
- Create: `apps/web/src/pages/risk/RiskFindingsListPanel.tsx`
- Create: `apps/web/src/pages/risk/RiskResolutionWorkbench.tsx`
- Create: `apps/web/src/pages/risk/RiskClosureTimeline.tsx`
- Create: `apps/web/src/pages/risk/risk-url-state.ts`
- Create: `apps/web/src/pages/audit/audit-workbench.test.tsx`
- Create: `apps/web/src/pages/audit/AuditPageShell.tsx`
- Create: `apps/web/src/pages/audit/AuditWorkbenchHeader.tsx`
- Create: `apps/web/src/pages/audit/AuditFiltersBar.tsx`
- Create: `apps/web/src/pages/audit/AuditLogTablePanel.tsx`
- Create: `apps/web/src/pages/audit/AuditDetailPanel.tsx`
- Create: `apps/web/src/pages/audit/audit-url-state.ts`
- Modify: `apps/web/src/pages/RiskPage.tsx`
- Modify: `apps/web/src/pages/AuditPage.tsx`
- Modify: `apps/web/src/pages/drilldown.test.ts`
- Modify: `apps/web/src/pages/drilldown.ts`
- Modify: `apps/web/src/pages/risk-scope.ts`

### Task 1: Lock URL state and drilldown behavior with failing tests

**Files:**
- Create: `apps/web/src/pages/risk/risk-workbench.test.tsx`
- Create: `apps/web/src/pages/audit/audit-workbench.test.tsx`
- Modify: `apps/web/src/pages/drilldown.test.ts`
- Test: `apps/web/src/pages/risk/risk-workbench.test.tsx`
- Test: `apps/web/src/pages/audit/audit-workbench.test.tsx`
- Test: `apps/web/src/pages/drilldown.test.ts`

- [ ] **Step 1: Write the failing `RiskPage` shell test**

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RiskPageShell } from "./RiskPageShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(RiskPageShell, {
    header: createElement("div", null, "risk-header"),
    list: createElement("div", null, "risk-list"),
    detail: createElement("div", null, "risk-detail"),
    timeline: createElement("div", null, "risk-timeline")
  })
);

assert(html.includes("risk-header"), "expected risk shell header slot");
assert(html.includes("risk-list"), "expected risk shell list slot");
assert(html.includes("risk-detail"), "expected risk shell detail slot");
assert(html.includes("risk-timeline"), "expected risk shell timeline slot");
```

- [ ] **Step 2: Run the `RiskPage` shell test to verify it fails**

Run: `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/risk/risk-workbench.test.tsx`

Expected: FAIL with module-not-found or export-not-found for `./RiskPageShell`

- [ ] **Step 3: Write the failing `AuditPage` shell test**

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditPageShell } from "./AuditPageShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(AuditPageShell, {
    header: createElement("div", null, "audit-header"),
    filters: createElement("div", null, "audit-filters"),
    list: createElement("div", null, "audit-list"),
    detail: createElement("div", null, "audit-detail")
  })
);

assert(html.includes("audit-header"), "expected audit shell header slot");
assert(html.includes("audit-filters"), "expected audit shell filters slot");
assert(html.includes("audit-list"), "expected audit shell list slot");
assert(html.includes("audit-detail"), "expected audit shell detail slot");
```

- [ ] **Step 4: Run the `AuditPage` shell test to verify it fails**

Run: `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/audit/audit-workbench.test.tsx`

Expected: FAIL with module-not-found or export-not-found for `./AuditPageShell`

- [ ] **Step 5: Extend `drilldown.test.ts` to cover risk/audit URL-state expectations**

```ts
import {
  buildRiskClosureTargetChain,
  buildRiskDrilldownTargets,
  normalizeDrilldownState,
  resolveAuditContextFromState,
  resolveAuditLogTarget
} from "./drilldown";

const auditContext = resolveAuditContextFromState({
  riskFindingId: "risk-2",
  businessEventId: "evt-2",
  resourceType: "risk_finding",
  resourceId: "risk-2"
});
assert(auditContext?.resourceType === "risk_finding", "expected risk finding context resource type");
assert(auditContext?.resourceId === "risk-2", "expected risk finding context resource id");

const targets = buildRiskClosureTargetChain({
  findingId: "risk-2",
  event: {
    ...payrollEvent,
    id: "evt-2",
    type: "payroll"
  }
});
const riskAuditTarget = targets.find((item) => item.path === "/audit");
assert(riskAuditTarget?.state?.riskFindingId === "risk-2", "expected audit target to preserve risk finding id");
```

- [ ] **Step 6: Run `drilldown.test.ts` to verify the new assertions fail correctly**

Run: `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/drilldown.test.ts`

Expected: FAIL on the new risk/audit assertions, not on syntax errors

- [ ] **Step 7: Commit the red tests**

```bash
git add apps/web/src/pages/risk/risk-workbench.test.tsx apps/web/src/pages/audit/audit-workbench.test.tsx apps/web/src/pages/drilldown.test.ts
git commit -m "test: define v3 risk audit workbench behavior"
```

### Task 2: Build the V3 Risk workbench shell and route-state helpers

**Files:**
- Create: `apps/web/src/pages/risk/RiskPageShell.tsx`
- Create: `apps/web/src/pages/risk/RiskWorkbenchHeader.tsx`
- Create: `apps/web/src/pages/risk/RiskFindingsListPanel.tsx`
- Create: `apps/web/src/pages/risk/RiskResolutionWorkbench.tsx`
- Create: `apps/web/src/pages/risk/RiskClosureTimeline.tsx`
- Create: `apps/web/src/pages/risk/risk-url-state.ts`
- Modify: `apps/web/src/pages/RiskPage.tsx`
- Modify: `apps/web/src/pages/risk-scope.ts`
- Test: `apps/web/src/pages/risk/risk-workbench.test.tsx`

- [ ] **Step 1: Implement the minimal `RiskPageShell` to satisfy the shell test**

```tsx
import React, { type ReactNode } from "react";

type RiskPageShellProps = {
  header: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  timeline: ReactNode;
};

export function RiskPageShell({ header, list, detail, timeline }: RiskPageShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(360px, 0.95fr)", gap: "24px", alignItems: "start" }}>
        {list}
        <div style={{ display: "grid", gap: "24px" }}>
          {detail}
          {timeline}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the `RiskPage` shell test to verify it passes**

Run: `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/risk/risk-workbench.test.tsx`

Expected: PASS with no output other than process exit 0

- [ ] **Step 3: Add `risk-url-state.ts` for query-param parsing and serialization**

```ts
import type { RiskScopeFilter } from "../risk-scope";

export type RiskViewFilter = "open" | "closed" | "all";

export type RiskUrlState = {
  scope: RiskScopeFilter;
  eventId: string;
  findingId: string;
  view: RiskViewFilter;
};

export function readRiskUrlState(searchParams: URLSearchParams): RiskUrlState {
  const scopeParam = searchParams.get("scope");
  const viewParam = searchParams.get("view");
  return {
    scope: scopeParam === "contract" || scopeParam === "payroll" ? scopeParam : "all",
    eventId: searchParams.get("event") ?? "",
    findingId: searchParams.get("finding") ?? "",
    view: viewParam === "open" || viewParam === "closed" ? viewParam : "all"
  };
}

export function writeRiskUrlState(state: RiskUrlState) {
  const next = new URLSearchParams();
  if (state.scope !== "all") next.set("scope", state.scope);
  if (state.eventId) next.set("event", state.eventId);
  if (state.findingId) next.set("finding", state.findingId);
  if (state.view !== "all") next.set("view", state.view);
  return next;
}
```

- [ ] **Step 4: Refactor `RiskPage.tsx` into shell + panels while preserving API behavior**

```tsx
export function RiskPage() {
  return (
    <RiskPageShell
      header={
        <RiskWorkbenchHeader
          message={message}
          scopeFilter={scopeFilter}
          totalFindings={visibleFindings.length}
          selectedFinding={selectedFinding}
          onShowHelp={() => setShowHelp(true)}
          navState={navState}
        />
      }
      list={
        <RiskFindingsListPanel
          findings={visibleFindings}
          eventMap={eventMap}
          scopeFilter={scopeFilter}
          selectedFindingId={selectedFindingId}
          onScopeChange={setScopeFilter}
          onSelectFinding={(findingId) => void loadClosureRecords(findingId)}
        />
      }
      detail={
        <RiskResolutionWorkbench
          finding={selectedFinding}
          event={selectedFindingEvent}
          closureTargets={closureTargets}
          resolution={resolution}
          onResolutionChange={setResolution}
          onNavigate={navigate}
        />
      }
      timeline={<RiskClosureTimeline records={closureRecords} />}
    />
  );
}
```

- [ ] **Step 5: Update `risk-scope.ts` only as needed to support the new view/filter split**

```ts
export function filterRiskFindingsByView(findings: RiskFinding[], view: "open" | "closed" | "all") {
  if (view === "all") {
    return findings;
  }
  return findings.filter((finding) => {
    const isClosed = finding.status === "closed";
    return view === "closed" ? isClosed : !isClosed;
  });
}
```

- [ ] **Step 6: Run targeted verification for the Risk workbench**

Run:
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/risk/risk-workbench.test.tsx`
- `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`

Expected:
- shell test PASS
- typecheck exit 0

- [ ] **Step 7: Commit the Risk workbench extraction**

```bash
git add apps/web/src/pages/RiskPage.tsx apps/web/src/pages/risk/RiskPageShell.tsx apps/web/src/pages/risk/RiskWorkbenchHeader.tsx apps/web/src/pages/risk/RiskFindingsListPanel.tsx apps/web/src/pages/risk/RiskResolutionWorkbench.tsx apps/web/src/pages/risk/RiskClosureTimeline.tsx apps/web/src/pages/risk/risk-url-state.ts apps/web/src/pages/risk-scope.ts
git commit -m "refactor: build v3 risk workbench shell"
```

### Task 3: Build the V3 Audit workbench shell and query-param flow

**Files:**
- Create: `apps/web/src/pages/audit/AuditPageShell.tsx`
- Create: `apps/web/src/pages/audit/AuditWorkbenchHeader.tsx`
- Create: `apps/web/src/pages/audit/AuditFiltersBar.tsx`
- Create: `apps/web/src/pages/audit/AuditLogTablePanel.tsx`
- Create: `apps/web/src/pages/audit/AuditDetailPanel.tsx`
- Create: `apps/web/src/pages/audit/audit-url-state.ts`
- Modify: `apps/web/src/pages/AuditPage.tsx`
- Modify: `apps/web/src/pages/drilldown.ts`
- Test: `apps/web/src/pages/audit/audit-workbench.test.tsx`

- [ ] **Step 1: Implement the minimal `AuditPageShell` to satisfy the shell test**

```tsx
import React, { type ReactNode } from "react";

type AuditPageShellProps = {
  header: ReactNode;
  filters: ReactNode;
  list: ReactNode;
  detail: ReactNode;
};

export function AuditPageShell({ header, filters, list, detail }: AuditPageShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      {filters}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: "24px", alignItems: "start" }}>
        {list}
        {detail}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the `AuditPage` shell test to verify it passes**

Run: `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/audit/audit-workbench.test.tsx`

Expected: PASS with exit 0

- [ ] **Step 3: Add `audit-url-state.ts` for restoring filters, offset, and selected log**

```ts
export type AuditUrlState = {
  resourceType: string;
  resourceId: string;
  from: string;
  to: string;
  offset: number;
  logId: string;
  expandedId: string;
};

export function readAuditUrlState(searchParams: URLSearchParams): AuditUrlState {
  return {
    resourceType: searchParams.get("resourceType") ?? "",
    resourceId: searchParams.get("resourceId") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    offset: Number(searchParams.get("offset") ?? "0") || 0,
    logId: searchParams.get("log") ?? "",
    expandedId: searchParams.get("expanded") ?? ""
  };
}
```

- [ ] **Step 4: Refactor `AuditPage.tsx` into shell + panels with restored query state**

```tsx
export function AuditPage() {
  return (
    <AuditPageShell
      header={
        <AuditWorkbenchHeader
          total={total}
          message={message}
          navAuditContext={navAuditContext}
          onNavigate={navigate}
        />
      }
      filters={
        <AuditFiltersBar
          resourceType={resourceType}
          resourceId={resourceId}
          fromDate={fromDate}
          toDate={toDate}
          onResourceTypeChange={setResourceType}
          onResourceIdChange={setResourceId}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onSearch={handleSearch}
        />
      }
      list={
        <AuditLogTablePanel
          logs={logs}
          loading={loading}
          expandedId={expandedId}
          onToggleExpanded={setExpandedId}
          onNavigate={navigate}
        />
      }
      detail={<AuditDetailPanel log={logs.find((item) => item.id === expandedId) ?? null} />}
    />
  );
}
```

- [ ] **Step 5: Extend `drilldown.ts` only where required to carry risk context into audit query state**

```ts
export function resolveAuditContextFromState(state: DrilldownState | null) {
  if (!state) {
    return null;
  }
  if (state.resourceType && state.resourceId) {
    return { resourceType: state.resourceType, resourceId: state.resourceId };
  }
  if (state.riskFindingId) {
    return { resourceType: "risk_finding", resourceId: state.riskFindingId };
  }
  if (state.taxItemId) {
    return { resourceType: "tax_item", resourceId: state.taxItemId };
  }
  return null;
}
```

- [ ] **Step 6: Run targeted verification for the Audit workbench**

Run:
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/audit/audit-workbench.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/drilldown.test.ts`
- `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`

Expected:
- audit shell test PASS
- drilldown test PASS
- typecheck exit 0

- [ ] **Step 7: Commit the Audit workbench extraction**

```bash
git add apps/web/src/pages/AuditPage.tsx apps/web/src/pages/audit/AuditPageShell.tsx apps/web/src/pages/audit/AuditWorkbenchHeader.tsx apps/web/src/pages/audit/AuditFiltersBar.tsx apps/web/src/pages/audit/AuditLogTablePanel.tsx apps/web/src/pages/audit/AuditDetailPanel.tsx apps/web/src/pages/audit/audit-url-state.ts apps/web/src/pages/drilldown.ts
git commit -m "refactor: build v3 audit workbench shell"
```

### Task 4: Wire cross-page handoff, finish regression coverage, and verify the branch

**Files:**
- Modify: `apps/web/src/pages/RiskPage.tsx`
- Modify: `apps/web/src/pages/AuditPage.tsx`
- Modify: `apps/web/src/pages/drilldown.ts`
- Modify: `apps/web/src/pages/drilldown.test.ts`
- Test: `apps/web/src/pages/risk/risk-workbench.test.tsx`
- Test: `apps/web/src/pages/audit/audit-workbench.test.tsx`
- Test: `apps/web/src/pages/drilldown.test.ts`

- [ ] **Step 1: Add final cross-page assertions for risk-to-audit and audit-back-to-source navigation**

```ts
const auditTarget = buildRiskClosureTargetChain({
  findingId: "risk-9",
  event: {
    ...payrollEvent,
    id: "evt-risk-9",
    type: "payroll"
  }
}).find((item) => item.path === "/audit");

assert(auditTarget?.state?.riskFindingId === "risk-9", "expected risk finding id on audit target");
assert(auditTarget?.state?.businessEventId === "evt-risk-9", "expected business event id on audit target");

const sourceTarget = resolveAuditLogTarget({
  ...payrollLog,
  resourceType: "risk_finding",
  resourceId: "risk-9",
  resourceLabel: "风险 9"
});
assert(sourceTarget?.path === "/risk", "expected risk audit log to resolve back to risk page");
```

- [ ] **Step 2: Run `drilldown.test.ts` to verify the new assertions fail before the final implementation**

Run: `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/drilldown.test.ts`

Expected: FAIL on the new cross-page navigation assertions

- [ ] **Step 3: Implement the minimal final handoff logic in `drilldown.ts`, `RiskPage.tsx`, and `AuditPage.tsx`**

```ts
if (log.resourceType === "risk_finding") {
  return {
    path: "/risk",
    state: {
      riskFindingId: log.resourceId,
      resourceType: "risk_finding",
      resourceId: log.resourceId
    }
  };
}
```

```tsx
const auditSearch = writeAuditUrlState({
  resourceType: "risk_finding",
  resourceId: selectedFinding.id,
  from: "",
  to: "",
  offset: 0,
  logId: "",
  expandedId: ""
});
navigate({ pathname: "/audit", search: `?${auditSearch.toString()}` }, { state: auditState });
```

- [ ] **Step 4: Run complete verification for this branch**

Run:
- `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/risk/risk-workbench.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/audit/audit-workbench.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/drilldown.test.ts`
- `node --check src/scripts/app.js`
- `find backend/src -name '*.js' -print0 | xargs -0 -n1 node --check`
- `node tools/check-json.mjs backend/data`
- `node tools/check-progress-board.mjs docs/v2-progress-board.md`

Expected:
- typecheck exit 0
- all focused tests PASS
- all `node --check` commands exit 0
- JSON/progress-board checks exit 0

- [ ] **Step 5: Commit the final handoff and verification pass**

```bash
git add apps/web/src/pages/RiskPage.tsx apps/web/src/pages/AuditPage.tsx apps/web/src/pages/drilldown.ts apps/web/src/pages/drilldown.test.ts
git commit -m "refactor: finish v3 risk audit workbench handoff"
```
