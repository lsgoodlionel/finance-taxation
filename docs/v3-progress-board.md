# V3 进度板

> 本文件用于承接 V3.0 页面与交互重构进度，补足 `docs/v3-upgrade-spec.md` 的执行状态信息，方便新窗口和后续分支直接接续。

## 1. 当前阶段

- 当前目标：`完成 V3 第一阶段高频页重构：Assistant / Events / Contracts / Payroll / PdfExport`
- 当前里程碑：`Phase 0 完成；Assistant / Events / Contracts / Payroll / Export Center 第一阶段结构重构已落地到 main`
- 更新时间：`2026-05-27`

## 2. V3 Workstreams

| Workstream | Scope | Branch | Status | Last Update | Done | Next |
| --- | --- | --- | --- | --- | --- | --- |
| V3-WS0 | 设计系统底座 | `codex/v3-design-system-foundation` | ✅ done | 2026-05-26 | token、global.css、shared hooks、shared UI primitives 已落地 | 作为后续所有 V3 分支的公共基线 |
| V3-WS1 | Assistant / Events 主入口重构 | `codex/v3-assistant-events-flow` | ✅ done | 2026-05-27 | 壳组件、状态面板、创建面板、详情面板、状态下沉已完成，`AssistantPage` 的 `session / mode / history` 与 `EventsPage` 的 `event` 选中态已统一到 URL 查询参数语义 | 仅保留视觉收口和更细子组件拆分作为后续优化 |
| V3-WS2 | Contracts 工作台重构 | `codex/v3-contracts-page-rework` | ✅ done | 2026-05-27 | 壳、列表、详情工作台、摘要优先、元信息、时间轴、对象概览、关联事项、表单、表格、空态和按钮层级均已组件化并收口 | 如需继续，仅做视觉微调，不扩业务逻辑 |
| V3-WS3 | Payroll 工作台重构 | `codex/v3-payroll-page-rework` | ✅ done | 2026-05-27 | shell/header/tab bar、employees / payroll / policy 三段容器、workflow summary、员工表单、工资明细表、参数表单已完成拆分 | 如需继续，仅做视觉收口和更深的数据编辑体验 |
| V3-WS4 | Export Center 重构 | `codex/v3-export-center-rework` | ✅ done | 2026-05-27 | shell、scene selector、history、archive、audit、8 个场景面板和 summary-first 布局均已完成，导出 API 与状态流保持不变 | 如需继续，进入异步导出和更深的状态机增强 |

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

## 4. 当前验证基线

已通过：
- `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/contracts/contracts-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/payroll/payroll-detail-sections.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/export/export-panels.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/assistant/assistant-shell.test.tsx`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/events/events-shell.test.tsx`

## 5. 下一步顺序

1. 基于当前第一阶段结果，选择下一个高频页进入 V3：`Tax / Ledger / Reports / Risk`
2. 如需继续当前五页，只做视觉一致性、响应式和无障碍收口
3. 如需深化导出体验，单独开异步导出状态机分支，不回滚当前 summary-first 结构

## 6. 接续提示

- 第一阶段五条 V3 分支已合回 `main`。
- 新窗口接续时，默认从 `main` 开新 V3 分支，不再从历史 V3 分支继续累积切出。
- 后续 V3 分支只应在现有设计系统和页面壳基础上扩展，不重复实现 token、shared hooks、shared UI primitives。
