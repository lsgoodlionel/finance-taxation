# AI 财税秘书通用业务流程图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AI 财税秘书和相关业务页中增加一套可反复查看、可穿透跳转、可根据事项自动高亮的“外购物品 + 业务招待”标准业务流程图。

**Architecture:** 前端实现为一套纯结构化流程数据 + 通用流程图组件 + 页面级上下文适配器。流程节点使用静态配置驱动，当前事项高亮状态由 `business_event`、tasks、documents、vouchers、tax batches 等现有对象推导，避免新增后端接口。

**Tech Stack:** React 18、TypeScript、React Router、现有 `apps/web` 页面结构、`@finance-taxation/domain-model`

---

## File Structure

### New files

- `apps/web/src/features/process-flow/types.ts`
  - 流程图数据结构、节点类型、状态类型
- `apps/web/src/features/process-flow/definition.ts`
  - 通用主流程和 `purchase` / `entertainment` 分支节点定义
- `apps/web/src/features/process-flow/resolve.ts`
  - 根据事项详情推导当前分支和当前节点
- `apps/web/src/features/process-flow/resolve.test.ts`
  - 纯函数测试，覆盖分支识别和步骤高亮
- `apps/web/src/features/process-flow/ProcessFlowCard.tsx`
  - 通用流程图卡片组件
- `apps/web/src/features/process-flow/ProcessFlowLegend.tsx`
  - 状态图例和字段说明

### Modified files

- `apps/web/src/pages/AssistantPage.tsx`
  - 挂载主流程图，支持默认展示和事项上下文高亮
- `apps/web/src/pages/EventsPage.tsx`
  - 挂载当前事项流程位置卡和完整流程图入口
- `apps/web/src/pages/DocumentsPage.tsx`
  - 挂载“返回流程图 / 上下游节点”入口
- `apps/web/src/pages/TaxPage.tsx`
  - 挂载税务阶段流程回看入口
- `apps/web/src/pages/VouchersPage.tsx`
  - 挂载凭证阶段流程回看入口
- `apps/web/src/pages/RiskPage.tsx`
  - 挂载风险阶段流程回看入口
- `apps/web/src/lib/api.ts`
  - 若页面需要统一读取流程上下文，可补辅助类型，不新增后端接口
- `apps/web/src/components/AppLayout.tsx`
  - 如需要，补“流程图”帮助入口或统一样式
- `docs/v2-progress-board.md`
  - 更新任务状态
- `README.md`
  - 更新功能说明

### Test/verification files

- `apps/web/src/features/process-flow/resolve.test.ts`
- 通过 `npm run typecheck:v2`
- 手工检查 `AssistantPage`、`EventsPage`、`DocumentsPage`、`TaxPage`、`VouchersPage`、`RiskPage`

---

### Task 1: 建立流程图结构模型与状态推导

**Files:**
- Create: `apps/web/src/features/process-flow/types.ts`
- Create: `apps/web/src/features/process-flow/definition.ts`
- Create: `apps/web/src/features/process-flow/resolve.ts`
- Create: `apps/web/src/features/process-flow/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { resolveProcessFlowContext } from "./resolve";

test("routes procurement events into purchase branch", () => {
  const result = resolveProcessFlowContext({
    event: {
      id: "evt-1",
      type: "procurement",
      status: "analyzed"
    },
    detail: {
      tasks: [{ id: "tsk-1" }],
      generatedDocuments: [],
      vouchers: [],
      taxItems: []
    }
  });

  assert.equal(result.branch, "purchase");
  assert.equal(result.currentNodeId, "approval_dispatch");
});

test("routes business entertainment events into entertainment branch", () => {
  const result = resolveProcessFlowContext({
    event: {
      id: "evt-2",
      type: "expense",
      status: "analyzed",
      title: "客户招待餐费"
    },
    detail: {
      tasks: [{ id: "tsk-1" }],
      generatedDocuments: [{ id: "doc-1" }],
      vouchers: [],
      taxItems: []
    }
  });

  assert.equal(result.branch, "entertainment");
  assert.equal(result.currentNodeId, "document_generation");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/web/src/features/process-flow/resolve.test.ts
```

Expected:

```text
ERR_MODULE_NOT_FOUND
```

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/features/process-flow/types.ts`

```ts
export type ProcessFlowBranch = "common" | "purchase" | "entertainment";
export type ProcessFlowNodeStatus = "pending" | "current" | "done" | "blocked";

export interface ProcessFlowNode {
  id: string;
  title: string;
  branch: ProcessFlowBranch;
  description: string;
  departments: string[];
  documents: string[];
  taxes: string[];
  vouchers: string[];
  routes: string[];
}
```

`apps/web/src/features/process-flow/resolve.ts`

```ts
export function resolveProcessFlowContext(input: {
  event: { type: string; title?: string; status?: string };
  detail: {
    tasks: Array<{ id: string }>;
    generatedDocuments: Array<{ id: string }>;
    vouchers: Array<{ id: string }>;
    taxItems: Array<{ id: string }>;
  };
}) {
  const lowerTitle = (input.event.title || "").toLowerCase();
  const branch =
    input.event.type === "procurement" || input.event.type === "asset"
      ? "purchase"
      : lowerTitle.includes("招待") || lowerTitle.includes("餐") || lowerTitle.includes("宴请")
        ? "entertainment"
        : "purchase";

  let currentNodeId = "ai_precheck";
  if (input.detail.tasks.length > 0) currentNodeId = "approval_dispatch";
  if (input.detail.generatedDocuments.length > 0) currentNodeId = "document_generation";
  if (input.detail.vouchers.length > 0) currentNodeId = "voucher_tax_processing";
  if (input.detail.taxItems.length > 0) currentNodeId = "tax_filing_archive";

  return { branch, currentNodeId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test apps/web/src/features/process-flow/resolve.test.ts
```

Expected:

```text
2 passing
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/process-flow/types.ts apps/web/src/features/process-flow/definition.ts apps/web/src/features/process-flow/resolve.ts apps/web/src/features/process-flow/resolve.test.ts
git commit -m "feat: add process flow model and resolver"
```

---

### Task 2: 构建通用流程图组件

**Files:**
- Create: `apps/web/src/features/process-flow/ProcessFlowCard.tsx`
- Create: `apps/web/src/features/process-flow/ProcessFlowLegend.tsx`
- Modify: `apps/web/src/features/process-flow/definition.ts`

- [ ] **Step 1: Write the failing test**

在 `apps/web/src/features/process-flow/resolve.test.ts` 追加节点配置断言：

```ts
import { PROCESS_FLOW_NODES } from "./definition";

test("defines both purchase and entertainment nodes", () => {
  const ids = PROCESS_FLOW_NODES.map((node) => node.id);
  assert.ok(ids.includes("business_happens"));
  assert.ok(ids.includes("purchase_classification"));
  assert.ok(ids.includes("entertainment_classification"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/web/src/features/process-flow/resolve.test.ts
```

Expected:

```text
ReferenceError: PROCESS_FLOW_NODES is not defined
```

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/features/process-flow/definition.ts`

```ts
import type { ProcessFlowNode } from "./types";

export const PROCESS_FLOW_NODES: ProcessFlowNode[] = [
  {
    id: "business_happens",
    title: "业务发生",
    branch: "common",
    description: "董事长外购物品或发生业务招待并取得发票",
    departments: ["董事长", "经办人"],
    documents: ["发票", "付款凭证", "说明材料"],
    taxes: [],
    vouchers: [],
    routes: ["/assistant"]
  },
  {
    id: "purchase_classification",
    title: "外购物品分支判断",
    branch: "purchase",
    description: "判断办公用品、低值易耗、固定资产或福利性支出",
    departments: ["行政/采购", "财务"],
    documents: ["采购发票", "用途说明"],
    taxes: ["增值税", "企业所得税"],
    vouchers: ["费用类凭证", "资产类凭证"],
    routes: ["/events", "/documents", "/vouchers"]
  },
  {
    id: "entertainment_classification",
    title: "业务招待分支判断",
    branch: "entertainment",
    description: "判断业务招待费、会议费、差旅餐饮或福利性消费",
    departments: ["业务部门", "财务", "税务"],
    documents: ["餐饮发票", "招待对象说明"],
    taxes: ["企业所得税", "增值税"],
    vouchers: ["业务招待费凭证"],
    routes: ["/events", "/tax", "/vouchers"]
  }
];
```

`apps/web/src/features/process-flow/ProcessFlowCard.tsx`

```tsx
import { useNavigate } from "react-router-dom";
import { PROCESS_FLOW_NODES } from "./definition";

export function ProcessFlowCard() {
  const navigate = useNavigate();

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">标准业务处理流程</span>
      </div>
      <div className="card-body">
        {PROCESS_FLOW_NODES.map((node) => (
          <button key={node.id} type="button" onClick={() => navigate(node.routes[0])}>
            {node.title}
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test apps/web/src/features/process-flow/resolve.test.ts
```

Expected:

```text
3 passing
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/process-flow/definition.ts apps/web/src/features/process-flow/ProcessFlowCard.tsx apps/web/src/features/process-flow/ProcessFlowLegend.tsx
git commit -m "feat: add reusable process flow card"
```

---

### Task 3: 接入 AI 财税秘书和事项页

**Files:**
- Modify: `apps/web/src/pages/AssistantPage.tsx`
- Modify: `apps/web/src/pages/EventsPage.tsx`
- Modify: `apps/web/src/features/process-flow/ProcessFlowCard.tsx`

- [ ] **Step 1: Write the failing test**

在 `apps/web/src/features/process-flow/resolve.test.ts` 增加状态推进断言：

```ts
test("moves to tax filing stage once tax items exist", () => {
  const result = resolveProcessFlowContext({
    event: { id: "evt-3", type: "procurement", status: "analyzed" },
    detail: {
      tasks: [{ id: "tsk-1" }],
      generatedDocuments: [{ id: "doc-1" }],
      vouchers: [{ id: "vou-1" }],
      taxItems: [{ id: "tax-1" }]
    }
  });

  assert.equal(result.currentNodeId, "tax_filing_archive");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/web/src/features/process-flow/resolve.test.ts
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/pages/AssistantPage.tsx`

```tsx
import { ProcessFlowCard } from "../features/process-flow/ProcessFlowCard";

// 在顶部助手输入区下方加入
<ProcessFlowCard
  mode="full"
  title="标准业务处理流程"
  subtitle="覆盖外购物品与业务招待，从提交秘书到税务留档"
/>
```

`apps/web/src/pages/EventsPage.tsx`

```tsx
import { ProcessFlowCard } from "../features/process-flow/ProcessFlowCard";
import { resolveProcessFlowContext } from "../features/process-flow/resolve";

const flowContext = detail
  ? resolveProcessFlowContext({
      event: detail,
      detail
    })
  : null;

<ProcessFlowCard
  mode="compact"
  title="当前事项流程位置"
  activeBranch={flowContext?.branch}
  currentNodeId={flowContext?.currentNodeId}
  businessEventId={detail?.id}
/>
```

更新 `resolve.ts`：

```ts
if (input.detail.taxItems.length > 0) currentNodeId = "tax_filing_archive";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test apps/web/src/features/process-flow/resolve.test.ts
```

Expected:

```text
4 passing
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck:v2
```

Expected:

```text
@finance-taxation/web typecheck
@finance-taxation/api typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/AssistantPage.tsx apps/web/src/pages/EventsPage.tsx apps/web/src/features/process-flow/ProcessFlowCard.tsx apps/web/src/features/process-flow/resolve.ts
git commit -m "feat: add process flow to assistant and events pages"
```

---

### Task 4: 接入单据、税务、凭证、风险页的回看和穿透

**Files:**
- Modify: `apps/web/src/pages/DocumentsPage.tsx`
- Modify: `apps/web/src/pages/TaxPage.tsx`
- Modify: `apps/web/src/pages/VouchersPage.tsx`
- Modify: `apps/web/src/pages/RiskPage.tsx`
- Modify: `apps/web/src/features/process-flow/ProcessFlowCard.tsx`

- [ ] **Step 1: Write the failing test**

在 `apps/web/src/features/process-flow/resolve.test.ts` 增加回看映射断言：

```ts
import { resolveDefaultRouteForNode } from "./resolve";

test("maps tax node to tax page", () => {
  assert.equal(resolveDefaultRouteForNode("tax_filing_archive"), "/tax");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/web/src/features/process-flow/resolve.test.ts
```

Expected:

```text
TypeError: resolveDefaultRouteForNode is not a function
```

- [ ] **Step 3: Write minimal implementation**

更新 `resolve.ts`：

```ts
export function resolveDefaultRouteForNode(nodeId: string) {
  const routeMap: Record<string, string> = {
    business_happens: "/assistant",
    ai_precheck: "/events",
    approval_dispatch: "/tasks",
    document_generation: "/documents",
    voucher_tax_processing: "/vouchers",
    tax_filing_archive: "/tax",
    archive_query: "/documents"
  };
  return routeMap[nodeId] || "/assistant";
}
```

在各页面增加“查看完整流程”卡片：

```tsx
<ProcessFlowCard
  mode="compact"
  title="业务流程回看"
  currentNodeId="tax_filing_archive"
/>
```

其中：

- `DocumentsPage` 使用 `currentNodeId="document_generation"`
- `VouchersPage` 使用 `currentNodeId="voucher_tax_processing"`
- `TaxPage` 使用 `currentNodeId="tax_filing_archive"`
- `RiskPage` 使用 `currentNodeId="tax_filing_archive"` 或按事项上下文计算

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test apps/web/src/features/process-flow/resolve.test.ts
```

Expected:

```text
5 passing
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck:v2
```

Expected:

```text
typecheck passes
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/DocumentsPage.tsx apps/web/src/pages/TaxPage.tsx apps/web/src/pages/VouchersPage.tsx apps/web/src/pages/RiskPage.tsx apps/web/src/features/process-flow/resolve.ts apps/web/src/features/process-flow/ProcessFlowCard.tsx
git commit -m "feat: add process flow back-links across business pages"
```

---

### Task 5: 文档、手工验收与交付收口

**Files:**
- Modify: `README.md`
- Modify: `docs/v2-progress-board.md`

- [ ] **Step 1: Update README**

在 `README.md` 的 V2 能力说明中补充：

```md
- 已支持 AI 财税秘书标准业务流程图
  - 覆盖外购物品与业务招待
  - 支持当前事项高亮
  - 支持从流程图穿透到事项、单据、凭证、税务、风险页面
```

- [ ] **Step 2: Update progress board**

在 `docs/v2-progress-board.md` 中增加完成项：

```md
| TASK-04-07 | AI 财税秘书标准业务流程图 | WS9 | Codex | main | done | TASK-04-01 / TASK-02-04 | 已接入 AssistantPage 和相关业务页 |
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run typecheck:v2
npm run verify
```

Expected:

```text
typecheck passes
progress-board-ok
```

- [ ] **Step 4: Manual verification**

手工检查：

- 打开 `AssistantPage`
- 确认主流程图默认显示
- 创建一条外购物品事项，确认高亮 `purchase`
- 创建一条业务招待事项，确认高亮 `entertainment`
- 在 `EventsPage`、`DocumentsPage`、`TaxPage`、`VouchersPage`、`RiskPage` 查看流程回看卡
- 点击节点，确认可跳转到对应页面

- [ ] **Step 5: Commit**

```bash
git add README.md docs/v2-progress-board.md
git commit -m "docs: record assistant process flow feature"
```

---

## Spec Coverage Check

- `AssistantPage` 主入口显示：由 Task 3 覆盖
- `EventsPage` 当前事项流程位置：由 Task 3 覆盖
- `Documents/Tax/Vouchers/Risk` 回看与穿透：由 Task 4 覆盖
- 通用主流程 + 双分支：由 Task 1、Task 2 覆盖
- 当前事项高亮规则：由 Task 1、Task 3 覆盖
- 结构化节点字段：由 Task 1 覆盖

## Self-Review

- 无 `TBD` / `TODO`
- 所有任务都含明确文件路径、代码示例、命令和验证方式
- 计划保持前端为主，不引入新的后端接口，符合当前需求和 YAGNI

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-assistant-business-process-flow.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
