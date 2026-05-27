# Reports Page V3 Design

## Goal

将财务报表页从单文件纵向堆叠页面重构为 V3 风格的双栏工作台，在不修改后端 API 和业务结果的前提下，同时完成结构拆分和交互重组。

## Constraints

- 不新增或修改报表相关 API。
- 不改变现有报表、快照、差异分析、老板摘要、打印与资料包的业务结果。
- 保持现有显式触发时机：加载三表、保存快照、生成差异、生成摘要、打开打印与资料包都继续由用户动作触发。
- 复用当前 V3 设计系统基础组件和页面壳思路。

## Chosen Direction

采用双栏工作台方案：

- 左侧控制栏负责期间选择、快照选择和动作触发。
- 右侧工作台负责展示当前视图，包括资产负债表、利润表、现金流量表、差异分析和老板摘要。
- 路由入口 `ReportsPage.tsx` 变为薄入口，实际状态和布局下沉到 `apps/web/src/pages/reports/`。

## Information Architecture

### Left Sidebar

- 期间上下文：`periodType / year / month / quarter`
- 快照上下文：`fromSnapshotId / toSnapshotId`
- 主要动作：
  - 更新报表
  - 保存资产负债表快照
  - 生成差异分析
  - 生成老板摘要
  - 打开打印版
  - 打开月结 / 审计 / 稽核资料包

### Right Workbench

- 顶部摘要：页面标题、说明、状态反馈
- 视图切换：
  - `balanceSheet`
  - `profitStatement`
  - `cashFlow`
  - `diff`
  - `chairman`
- 当前视图内容只负责结果展示，不直接发起请求

## Component Boundaries

- `apps/web/src/pages/ReportsPage.tsx`
  - 路由入口，仅渲染 `ReportsShellContainer`
- `apps/web/src/pages/reports/ReportsShellContainer.tsx`
  - 页面级 state、API 调用、动作处理、左右栏拼装
- `apps/web/src/pages/reports/ReportsShell.tsx`
  - 双栏布局壳
- `apps/web/src/pages/reports/ReportsSidebar.tsx`
  - 左侧控制台
- `apps/web/src/pages/reports/ReportsWorkbench.tsx`
  - 右侧工作台和视图切换
- `apps/web/src/pages/reports/panels/*`
  - 三表、差异分析、老板摘要的独立展示面板
- `apps/web/src/pages/reports/reports-helpers.ts`
  - 快照标签、默认视图、资料包期间标签等纯函数

## State Model

- 基础数据：
  - `balanceSheet`
  - `profitStatement`
  - `cashFlow`
  - `snapshots`
- 交互状态：
  - `periodType / year / month / quarter`
  - `fromSnapshotId / toSnapshotId`
  - `activeView`
  - `diff`
  - `chairmanSummary`
  - `status`

## Feedback Model

- 页面级反馈改为结构化：
  - `info`
  - `success`
  - `error`
- 状态通过 banner 展示，不再只依赖单一自由文本 message。

## Testing

- 新增 `reports-shell.test.tsx`，验证双栏壳组件的关键插槽。
- 新增 `reports-helpers.test.ts`，验证默认视图、快照标签和资料包期间标签等纯逻辑。
- 继续运行前端 TypeScript 检查，确认重构后主工程仍通过。
