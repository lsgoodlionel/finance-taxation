# Reports Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the reports page as a V3 two-column workbench without changing report APIs or business outcomes.

**Architecture:** Keep `ReportsPage.tsx` as a thin route entry and move layout, state, and rendering into focused files under `apps/web/src/pages/reports/`. Use a shell + sidebar + workbench split, with pure helpers for repeatable state-derived labels and package periods.

**Tech Stack:** React, TypeScript, existing V3 shared UI primitives, static shell tests executed with `node --import tsx`, TypeScript project check.

---

### Task 1: Add failing tests for the reports shell and helpers

**Files:**
- Create: `apps/web/src/pages/reports/reports-shell.test.tsx`
- Create: `apps/web/src/pages/reports/reports-helpers.test.ts`
- Test: `apps/web/src/pages/reports/reports-shell.test.tsx`
- Test: `apps/web/src/pages/reports/reports-helpers.test.ts`

- [ ] **Step 1: Write the failing shell test**

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportsShell } from "./ReportsShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const html = renderToStaticMarkup(
  createElement(ReportsShell, {
    header: createElement("div", null, "header"),
    sidebar: createElement("div", null, "sidebar"),
    workbench: createElement("div", null, "workbench"),
  })
);

assert(html.includes("header"), "expected reports shell header slot");
assert(html.includes("sidebar"), "expected reports shell sidebar slot");
assert(html.includes("workbench"), "expected reports shell workbench slot");
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run: `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/reports/reports-shell.test.tsx`
Expected: FAIL because `./ReportsShell` does not exist yet.

- [ ] **Step 3: Write the failing helpers test**

```ts
import { defaultReportsView, formatSnapshotLabel, resolveBundlePeriodLabel } from "./reports-helpers";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(defaultReportsView, "balanceSheet", "expected default workbench view");
assertEqual(
  formatSnapshotLabel({ reportType: "profit_statement", periodLabel: "2026-05" }),
  "2026-05 利润表",
  "expected snapshot label"
);
assertEqual(
  resolveBundlePeriodLabel("audit", { year: 2026, month: 5, quarter: 2 }, "2026-05"),
  "2026-05",
  "expected audit bundle to prefer loaded period label"
);
```

- [ ] **Step 4: Run the helpers test to verify it fails**

Run: `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/reports/reports-helpers.test.ts`
Expected: FAIL because `./reports-helpers` does not exist yet.

### Task 2: Create the reports shell and helper utilities

**Files:**
- Create: `apps/web/src/pages/reports/ReportsShell.tsx`
- Create: `apps/web/src/pages/reports/reports-helpers.ts`
- Test: `apps/web/src/pages/reports/reports-shell.test.tsx`
- Test: `apps/web/src/pages/reports/reports-helpers.test.ts`

- [ ] **Step 1: Write the minimal shell implementation**

```tsx
import React, { type ReactNode } from "react";

type ReportsShellProps = {
  header: ReactNode;
  sidebar: ReactNode;
  workbench: ReactNode;
};

export function ReportsShell({ header, sidebar, workbench }: ReportsShellProps) {
  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {header}
      <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: "24px", alignItems: "start" }}>
        {sidebar}
        {workbench}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the minimal helpers implementation**

```ts
export const defaultReportsView = "balanceSheet" as const;

const REPORT_TYPE_LABELS = {
  balance_sheet: "资产负债表",
  profit_statement: "利润表",
  cash_flow: "现金流量表",
} as const;

export function formatSnapshotLabel(input: { reportType: keyof typeof REPORT_TYPE_LABELS; periodLabel: string }) {
  return `${input.periodLabel} ${REPORT_TYPE_LABELS[input.reportType]}`;
}

export function resolveBundlePeriodLabel(
  kind: "month_end" | "audit" | "inspection",
  period: { year: number; month: number; quarter: number },
  reportPeriodLabel?: string
) {
  if (reportPeriodLabel) return reportPeriodLabel;
  if (kind === "month_end") return `${period.year}-${String(period.month).padStart(2, "0")}`;
  if (kind === "audit") return `${period.year}-Q${period.quarter}`;
  return String(period.year);
}
```

- [ ] **Step 3: Run the new tests and verify they pass**

Run:
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/reports/reports-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/reports/reports-helpers.test.ts`

Expected: PASS

### Task 3: Split the page into shell, sidebar, workbench, and panels

**Files:**
- Modify: `apps/web/src/pages/ReportsPage.tsx`
- Create: `apps/web/src/pages/reports/ReportsShellContainer.tsx`
- Create: `apps/web/src/pages/reports/ReportsSidebar.tsx`
- Create: `apps/web/src/pages/reports/ReportsWorkbench.tsx`
- Create: `apps/web/src/pages/reports/ReportsHeader.tsx`
- Create: `apps/web/src/pages/reports/panels/BalanceSheetPanel.tsx`
- Create: `apps/web/src/pages/reports/panels/ProfitStatementPanel.tsx`
- Create: `apps/web/src/pages/reports/panels/CashFlowPanel.tsx`
- Create: `apps/web/src/pages/reports/panels/ReportDiffPanel.tsx`
- Create: `apps/web/src/pages/reports/panels/ChairmanSummaryPanel.tsx`
- Create: `apps/web/src/pages/reports/report-types.ts`
- Test: `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`

- [ ] **Step 1: Replace the route entry with a thin wrapper**

```tsx
import { ReportsShellContainer } from "./reports/ReportsShellContainer";

export function ReportsPage() {
  return <ReportsShellContainer />;
}
```

- [ ] **Step 2: Move state and API actions into the container**

```tsx
const [activeView, setActiveView] = useState<ReportsWorkbenchView>(defaultReportsView);
const [status, setStatus] = useState<ReportsStatus>({
  tone: "info",
  message: "正在准备财务报表。",
});
```

- [ ] **Step 3: Implement sidebar-driven explicit actions**

```tsx
<ReportsSidebar
  periodType={periodType}
  year={year}
  month={month}
  quarter={quarter}
  snapshots={snapshots}
  fromSnapshotId={fromSnapshotId}
  toSnapshotId={toSnapshotId}
  activeView={activeView}
  onPeriodTypeChange={setPeriodType}
  onYearChange={setYear}
  onMonthChange={setMonth}
  onQuarterChange={setQuarter}
  onSelectFrom={setFromSnapshotId}
  onSelectTo={setToSnapshotId}
  onSelectView={setActiveView}
  onReload={() => void loadReports()}
  onSaveSnapshot={() => void saveSnapshot()}
  onGenerateDiff={() => void generateDiff()}
  onGenerateSummary={() => void generateSummary()}
  onOpenPrintable={() => void openPrintable()}
  onOpenBundle={(kind) => void openBundle(kind)}
/>
```

- [ ] **Step 4: Render the active workbench panel**

```tsx
<ReportsWorkbench
  activeView={activeView}
  balanceSheet={balanceSheet}
  profitStatement={profitStatement}
  cashFlow={cashFlow}
  diff={diff}
  chairmanSummary={chairmanSummary}
/>
```

- [ ] **Step 5: Run TypeScript verification**

Run: `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
Expected: PASS

### Task 4: Final verification and commit

**Files:**
- Verify: `docs/superpowers/specs/2026-05-27-reports-page-design.md`
- Verify: `docs/superpowers/plans/2026-05-27-reports-page-rework.md`
- Verify: `apps/web/src/pages/ReportsPage.tsx`
- Verify: `apps/web/src/pages/reports/`

- [ ] **Step 1: Re-run focused tests**

Run:
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/reports/reports-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/reports/reports-helpers.test.ts`

Expected: PASS

- [ ] **Step 2: Re-run full requested frontend verification**

Run: `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit only reports-related work**

```bash
git add docs/superpowers/specs/2026-05-27-reports-page-design.md docs/superpowers/plans/2026-05-27-reports-page-rework.md apps/web/src/pages/ReportsPage.tsx apps/web/src/pages/reports
git commit -m "Refactor V3 reports page structure"
```
