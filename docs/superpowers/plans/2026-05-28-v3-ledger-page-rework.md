# V3 Ledger Page Rework Plan

> 日期：2026-05-28  
> 分支：`codex/v3-ledger-page-rework`  
> 状态：实施中（Task 1 ~ Task 3 第一批已完成）

## 目标

在不改动现有总账业务逻辑和 API 的前提下，把 `LedgerPage` 从工程态结果页重构为
`summary-first` 的总账工作台。

## 范围约束

- 保留现有场景：
  - `summary`
  - `balances`
  - `journal`
  - `entries`
  - `periods`
- 不修改：
  - 分录查询逻辑
  - 科目余额逻辑
  - 日记账加载逻辑
  - 锁账/解锁逻辑
  - drilldown / query state 行为
- 仅重构：
  - 页面壳层
  - 顶部 header
  - 场景选择器
  - 场景摘要
  - 右侧上下文区
  - 结果区视觉层级

## 任务拆分

### Task 1：Shell / Header / Scene Selector
- 将 `LedgerShell` 接入 V3 hero/section 布局
- 将 `LedgerHeader` 改为 hero 风格
- 将 `LedgerSceneSelector` 改为场景卡矩阵
  
当前进度：已完成

### Task 2：Summary-First 收口
- 强化 `LedgerSceneSummary`
- 将当前场景说明、范围数字、摘要标签放到页面最前

当前进度：已完成

### Task 3：Context Panel 工作台化
- 将 `LedgerContextPanel` 改为摘要卡 + 当前上下文卡
- 保留原有 metrics 和上下文信息

当前进度：已完成

### Task 4：验证与回写
- 前端 typecheck
- focused test：`ledger-shell.test.tsx`
- 回写 `docs/v3-progress-board.md`

当前进度：已完成

### Task 5：五个场景面板层级收口
- `summary`：补用途说明和摘要标签
- `balances`：补余额摘要标签
- `journal`：补场景说明与查询区层级
- `entries`：补过滤区、批次区、分录区摘要
- `periods`：补锁账说明和期间列表摘要

当前进度：已完成

### Task 6：第三批密度 / 响应式 / 空态一致性
- `entries`：切到更稳定的 antd 表格 + 分页 + 横向滚动
- `journal`：统一查询区控件、页码摘要和小屏布局
- `periods`：统一新增锁账区与期间列表的摘要标签、按钮换行和表格滚动

当前进度：已完成

## 完成定义

- `LedgerPage` 首屏先看到：
  - 总账 hero header
  - 当前场景摘要
  - 场景切换卡
  - 左侧结果区 / 右侧上下文区
- 不出现业务行为变化
- 保持现有所有场景切换、过滤和锁账能力可用
- 后续如继续，仅做更细视觉微调和统一可见性收口，不再改场景结构
