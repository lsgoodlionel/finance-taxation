# V3 进度板

> 本文件用于承接 V3.0 页面与交互重构进度，补足 `docs/v3-upgrade-spec.md` 的执行状态信息，方便新窗口和后续分支直接接续。

## 1. 当前阶段

- 当前目标：`合回 Tax 工作台第一轮结果，并推进 Ledger 第一批 summary-first 壳层重构`
- 当前里程碑：`Phase 0 完成；Assistant / Events / Contracts / Payroll / Export Center 已落地到 main；Tax 结果页第一轮结构重构已完成；Ledger 第一批壳层与摘要区已启动`
- 更新时间：`2026-05-28`

## 2. V3 Workstreams

| Workstream | Scope | Branch | Status | Last Update | Done | Next |
| --- | --- | --- | --- | --- | --- | --- |
| V3-WS0 | 设计系统底座 | `codex/v3-design-system-foundation` | ✅ done | 2026-05-26 | token、global.css、shared hooks、shared UI primitives 已落地 | 作为后续所有 V3 分支的公共基线 |
| V3-WS1 | Assistant / Events 主入口重构 | `codex/v3-assistant-events-flow` | ✅ done | 2026-05-27 | 壳组件、状态面板、创建面板、详情面板、状态下沉已完成，`AssistantPage` 的 `session / mode / history` 与 `EventsPage` 的 `event` 选中态已统一到 URL 查询参数语义 | 仅保留视觉收口和更细子组件拆分作为后续优化 |
| V3-WS2 | Contracts 工作台重构 | `codex/v3-contracts-page-rework` | ✅ done | 2026-05-27 | 壳、列表、详情工作台、摘要优先、元信息、时间轴、对象概览、关联事项、表单、表格、空态和按钮层级均已组件化并收口 | 如需继续，仅做视觉微调，不扩业务逻辑 |
| V3-WS3 | Payroll 工作台重构 | `codex/v3-payroll-page-rework` | ✅ done | 2026-05-27 | shell/header/tab bar、employees / payroll / policy 三段容器、workflow summary、员工表单、工资明细表、参数表单已完成拆分 | 如需继续，仅做视觉收口和更深的数据编辑体验 |
| V3-WS4 | Export Center 重构 | `codex/v3-export-center-rework` | ✅ done | 2026-05-27 | shell、scene selector、history、archive、audit、8 个场景面板和 summary-first 布局均已完成，导出 API 与状态流保持不变 | 如需继续，进入异步导出和更深的状态机增强 |
| V3-WS5 | Tax 工作台重构 | `codex/v3-tax-center-rework` | ✅ done | 2026-05-27 | TaxPage 已拆为 shell/header/summary/profile/items/batches/materials 多个面板，单字符串消息改为 banner，批次与资料视图已收敛到 URL 查询参数，底层税务 API 与流程节点保持不变 | 下一页优先进入 `Ledger / Reports / Risk` 之一，继续结果页结构收口 |
| V3-WS6 | Layout Visibility Polish | `codex/v3-layout-visibility-polish` | 🟡 in_progress | 2026-05-28 | 已修复侧栏 footer 遮挡；`Assistant / Contracts / Payroll / Export` 已完成 hero/section/summary-first 的可见性收口 | 推送分支并继续 `Tax / Ledger / Reports / Risk` 的可见性统一 |
| V3-WS7 | Ledger 结果页重构 | `codex/v3-ledger-page-rework` | 🟡 in_progress | 2026-05-28 | 已完成 shell/header/sceneSelector/sceneSummary/context 第一批，以及 summary / balances / journal / entries / periods 五个场景面板第二批层级收口 | 下一批进入更细的 table density、responsive 和空态一致性 |
| V3-WS8 | Reports 结果页重构 | `codex/v3-reports-page-rework` | ⏳ pending | 2026-05-28 | 仅有计划分支，占位未开始 | 参考 `bigcapital Dashboard/FinancialStatements` 与 `dubbl stat-card/chart` 做图表化收口 |
| V3-WS9 | Risk / Audit 工作台重构 | `codex/v3-risk-page-rework` | ⏳ pending | 2026-05-28 | 仅有计划分支，占位未开始 | 复用 drilldown 基础设施，参考 `dubbl audit-timeline` 做闭环链路和时间线收口 |

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
- `本次分支` Tax 页壳组件、批次工作台和资料分区拆分

### `codex/v3-layout-visibility-polish`
- `bad8d61` 修复侧栏 footer 遮挡
- `c77601c` 强化 Assistant / Contracts 可见性层级
- `89bc54e` 强化 Payroll / Export 可见性层级

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

## 5. 下一步顺序

1. 第一波并行：`Tax / Ledger / Reports / Risk`
2. 第二波串行：`Layout Visibility Polish`
3. 最后统一更新进度板、合回 `main`、重建 Docker

## 5.1 并行执行索引

- 新窗口统一参考：
  - [docs/v3-parallel-execution-index.md](/Users/lionel/Develop/FT/docs/v3-parallel-execution-index.md)
- 并行阶段不要修改：
  - `docs/v3-progress-board.md`
  - `docs/v3-upgrade-spec.md`
  - `apps/web/src/styles/global.css`
- 这些共享文件留到各车道完成后统一收口

## 6. 接续提示

- 第一阶段五条 V3 分支已合回 `main`，`Tax` 当前在独立 V3 分支上完成并待合回，`Layout Visibility Polish` 作为第一阶段的可见性补丁分支单独推进。
- 新窗口接续时，默认从 `main` 开新 V3 分支，不再从历史 V3 分支继续累积切出。
- 后续 V3 分支只应在现有设计系统和页面壳基础上扩展，不重复实现 token、shared hooks、shared UI primitives。
