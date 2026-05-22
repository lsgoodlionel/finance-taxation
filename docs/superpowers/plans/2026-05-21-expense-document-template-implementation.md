# Expense Document Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build formal read-only templates for `费用报销单` and `报销票据包` in the document center, and reuse the same structure for printing.

**Architecture:** Keep the current weak-link model based on `businessEventId`, but move expense-document presentation into dedicated template components. `DocumentsPage` remains the entry page and chooses a template view by `documentType`; printing reuses the same template-oriented data instead of inventing a second schema.

**Tech Stack:** React, TypeScript, Vite, existing `@finance-taxation/domain-model`, existing web API helpers, lightweight `tsx` script tests, existing `npm run -w @finance-taxation/web typecheck` and `npm run verify`.

---

## File Structure

### Existing files to modify

- Modify: `apps/web/src/pages/DocumentsPage.tsx`
  - Keep page orchestration, detail loading, uploads, and archive actions
  - Switch expense-related documents from generic detail rendering to dedicated templates
- Modify: `apps/web/src/pages/document-relations.ts`
  - Keep relation aggregation helpers
  - Add normalized template view-model builders and printable-template rendering
- Modify: `apps/web/src/pages/document-relations.test.ts`
  - Extend current lightweight test coverage for template selection and printable output

### New files to create

- Create: `apps/web/src/pages/document-templates/shared.tsx`
  - Shared display primitives: section wrapper, info rows, relation list, attachment list
- Create: `apps/web/src/pages/document-templates/ExpenseClaimTemplate.tsx`
  - Read-only formal template for `expense_claim`
- Create: `apps/web/src/pages/document-templates/InvoiceBundleTemplate.tsx`
  - Read-only formal template for `invoice_bundle`

### No files in scope

- Do not modify: `apps/api/**`
- Do not modify: `apps/web/src/pages/VouchersPage.tsx`
- Do not modify: `apps/web/src/pages/TaxPage.tsx`
- Do not modify: `apps/web/src/pages/TasksPage.tsx`

---

### Task 1: Extend Relation Helpers Into Template View Models

**Files:**
- Modify: `apps/web/src/pages/document-relations.ts`
- Test: `apps/web/src/pages/document-relations.test.ts`

- [ ] **Step 1: Write the failing test**

Add these tests to `apps/web/src/pages/document-relations.test.ts`:

```ts
import {
  buildDocumentRelations,
  buildExpenseDocumentTemplateModel,
  buildPrintableDocumentHtml,
  supportsPrintableDocument
} from "./document-relations";

function testBuildExpenseDocumentTemplateModel() {
  const model = buildExpenseDocumentTemplateModel({
    document,
    tasks,
    taxItems,
    vouchers
  });

  console.assert(model.documentType === "expense_claim", "expected expense claim template model");
  console.assert(model.relationSummary.tasks.length === 1, "expected related tasks in template model");
  console.assert(model.relationSummary.taxItems.length === 1, "expected related tax items in template model");
  console.assert(model.relationSummary.vouchers.length === 1, "expected related vouchers in template model");
}

function testBuildPrintableDocumentHtmlUsesFormalSections() {
  const html = buildPrintableDocumentHtml({
    document: {
      ...document,
      notes: "客户招待餐费与出租车费",
      attachments: []
    },
    tasks,
    taxItems,
    vouchers
  });

  console.assert(html.includes("单据信息"), "expected base info section");
  console.assert(html.includes("关联任务"), "expected related tasks section");
  console.assert(html.includes("关联税务事项"), "expected related tax section");
  console.assert(html.includes("关联凭证"), "expected related vouchers section");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
```

Expected:

- FAIL with missing export error for `buildExpenseDocumentTemplateModel`
- Or FAIL because formal printable sections are not present yet

- [ ] **Step 3: Write minimal implementation**

Update `apps/web/src/pages/document-relations.ts` to add normalized template helpers:

```ts
export interface ExpenseDocumentTemplateModel {
  documentType: "expense_claim" | "invoice_bundle";
  title: string;
  documentId: string;
  businessEventId: string;
  ownerDepartment: string;
  status: string;
  createdOn: string;
  archivedOn: string | null;
  notes: string | null;
  attachments: DocumentAttachmentRecord[];
  relationSummary: ReturnType<typeof buildDocumentRelations>;
}

export function buildExpenseDocumentTemplateModel(input: PrintableDocumentInput): ExpenseDocumentTemplateModel {
  return {
    documentType: input.document.documentType as "expense_claim" | "invoice_bundle",
    title: input.document.title,
    documentId: input.document.id,
    businessEventId: input.document.businessEventId,
    ownerDepartment: input.document.ownerDepartment || "—",
    status: input.document.status,
    createdOn: input.document.createdAt?.slice(0, 10) || "—",
    archivedOn: input.document.archivedAt?.slice(0, 10) || null,
    notes: input.document.notes || null,
    attachments: input.document.attachments ?? [],
    relationSummary: buildDocumentRelations(input)
  };
}
```

Also refactor printable HTML to use this normalized model:

```ts
export function buildPrintableDocumentHtml(input: PrintableDocumentInput) {
  const model = buildExpenseDocumentTemplateModel(input);
  return `...use model.relationSummary.tasks ...`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
```

Expected:

- `document-relations-ok`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/document-relations.ts apps/web/src/pages/document-relations.test.ts
git commit -m "Add expense document template view models"
```

---

### Task 2: Create Shared Template Building Blocks

**Files:**
- Create: `apps/web/src/pages/document-templates/shared.tsx`
- Test: `apps/web/src/pages/document-relations.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `apps/web/src/pages/document-relations.test.ts` with one more printable assertion that forces clear section grouping:

```ts
function testPrintableHtmlShowsAttachmentAndReasonSections() {
  const html = buildPrintableDocumentHtml({
    document: {
      ...document,
      notes: "差旅与招待混合报销",
      attachments: [
        {
          id: "att-1",
          companyId: "company-1",
          documentId: "doc-1",
          fileName: "invoice.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
          uploadedAt: "2026-05-21T00:00:00.000Z"
        }
      ]
    },
    tasks,
    taxItems,
    vouchers
  });

  console.assert(html.includes("原始凭证附件"), "expected attachment section");
  console.assert(html.includes("单据说明"), "expected notes section");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
```

Expected:

- FAIL because printable HTML structure is still too generic or missing required sections

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/pages/document-templates/shared.tsx`:

```tsx
import type { ReactNode } from "react";

export function TemplateSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: "1px solid rgba(20,40,60,0.08)", borderRadius: 10, padding: "14px 16px", background: "#fff" }}>
      <h4 style={{ margin: "0 0 10px", fontSize: "13.5px" }}>{title}</h4>
      {children}
    </section>
  );
}

export function TemplateInfoTable({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ width: 96, padding: "7px 10px", color: "#6c7a89" }}>{label}</td>
            <td style={{ padding: "7px 10px" }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TemplateBulletList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (!items.length) return <div style={{ color: "#9aa5b4", fontSize: 12 }}>{emptyText}</div>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: "12.5px" }}>
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
```

Expected:

- `document-relations-ok`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/document-templates/shared.tsx apps/web/src/pages/document-relations.test.ts
git commit -m "Add shared expense document template blocks"
```

---

### Task 3: Implement Expense Claim and Invoice Bundle Templates

**Files:**
- Create: `apps/web/src/pages/document-templates/ExpenseClaimTemplate.tsx`
- Create: `apps/web/src/pages/document-templates/InvoiceBundleTemplate.tsx`
- Modify: `apps/web/src/pages/document-relations.ts`
- Test: `apps/web/src/pages/document-relations.test.ts`

- [ ] **Step 1: Write the failing test**

Add template selector tests in `apps/web/src/pages/document-relations.test.ts`:

```ts
import { getExpenseDocumentTemplateKind } from "./document-relations";

function testExpenseTemplateSelection() {
  console.assert(getExpenseDocumentTemplateKind("expense_claim") === "expense_claim", "expected expense claim template");
  console.assert(getExpenseDocumentTemplateKind("invoice_bundle") === "invoice_bundle", "expected invoice bundle template");
  console.assert(getExpenseDocumentTemplateKind("supporting_document") === null, "expected no specialized template");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
```

Expected:

- FAIL with missing export `getExpenseDocumentTemplateKind`

- [ ] **Step 3: Write minimal implementation**

Add selector helper to `apps/web/src/pages/document-relations.ts`:

```ts
export function getExpenseDocumentTemplateKind(documentType: string) {
  if (documentType === "expense_claim") return "expense_claim";
  if (documentType === "invoice_bundle") return "invoice_bundle";
  return null;
}
```

Create `ExpenseClaimTemplate.tsx`:

```tsx
import type { ExpenseDocumentTemplateModel } from "../document-relations";
import { TemplateBulletList, TemplateInfoTable, TemplateSection } from "./shared";

export function ExpenseClaimTemplate({ model }: { model: ExpenseDocumentTemplateModel }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <TemplateSection title="单据信息">
        <TemplateInfoTable rows={[
          ["单据编号", model.documentId],
          ["关联事项", model.businessEventId],
          ["责任部门", model.ownerDepartment],
          ["状态", model.status],
          ["创建日期", model.createdOn],
          ["归档日期", model.archivedOn || "—"]
        ]} />
      </TemplateSection>
      <TemplateSection title="报销事由">
        <div style={{ lineHeight: 1.75, fontSize: "13px" }}>{model.notes || "无"}</div>
      </TemplateSection>
      <TemplateSection title="关联任务">
        <TemplateBulletList
          items={model.relationSummary.tasks.map((item) => `${item.title}｜${item.assigneeDepartment || "未分配"}｜${item.status}`)}
          emptyText="暂无关联任务"
        />
      </TemplateSection>
    </div>
  );
}
```

Create `InvoiceBundleTemplate.tsx` with the same structure, but attachment section first:

```tsx
import type { ExpenseDocumentTemplateModel } from "../document-relations";
import { TemplateBulletList, TemplateInfoTable, TemplateSection } from "./shared";

export function InvoiceBundleTemplate({ model }: { model: ExpenseDocumentTemplateModel }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <TemplateSection title="票据包信息">
        <TemplateInfoTable rows={[
          ["单据编号", model.documentId],
          ["关联事项", model.businessEventId],
          ["责任部门", model.ownerDepartment],
          ["状态", model.status]
        ]} />
      </TemplateSection>
      <TemplateSection title="附件清单">
        <TemplateBulletList
          items={model.attachments.map((item) => `${item.fileName}｜${item.fileType}｜${item.fileSize} bytes`)}
          emptyText="暂无附件"
        />
      </TemplateSection>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
```

Expected:

- `document-relations-ok`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/document-relations.ts \
  apps/web/src/pages/document-relations.test.ts \
  apps/web/src/pages/document-templates/ExpenseClaimTemplate.tsx \
  apps/web/src/pages/document-templates/InvoiceBundleTemplate.tsx
git commit -m "Add expense document template components"
```

---

### Task 4: Switch DocumentsPage To Template Rendering

**Files:**
- Modify: `apps/web/src/pages/DocumentsPage.tsx`
- Modify: `apps/web/src/pages/document-relations.ts`
- Test: `apps/web/src/pages/document-relations.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `apps/web/src/pages/document-relations.test.ts` to assert printing remains supported only for expense templates:

```ts
function testTemplateKindsAndPrintableStayAligned() {
  for (const documentType of ["expense_claim", "invoice_bundle"] as const) {
    console.assert(getExpenseDocumentTemplateKind(documentType) !== null, "expected template kind");
    console.assert(supportsPrintableDocument(documentType) === true, "expected printable support");
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
```

Expected:

- FAIL if selector and printable routing are not aligned yet

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/pages/DocumentsPage.tsx`, add imports:

```tsx
import { ExpenseClaimTemplate } from "./document-templates/ExpenseClaimTemplate";
import { InvoiceBundleTemplate } from "./document-templates/InvoiceBundleTemplate";
import {
  buildDocumentRelations,
  buildExpenseDocumentTemplateModel,
  buildPrintableDocumentHtml,
  getExpenseDocumentTemplateKind,
  supportsPrintableDocument
} from "./document-relations";
```

Inside detail rendering:

```tsx
const templateKind = getExpenseDocumentTemplateKind(detail.documentType);
const templateModel = buildExpenseDocumentTemplateModel({
  document: detail,
  tasks: relatedTasks,
  taxItems: relatedTaxItems,
  vouchers: relatedVouchers
});

{templateKind === "expense_claim" ? (
  <ExpenseClaimTemplate model={templateModel} />
) : templateKind === "invoice_bundle" ? (
  <InvoiceBundleTemplate model={templateModel} />
) : (
  /* existing generic detail block */
)}
```

Keep the current generic block for all non-expense document types.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
npm run -w @finance-taxation/web typecheck
```

Expected:

- `document-relations-ok`
- `tsc --noEmit` exits 0

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/DocumentsPage.tsx apps/web/src/pages/document-relations.ts apps/web/src/pages/document-relations.test.ts
git commit -m "Render expense documents with formal templates"
```

---

### Task 5: Reuse Template Data For Printing And Final Verification

**Files:**
- Modify: `apps/web/src/pages/document-relations.ts`
- Modify: `apps/web/src/pages/DocumentsPage.tsx`
- Test: `apps/web/src/pages/document-relations.test.ts`

- [ ] **Step 1: Write the failing test**

Add one last assertion:

```ts
function testPrintableHtmlIncludesFormalExpenseTitle() {
  const html = buildPrintableDocumentHtml({
    document: {
      ...document,
      title: "费用报销单"
    },
    tasks,
    taxItems,
    vouchers
  });

  console.assert(html.includes("费用报销单"), "expected formal expense title in printable html");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
```

Expected:

- FAIL if printable generation still drifts from template data

- [ ] **Step 3: Write minimal implementation**

Refactor `buildPrintableDocumentHtml` in `apps/web/src/pages/document-relations.ts` so it builds from the same normalized `ExpenseDocumentTemplateModel` used by the page templates.

Keep the output simple and printable:

```ts
const model = buildExpenseDocumentTemplateModel(input);
const attachmentItems = model.attachments.map(...);
const taskItems = model.relationSummary.tasks.map(...);
```

In `DocumentsPage.tsx`, keep print action unchanged except for reusing the updated helper.

- [ ] **Step 4: Run full verification**

Run:

```bash
node --import tsx apps/web/src/pages/document-relations.test.ts
npm run -w @finance-taxation/web typecheck
npm run verify
```

Expected:

- `document-relations-ok`
- `tsc --noEmit` exits 0
- `npm run verify` exits 0

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/document-relations.ts apps/web/src/pages/DocumentsPage.tsx apps/web/src/pages/document-relations.test.ts
git commit -m "Align printable expense documents with templates"
```

---

## Self-Review

### Spec coverage

- Formal template view for `expense_claim`: covered by Task 3 and Task 4
- Formal template view for `invoice_bundle`: covered by Task 3 and Task 4
- Reuse existing `businessEventId` relation chain: covered by Task 1 and Task 4
- Printing reuses same structure: covered by Task 5
- No DB changes: all tasks stay in `apps/web/src/**`

### Placeholder scan

- No `TBD` / `TODO`
- All code-touching steps include concrete code blocks
- All test steps include exact commands and expected outputs

### Type consistency

- Shared model name is consistently `ExpenseDocumentTemplateModel`
- Template selector is consistently `getExpenseDocumentTemplateKind`
- Relation aggregator remains `buildDocumentRelations`

