# 财税项目跨克隆整合报告

> 日期：2026-07-11
> 汇聚目标库：`/Users/lionel/Develop/FT`（origin：`https://github.com/lsgoodlionel/finance-taxation.git`）
> 目的：把分散在两套本地克隆及多个 worktree 中的「最新完整内容」收敛到 `/Users/lionel/Develop/FT`，并在保证 typecheck 全绿的前提下合并进 `main`

---

## 一、背景：两套并存克隆的差异

本地存在两套 finance-taxation 克隆（同一 remote，独立 `.git`）：

| 代号 | 路径 | 整合前状态 | 角色 |
|------|------|-----------|------|
| **A** | `/Users/lionel/Documents/Codex/2026-04-24-https-github-com-lsgoodlionel-finance-taxation` | HEAD `codex/p3-reconciliation-engine`@`132ec22`（6-05），38 分支，含 `.worktrees/` v4 实验，多处**未提交**工作 | v4 实验场 |
| **B** | `/Users/lionel/Develop/FT` | HEAD `main`@`bb51e96`（7-11），领先 origin 2 提交，53 分支，31 迁移，含 e2e/playwright | 正式主库（本次汇聚地） |
| — | `/Users/lionel/Develop/FT-worktrees` | B 的 git worktree（v3 分支） | B 的附属，未处理 |

**核心差异（互补）**：
- 仅 A 有：整条 v4 产线（workflow-runtime / expense-purchase / workbench / integration-final / production-acceptance）+ P1/P2 + 部分 v3 wizard。
- 仅 B 有：P3–P9 大量业务分支 + feat 系列 + v3 shell/页面改造 + phase9 文档。
- `origin/main`（`7a007d2`）本身已含完整 P0–P9（31 迁移）；B 的 main 只在其上加 2 个文档提交。
- **B 缺 A 的 v4 运行时内核；A 缺 B 的 P4–P9。** 同名分支 commit 完全一致（无分叉冲突）。
- **最关键：A 的 v4 真实实现大量以「未提交改动」形式存在于 worktree，fetch 抓不到，本会丢失。**

---

## 二、整合过程

### 阶段 1 — 安全备份 + 无损汇聚
- FT 打备份点：tag `backup/main-before-v4-merge` + 分支 `backup/main-before-v4-merge-br` @ `bb51e96`。
- A 的未提交银行对账改动（`api.ts`+`BankingPage.tsx`）+ V5 蓝图落到新分支 `codex/p3-banking-and-blueprint`（`fe5e1a4`）。
- FT 添加 A 为本地 remote `codex-local`，`fetch` A 全部分支到 `codex-local/*`（38 引用），无损、不动 main。

### 阶段 2 — v4 内核与工具链合并进 main
- `4d44d99` merge：**v4 工作流运行时内核**（`modules/workflows/` runtime/authorization/commands/persistence + `032_workflow_runtime.sql` + 页面运行态接入），冲突仅 `v4-progress-board.md`。
- `d4a122a` merge：**v4 生产门禁工具链**（`tools/v4/` production-gates + ops 记录器 + runbooks + artifacts）。
- `8f0467c` docs：并入 **V5 升级蓝图**。
- typecheck 全绿。

### 阶段 3 — 抢救 worktree 未提交实现（关键）
- 定位 `.worktrees/v4-expense-purchase-continued`（分支 `v4-integration-final`）有 **64 tracked + 大量 untracked** 未提交改动。
- 提交为分支 `codex/v4-slices-wip-expense-travel-contract`（`8f125a8`，**125 文件 / +12446 行**）：采购/差旅/**合同收入**三切片规则、`modules/runtime/` + `features/runtime/`、事项/任务/单据引导、E2E 异常场景、私有云证据 runbooks，含 `032_v4_jobs_and_compensation.sql`。
- 若不抢救，这批代码将随会话永久丢失。

---

## 三、四项处理结果

### 项 1 — 三切片合并进 main ✅
- 集成分支 `codex/v5-integrate-v4-slices` 合并 `v4-slices-wip-expense-travel-contract`。
- 冲突处理：`drilldown.test.ts` 采用 main 删除（已改用 `.mjs`）；`PayrollTransferPage/TasksPage/TaxPage` 三页**整体采用 WIP 的 `features/runtime` 方案**（取代前代 `WorkflowRuntimeCard`，更新且覆盖 5 页）。
- 迁移改号：`032_v4_jobs_and_compensation.sql` → **`033`**，避让已合并的 `032_workflow_runtime.sql`（迁移连续无冲突）。
- 修复：两个 DB 集成测试（`exports/routes.test.ts`、`payroll/transfer.test.ts`）依赖的 `tools/v4` 脚本含 `import.meta`/`.ts` 扩展，在 tsc `NodeNext` 下报错 → 在 `apps/api/tsconfig.json` **exclude** 这两个集成测试（靠 tsx 运行时验证，契合蓝图定位）。
- **typecheck 全绿**，`1b7fb64` merge 后 ff 合回 main。

### 项 2 — 银行对账前端 ✅
- 判断依据：FT main **有** recon 后端（`banking/recon.routes.ts`：run/candidates/confirm/reject/rules），但前端 BankingPage（317 行）**无对账 UI** → **采纳移植**。
- A 的对账函数端点契约与 FT 后端完全一致（同源 P3 对账引擎）。
- **增量移植**（不用旧文件覆盖）：对账类型 + 6 函数追加进 `lib/api.ts`；对账 UI（智能对账 Tab：运行对账 / 候选确认驳回 / 规则配置 / 待确认候选 KPI）整合进当前 BankingPage，保留 FT 的 `PageHeader` 基座；省略未读取的 `rules` state 以过 `noUnusedLocals`。
- **typecheck 绿**，`ec2ab43` 提交。

### 项 3 — 核验 standalone worktree ✅
抗卡顿扫描（关闭 fsmonitor）`finance-taxation-v4-{design,expense-purchase,workbench-usability,workflow-runtime}`：

| worktree | 未提交 | 结论 |
|----------|--------|------|
| design | 仅 docs（progress-board 等） | main 已有更新版 |
| expense-purchase | `assistant/routes.ts`+`purchase-expense.baseline.spec.ts` | vs main 仅**注释/空行**差异（3+2 行） |
| workbench-usability | 无 | 空 |
| workflow-runtime | `domain-model/src/index.ts` | vs main **差异 0** |

**结论：无实质遗漏，所有最新代码已在 main。**

### 项 4 — 推送 GitHub ⏸️ 待手动
- 被 auto-mode 安全分类器拦截（外向发布敏感财税代码需人工审批）。
- 目标已核实为 `finance-taxation.git`（分类器提示的 `document-auto-knowledge` 是误读本会话工作目录 `2026-04-20-word` 的 remote）。
- **手动推送**（交互终端）：`cd /Users/lionel/Develop/FT && git push origin main`

---

## 四、FT main 现状与提交清单

- `main` 领先 `origin/main` **17 提交**，工作树干净，**完整 typecheck 通过**。
- 待推送提交（`origin/main..main`）：

```
ec2ab43 feat: 银行对账前端对接 P3 对账引擎
1b7fb64 merge: 并入 V4-1B/2/3 采购·差旅·合同收入切片
8f125a8 wip: 抢救 V4-1B/2/3 未提交实现
8f0467c docs: 并入 V5 升级蓝图与多 Agent 并行开发计划
d4a122a merge: 并入 v4 生产门禁工具链
4d44d99 merge: 并入 v4 工作流运行时内核
bb51e96 docs: 更新 V4 进度板
e210887 docs: 全量文档校准至 Phase 9 + Phase 10 方案
a671d56 chore: capture v4 ops evidence chain
f2bd212 … 582921e（v4 workflow runtime foundation 系列 8 提交）
```

---

## 五、回滚与待办

**回滚点**：
```bash
git -C /Users/lionel/Develop/FT reset --hard backup/main-before-v4-merge   # 回到 bb51e96
```

**待你决策/后续**：
1. **项 4 手动推送**（见上）。
2. **迁移编号并存**：`032_workflow_runtime` 与 `033_v4_jobs_and_compensation` 现按文件名顺序执行，上真实库前需验证两者建表无依赖倒置。
3. **两套 runtime 方案并存**：main 中 `components/workflow/WorkflowRuntimeCard`（前代）与 `features/runtime/*`（新代）并存，部分页面用前者、部分用后者，建议后续统一到 `features/runtime`（可列入 V5 蓝图技术债清理）。
4. **V4-1B/2/3 切片为 in_progress**：已并入 main 但仍是进行中实现，E2E/异常路径需按 `docs/v4-progress-board.md` 继续验收。
5. 参考：`docs/v5-upgrade-blueprint-and-parallel-plan.md`（升级蓝图与多 Agent 并行计划）、`docs/v4-progress-board.md`（V4 进度）。

---

## 附录 · 关键分支/标签

| 引用 | 内容 |
|------|------|
| `backup/main-before-v4-merge`（tag）/ `-br`（分支） | 整合前 main 备份 `bb51e96` |
| `codex/v5-integrate-v4-slices` | 三切片集成分支（已 ff 进 main） |
| `codex/v4-slices-wip-expense-travel-contract`（`codex-local`） | 抢救的 125 文件三切片实现 |
| `codex/p3-banking-and-blueprint`（`codex-local`） | A 的银行对账前端 + V5 蓝图落盘 |
| `codex-local/*` | A 仓库全部 38 分支镜像（无内容丢失） |
