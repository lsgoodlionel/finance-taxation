# V3 并行执行索引

> 目的：把当前 V3 剩余工作拆成可并行推进的子任务，供新窗口直接接续开发。
> 适用基线：`/Users/lionel/Develop/FT`
> 更新时间：`2026-05-28`

## 1. 并行执行原则

1. 不在同一个工作树里并发改代码。
2. 每个新窗口使用独立 worktree，对应独立分支。
3. 并行阶段只允许修改各自页面子目录和本页路由入口文件。
4. `docs/v3-progress-board.md`、`docs/v3-upgrade-spec.md`、`apps/web/src/styles/global.css` 属于共享文件，不在并行阶段修改。
5. 各分支完成后只回写本分支自己的 plan 文档；总进度板最后统一收口。

## 2. 当前可并行的任务车道

| 车道 | 分支 | 状态 | 并行安全级别 | 主要范围 | 当前剩余重点 |
| --- | --- | --- | --- | --- | --- |
| Lane A | `codex/v3-tax-center-rework` | 已有实现，待验证收口 | 高 | `apps/web/src/pages/tax/*`, `TaxPage.tsx` | Tax 页 summary-first 收口验证、响应式和空态一致性 |
| Lane B | `codex/v3-ledger-page-rework` | 进行中 | 高 | `apps/web/src/pages/ledger/*`, `LedgerPage.tsx` | table density、responsive、empty-state consistency |
| Lane C | `codex/v3-reports-page-rework` | 已有第一批实现 | 高 | `apps/web/src/pages/reports/*`, `ReportsPage.tsx` | 结果页摘要优先、图表/KPI 层次、快照/差异/老板摘要整合 |
| Lane D | `codex/v3-risk-page-rework` | 已有第一批实现 | 中 | `apps/web/src/pages/risk/*`, `apps/web/src/pages/audit/*`, `RiskPage.tsx`, `AuditPage.tsx`, 少量 `drilldown` | 风险闭环工作台、审计追溯台、上下文恢复与复盘链 |
| Lane E | `codex/v3-layout-visibility-polish` | 进行中 | 低，必须后置 | `global.css` + 多页面壳层 | 把可见性收口补到 `Tax / Ledger / Reports / Risk` |

## 3. 车道边界

### Lane A: Tax

- 可以修改：
  - `apps/web/src/pages/TaxPage.tsx`
  - `apps/web/src/pages/tax/*`
  - `docs/superpowers/plans/*tax*`
- 不要修改：
  - `apps/web/src/styles/global.css`
  - `docs/v3-progress-board.md`
  - 任何 `ledger / reports / risk / audit` 目录
- 完成定义：
  - `TaxPage` 结构与 V3 五页风格一致
  - summary-first 可见
  - 批次、资料、事项面板层级清楚
  - 现有税务计算/批次/打印逻辑不变

### Lane B: Ledger

- 可以修改：
  - `apps/web/src/pages/LedgerPage.tsx`
  - `apps/web/src/pages/ledger/*`
  - `docs/superpowers/plans/2026-05-28-v3-ledger-page-rework.md`
- 不要修改：
  - `apps/web/src/styles/global.css`
  - `docs/v3-progress-board.md`
  - 任何 `tax / reports / risk / audit` 目录
- 完成定义：
  - `summary / balances / journal / entries / periods` 五个场景都有一致的密度、空态和小屏布局
  - 过滤、锁账、查询逻辑保持不变

### Lane C: Reports

- 可以修改：
  - `apps/web/src/pages/ReportsPage.tsx`
  - `apps/web/src/pages/reports/*`
  - `docs/superpowers/plans/2026-05-27-reports-page-rework.md`
- 不要修改：
  - `apps/web/src/styles/global.css`
  - `docs/v3-progress-board.md`
  - 任何 `tax / ledger / risk / audit` 目录
- 完成定义：
  - 报表页形成稳定的 `header + sidebar + workbench`
  - KPI/图表/快照/差异/老板摘要都清楚分层
  - 数据 API 不变

### Lane D: Risk / Audit

- 可以修改：
  - `apps/web/src/pages/RiskPage.tsx`
  - `apps/web/src/pages/AuditPage.tsx`
  - `apps/web/src/pages/risk/*`
  - `apps/web/src/pages/audit/*`
  - 与风险工作台直接相关的 `apps/web/src/pages/drilldown.ts`、`apps/web/src/pages/risk-scope.ts`
  - `docs/superpowers/plans/2026-05-27-v3-risk-audit-workbench.md`
- 不要修改：
  - `apps/web/src/styles/global.css`
  - `docs/v3-progress-board.md`
  - 任何 `tax / ledger / reports` 目录
- 完成定义：
  - 风险关闭链和审计追溯链都可见
  - context restore 统一
  - 现有 drilldown 语义不被破坏

### Lane E: Layout Visibility Polish

- 只能在 Lane A-D 稳定后开始。
- 可以修改：
  - `apps/web/src/styles/global.css`
  - 各页壳层组件
- 目标：
  - 统一 hero、section、summary-first、empty state、button hierarchy
  - 不改业务逻辑

## 4. 推荐并行顺序

### 第一波并行

1. Lane A `Tax`
2. Lane B `Ledger`
3. Lane C `Reports`
4. Lane D `Risk / Audit`

### 第二波串行收口

5. Lane E `Layout Visibility Polish`
6. 统一更新 `docs/v3-progress-board.md`
7. 统一合回 `main`

## 5. 新窗口启动命令

> 说明：下面命令使用 repo 外 sibling 目录 `/Users/lionel/Develop/FT-worktrees`，避免 worktree 目录进入版本控制。

### Lane A: Tax

```bash
mkdir -p /Users/lionel/Develop/FT-worktrees
cd /Users/lionel/Develop/FT
git fetch origin
git worktree add /Users/lionel/Develop/FT-worktrees/v3-tax codex/v3-tax-center-rework
cd /Users/lionel/Develop/FT-worktrees/v3-tax
sed -n '1,240p' docs/v3-parallel-execution-index.md
sed -n '1,260p' docs/superpowers/plans/2026-05-27-v3-tax-center-rework.md 2>/dev/null || true
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
```

### Lane B: Ledger

```bash
mkdir -p /Users/lionel/Develop/FT-worktrees
cd /Users/lionel/Develop/FT
git fetch origin
git worktree add /Users/lionel/Develop/FT-worktrees/v3-ledger codex/v3-ledger-page-rework
cd /Users/lionel/Develop/FT-worktrees/v3-ledger
sed -n '1,240p' docs/v3-parallel-execution-index.md
sed -n '1,260p' docs/superpowers/plans/2026-05-28-v3-ledger-page-rework.md
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
```

### Lane C: Reports

```bash
mkdir -p /Users/lionel/Develop/FT-worktrees
cd /Users/lionel/Develop/FT
git fetch origin
git worktree add /Users/lionel/Develop/FT-worktrees/v3-reports codex/v3-reports-page-rework
cd /Users/lionel/Develop/FT-worktrees/v3-reports
sed -n '1,240p' docs/v3-parallel-execution-index.md
git show HEAD:docs/superpowers/plans/2026-05-27-reports-page-rework.md | sed -n '1,260p'
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
```

### Lane D: Risk / Audit

```bash
mkdir -p /Users/lionel/Develop/FT-worktrees
cd /Users/lionel/Develop/FT
git fetch origin
git worktree add /Users/lionel/Develop/FT-worktrees/v3-risk codex/v3-risk-page-rework
cd /Users/lionel/Develop/FT-worktrees/v3-risk
sed -n '1,240p' docs/v3-parallel-execution-index.md
git show HEAD:docs/superpowers/plans/2026-05-27-v3-risk-audit-workbench.md | sed -n '1,260p'
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
```

### Lane E: Layout Visibility Polish

```bash
mkdir -p /Users/lionel/Develop/FT-worktrees
cd /Users/lionel/Develop/FT
git fetch origin
git worktree add /Users/lionel/Develop/FT-worktrees/v3-visibility codex/v3-layout-visibility-polish
cd /Users/lionel/Develop/FT-worktrees/v3-visibility
sed -n '1,240p' docs/v3-parallel-execution-index.md
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
```

## 6. 每条车道的收尾验证

```bash
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
node --check src/scripts/app.js
find backend/src -name '*.js' -print0 | xargs -0 -n1 node --check
node tools/check-json.mjs backend/data
node tools/check-progress-board.mjs docs/v2-progress-board.md
git status
```

## 7. 统一集成时的顺序

1. 合回 `Tax`
2. 合回 `Ledger`
3. 合回 `Reports`
4. 合回 `Risk / Audit`
5. 最后执行 `Layout Visibility Polish`
6. 统一更新 `docs/v3-progress-board.md`
7. 重建并重启本地 Docker 验证 UI
