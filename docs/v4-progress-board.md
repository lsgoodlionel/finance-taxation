# V4 进度板

目标：真实业务验收与生产可靠性（从"演示可用"推进到"生产可部署"）

基线：`origin/main@91e906c`（Phase 0–9 全部完成）
更新时间：2026-07-11 · **v4 工作流运行时（V4-1A）已并入 `main`**

## 工作流状态

| 工作流 | 分支 | 状态 | 验收范围 |
|--------|------|------|----------|
| V4-0 基线与 E2E | `codex/v4-baseline-and-e2e` | `completed` | CI、测试数据、三条 baseline E2E、设计审计 |
| V4-1A 工作流运行时 | `codex/v4-workflow-runtime-continued` | `in_progress`（内核已并入 main） | 状态机、授权、幂等、补偿、运行态透出 |
| V4-1B 采购报销 | `codex/v4-expense-purchase-slice` | `pending` | 标准/异常路径生产门禁 |
| V4-2 差旅报销 | `codex/v4-travel-expense-slice` | `pending` | 标准/异常路径生产门禁 |
| V4-3 合同收入 | `codex/v4-contract-revenue-slice` | `pending` | 合同至申报闭环 |
| V4-4 任务与连接器 | `codex/v4-job-and-connectors` | `pending` | 重试、沙箱、文件交换 |
| V4-5 安全与运维 | `codex/v4-security-operations` | `pending` | 私有云生产认证 |

## V4-0 已交付（17 提交，已并入 main）

- **隔离测试栈**：`docker-compose.test.yml` + 独立项目名 `finance-taxation-v4-test`（不碰生产/开发库）
- **测试数据工具**：`tools/v4/` — `fixture-schema`（+test）、`reset-test-db`（+test）、`seed-acceptance-data`（+test）、`run-web-tests`、`typecheck`
- **确定性 fixtures**：`tests/fixtures/v4/` — companies / users / 采购报销 / 差旅报销 / 合同收入
- **三条 baseline E2E**：`tests/e2e/scenarios/` — `purchase-expense` / `travel-expense` / `contract-revenue`（Playwright）
- **登录/导航冒烟 + auth 合约加固**：`middleware/auth`、`utils/body`、`contracts` 去重与摘要单测
- **脚本**：`npm run v4:test:setup` / `test:e2e` / `v4:report` / `verify:v4`

## V4-1A 当前完成（已并入 main）

- API runtime 状态机、授权校验、命令幂等、补偿记录与 inspection/control routes 已落地（`apps/api/src/modules/workflows/`：runtime / authorization / commands / persistence / routes）。
- `workflow_runs / workflow_transition_records / workflow_command_executions / workflow_compensation_records` 已补真实 PostgreSQL 集成测试（`persistence.integration.test.ts`），覆盖写入、读取、失败重试、成功复用与人工补偿；schema 见 `migrations/032_workflow_runtime.sql`。
- 任务中心、税务中心、凭证中心、工资代发页已接入 workflow runtime 消费（`WorkflowRuntimeCard`），页面可展示运行态、授权态、最近命令、重试次数、补偿记录与阻塞原因。

## V4-1A 剩余

- 将 runtime 展示继续下沉到更多业务页，补 drilldown 场景下的上下文联动。
- 继续补 route/db contract tests，覆盖更多业务对象接入后的稳定性。
- 评估是否把 retry / cancel / compensation 操作入口直接开放到前端工作台。

## 后续工作流要点（V4-1B → V4-5）

- **V4-1B/2/3 三条业务切片**：在 baseline + 运行时之上补「标准路径 + 异常路径」生产门禁断言（缺票/超额/驳回/重复提交）。
- **V4-4 任务与连接器**：异步任务重试、外部连接器沙箱、文件交换往返验收。
- **V4-5 安全与运维**：对齐 `docs/upgrade-plan-phase10.md` 的 10-A 安全加固（CSRF/CSP/Rate Limit/输入校验/脱敏）+ 运维（日志/监控/备份）。

## 与 Phase 10+ 路线图的关系

V4 是 `docs/upgrade-plan-phase10.md` 中 **Phase 10（质量加固与生产就绪）** 的具体执行轨道，聚焦 10-A 安全 + 10-B 测试覆盖。更全面的收敛与前沿升级见 `docs/v5-upgrade-blueprint-and-parallel-plan.md`。Phase 11（多租户）/12（数据智能）/13（外部集成）/14（移动体验）在 V4 稳定后按路线图推进。

## 新窗口接力

1. 先读本文件 + `docs/v5-upgrade-blueprint-and-parallel-plan.md` + `docs/superpowers/specs/2026-06-22-v4-production-acceptance-design.md`（设计）。
2. V4-1A 运行时内核已在 main；从 `main` 切 `codex/v4-expense-purchase-slice` 等切片分支继续 V4-1B。
3. 每切片：先补 fixtures → E2E 标准/异常路径 → 后端门禁 → `verify:v4` 绿 → 合回 main。
