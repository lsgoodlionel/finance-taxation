# V3 进度板

> 本文件用于承接 V3.0 页面与交互重构进度，补足 `docs/v3-upgrade-spec.md` 的执行状态信息，方便新窗口和后续分支直接接续。

## 1. 当前阶段

- 当前目标：`完成 V3 第一阶段高频页重构：Assistant / Events / Contracts / Payroll / PdfExport`
- 当前里程碑：`Phase 0 完成，Assistant / Events / Contracts 第一批完成，准备进入 Payroll`
- 更新时间：`2026-05-27`

## 2. V3 Workstreams

| Workstream | Scope | Branch | Status | Last Update | Done | Next |
| --- | --- | --- | --- | --- | --- | --- |
| V3-WS0 | 设计系统底座 | `codex/v3-design-system-foundation` | ✅ done | 2026-05-26 | token、global.css、shared hooks、shared UI primitives 已落地 | 作为后续所有 V3 分支的公共基线 |
| V3-WS1 | Assistant / Events 主入口重构 | `codex/v3-assistant-events-flow` | ✅ first batch done | 2026-05-26 | 壳组件、状态面板、创建面板、详情面板、状态下沉第一批完成 | 如需继续，仅收敛 URL 状态与更细子组件 |
| V3-WS2 | Contracts 工作台重构 | `codex/v3-contracts-page-rework` | ✅ structure split mostly done | 2026-05-27 | 壳、列表、详情工作台、摘要优先、元信息、时间轴、对象概览、关联事项、表单、表格均已组件化 | 只做视觉一致性和细节收口，不扩业务逻辑 |
| V3-WS3 | Payroll 工作台重构 | `codex/v3-payroll-page-rework` | ⚠️ second batch done | 2026-05-27 | 已建立计划，完成 shell/header/tab bar，完成 employees / payroll / policy 三段容器拆分，并将工资工作流摘要前置 | 提交第二批后，再决定是否继续拆员工表单、工资明细表与参数表单 |
| V3-WS4 | Export Center 重构 | `codex/v3-export-center-rework` | ⏳ pending | — | — | 在 Payroll 之后重构导出交互层 |

## 3. 已完成分支与提交

### `codex/v3-design-system-foundation`
- `73402ac` 增加 Phase 0 计划
- `fe152ce` 设计系统底座实现

### `codex/v3-assistant-events-flow`
- `fee7916` Assistant / Events 入口壳重构
- `e796959` Assistant / Events 状态进一步下沉到子组件

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

## 4. 当前验证基线

已通过：
- `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/contracts/contracts-shell.test.tsx`

## 5. 下一步顺序

1. `codex/v3-payroll-page-rework`
2. `codex/v3-export-center-rework`
3. 根据重构结果回收 `Assistant / Events / Contracts` 的视觉一致性收口

## 6. 接续提示

- V3 分支当前是串行推进，不是并行合并状态。
- `codex/v3-contracts-page-rework` 已包含 `codex/v3-assistant-events-flow` 和 `codex/v3-design-system-foundation` 的基线。
- 新开 `codex/v3-payroll-page-rework` 时，建议从当前 contracts 分支切出，保持 V3 累积基线一致。
