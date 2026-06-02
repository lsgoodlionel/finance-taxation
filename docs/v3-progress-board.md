# V3 进度板

> 本文件用于承接 V3.0 页面与交互重构进度，补足 `docs/v3-upgrade-spec.md` 的执行状态信息，方便新窗口和后续分支直接接续。

## 1. 当前阶段

- 当前目标：`Phase 4 收尾——剩余仅 responsive / accessibility 统一深化`
- 当前里程碑：`所有页面已完成 V3 结构化重构并合回 main；KnowledgePage（627→277）、DocumentsPage（652→214）两个最后的单体页已拆为 summary-first 工作台；后端 P1/P2/P3 外部对接 + 迁移修复均已在 main`
- 更新时间：`2026-06-02`

## 2. V3 Workstreams

| Workstream | Scope | Branch | Status | Last Update | Done | Next |
| --- | --- | --- | --- | --- | --- | --- |
| V3-WS0 | 设计系统底座 | `codex/v3-design-system-foundation` | ✅ done | 2026-05-26 | token、global.css、shared hooks、shared UI primitives 已落地 | 作为后续所有 V3 分支的公共基线 |
| V3-WS1 | Assistant / Events 主入口重构 | `codex/v3-assistant-events-flow` | ✅ done | 2026-05-27 | 壳组件、状态面板、创建面板、详情面板、状态下沉已完成，`AssistantPage` 的 `session / mode / history` 与 `EventsPage` 的 `event` 选中态已统一到 URL 查询参数语义 | 仅保留视觉收口和更细子组件拆分作为后续优化 |
| V3-WS2 | Contracts 工作台重构 | `codex/v3-contracts-page-rework` | ✅ done | 2026-05-27 | 壳、列表、详情工作台、摘要优先、元信息、时间轴、对象概览、关联事项、表单、表格、空态和按钮层级均已组件化并收口 | 如需继续，仅做视觉微调，不扩业务逻辑 |
| V3-WS3 | Payroll 工作台重构 | `codex/v3-payroll-page-rework` | ✅ done | 2026-05-27 | shell/header/tab bar、employees / payroll / policy 三段容器、workflow summary、员工表单、工资明细表、参数表单已完成拆分 | 如需继续，仅做视觉收口和更深的数据编辑体验 |
| V3-WS4 | Export Center 重构 | `codex/v3-export-center-rework` | ✅ done | 2026-05-27 | shell、scene selector、history、archive、audit、8 个场景面板和 summary-first 布局均已完成，导出 API 与状态流保持不变 | 如需继续，进入异步导出和更深的状态机增强 |
| V3-WS5 | Tax 工作台重构 | `codex/v3-tax-center-rework` | ✅ done | 2026-05-27 | TaxPage 已拆为 shell/header/summary/profile/items/batches/materials 多个面板，单字符串消息改为 banner，批次与资料视图已收敛到 URL 查询参数，底层税务 API 与流程节点保持不变 | 下一页优先进入 `Ledger / Reports / Risk` 之一，继续结果页结构收口 |
| V3-WS6 | Layout Visibility Polish | `codex/v3-layout-visibility-polish` | 🟡 in_progress | 2026-06-01 | 已修复侧栏 footer 遮挡；`Assistant / Contracts / Payroll / Export` 已完成 hero/section/summary-first 的可见性收口；当前分支已补齐 `Tax / Ledger / Reports / Risk` 结构并统一结果页壳层 | 下一步回写总进度并准备合回 `main` |
| V3-WS7 | Ledger 结果页重构 | `codex/v3-ledger-page-rework` | ✅ done | 2026-06-01 | 已完成 shell/header/sceneSelector/sceneSummary/context 第一批，以及 summary / balances / journal / entries / periods 的响应式、密度与空态一致性收口 | 后续只保留微调，不再扩业务逻辑 |
| V3-WS8 | Reports 结果页重构 | `codex/v3-reports-page-rework` | ✅ done | 2026-06-01 | 已完成 shell/sidebar/workbench/panels 结构拆分，并补 `summary-first`、快照上下文和结果 KPI 摘要 | 后续只保留微调和总线集成 |
| V3-WS9 | Risk / Audit 工作台重构 | `codex/v3-risk-page-rework` | ✅ done | 2026-06-01 | 已完成 KPI、列表、整改工作台、时间线和审计回跳基础结构，并补响应式与工作台层级收口 | 后续只保留微调和总线集成 |

## 3. 已完成分支与提交

### `codex/v3-design-system-foundation`
- `73402ac` 增加 Phase 0 计划
- `fe152ce` 设计系统底座实现

### `codex/v3-assistant-events-flow`
- `fee7916` Assistant / Events 入口壳重构
- `e796959` Assistant / Events 状态进一步下沉到子组件
- `9c24a77` Assistant / Events URL 状态与入口提示收口

### `codex/v3-contracts-page-rework`
- `63948cf` Contracts 页壳脚手架
- `7172c51` 流程摘要优先展示
- `bffad98` 工作台内部块拆分
- `2f1756b` 计划状态回写
- `0c8fb2e` 元信息和时间轴面板拆分
- `8abcac6` 计划状态回写
- `b38a951` 表单和表格本体拆分
- `b290ed4` 计划状态回写
- `8a345ff` 修正 `TasksPage` 旧任务状态枚举以恢复全量前端 typecheck
- `28fcdee` Contracts 页展示层收口、空态和按钮层级统一

### `codex/v3-payroll-page-rework`
- `dcf2270` Payroll 页壳脚手架
- `e6536ce` 拆 employees / payroll / policy 三段容器，并前置 workflow summary
- `d5ada3f` 拆员工表单、工资明细表、参数表单

### `codex/v3-export-center-rework`
- `c439dbd` Export Center 壳脚手架
- `ac45aac` 拆 8 个导出场景面板
- `e5e089d` 完成 summary-first 导出流程收口

### `codex/v3-tax-center-rework`
- `909c666` Tax 页壳组件、批次工作台和资料分区拆分
- `0b54364` 税务摘要、批次、资料区的层级和响应式收口

### `codex/v3-layout-visibility-polish`
- `bad8d61` 修复侧栏 footer 遮挡
- `c77601c` 强化 Assistant / Contracts 可见性层级
- `89bc54e` 强化 Payroll / Export 可见性层级
- `4da14aa` 合入 Reports 并统一 Tax / Ledger / Reports / Risk 的结果页壳层

### `codex/v3-ledger-page-rework`
- `fbb5205` Ledger summary-first 壳层脚手架
- `da124a8` Ledger 场景面板层级收口
- `5411b3f` 并行执行索引文档
- `c1c7403` Ledger 响应式工作台与表格密度收口

### `codex/v3-reports-page-rework`
- `8a0a07a` 报表页图表视图
- `bb8d027` Reports workbench `summary-first` 收口

### `codex/v3-risk-page-rework`
- `cfd7b69` Risk V3 工作台基础结构
- `c9960ca` Risk 工作台层级与响应式收口

## 4. 当前验证基线

已通过：
- `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/contracts/contracts-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/payroll/payroll-detail-sections.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/export/export-panels.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/assistant/assistant-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/events/events-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/tax/tax-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/payroll/payroll-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/export/export-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/export/export-panels.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/ledger/ledger-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/reports/reports-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/reports/reports-helpers.test.ts`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/risk/risk-workbench.test.tsx`

## 5. 下一步顺序

1. ✅ 全部 V3 结果页分支 + `layout-visibility-polish` 已合回 `main`
2. ✅ `auth-session-ux`、`knowledge-page-rework`、后端 `p3-reconciliation-engine`（含 P1/P2/P3 + 迁移修复）已合回 `main`
3. ✅ `main` 总体验证通过：API typecheck + 93 测试、Web typecheck + 45 测试文件全绿
4. ✅ `DocumentsPage` 已重构为 V3 summary-first 工作台（652→214 行）并合回 main
5. ✅ 全局 responsive / accessibility 收口（global.css 集中）：
   - 键盘焦点可见性 `:focus-visible` 统一轮廓
   - 尊重 `prefers-reduced-motion` 系统偏好
   - 超小屏（≤640px）结果网格折叠为单列
   - 工作台卡片内宽表格窄屏横向滚动
6. ⏳ `main` Docker 重建验证（需本地 PostgreSQL）

## 6. 接续提示

- 第一阶段五条 V3 分支已合回 `main`，`Tax` 当前在独立 V3 分支上完成并待合回，`Layout Visibility Polish` 作为第一阶段的可见性补丁分支单独推进。
- 新窗口接续时，默认从 `main` 开新 V3 分支，不再从历史 V3 分支继续累积切出。
- 后续 V3 分支只应在现有设计系统和页面壳基础上扩展，不重复实现 token、shared hooks、shared UI primitives。
