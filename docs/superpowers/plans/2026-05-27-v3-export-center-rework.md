# 2026-05-27 V3 Export Center Rework

**Branch:** `codex/v3-export-center-rework`  
**Source of truth:** `docs/v3-upgrade-spec.md` section `3-B: PdfExportPage（导出中心）— 场景卡片化`

## Goal

在不改动现有导出接口、对象模型和打印逻辑的前提下，把 `PdfExportPage`
从“8 个 tab 平铺的功能页”重构成 “场景选择 -> 配置/结果 -> 导出历史/归档”
的 V3 页面骨架。

## Constraints

- 保持现有 API 调用不变
- 保持现有导出打开、状态更新、归档过滤逻辑不变
- 第一批只重构交互层和组件结构，不拆每个导出场景内部业务块

## Tasks

### Task 1. 页面骨架和场景入口
- [x] `ExportShell`
- [x] `ExportHeader`
- [x] `ExportSceneSelector`
- [x] `PdfExportPage` 顶层接入

### Task 2. 结果面板拆分
- [x] 导出历史面板
- [x] 归档索引面板
- [ ] 导出审计轨迹面板

### Task 3. 场景区拆分
- [ ] Reports
- [ ] Tax
- [ ] Packages
- [ ] Documents
- [ ] Risk
- [ ] Rnd
- [ ] Payroll
- [ ] Vouchers

### Task 4. Summary-first 收口
- [ ] 场景摘要优先
- [ ] 配置区与结果区层级整理
- [ ] 批量导出操作统一

## Verification

- `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
- `/Applications/Codex.app/Contents/Resources/node --import tsx apps/web/src/pages/export/export-shell.test.tsx`
