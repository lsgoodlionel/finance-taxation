# V4 进度板

目标：真实业务验收与生产可靠性（从"演示可用"推进到"生产可部署"）

基线：`origin/main@91e906c`（Phase 0–9 全部完成）
更新时间：2026-06-08 · 对应 `main@e210887`

## 工作流状态

| 工作流 | 分支 | 状态 | 验收范围 |
|--------|------|------|----------|
| V4-0 基线与 E2E | `codex/v4-baseline-and-e2e` | 🟢 **基本完成** | CI、测试数据、三条 baseline E2E、设计审计 |
| V4-1A 工作流运行时 | `codex/v4-workflow-runtime` | ⏳ pending | 状态机、授权、幂等、补偿 |
| V4-1B 采购报销 | `codex/v4-expense-purchase-slice` | ⏳ pending | 标准/异常路径生产门禁 |
| V4-2 差旅报销 | `codex/v4-travel-expense-slice` | ⏳ pending | 标准/异常路径生产门禁 |
| V4-3 合同收入 | `codex/v4-contract-revenue-slice` | ⏳ pending | 合同至申报闭环 |
| V4-4 任务与连接器 | `codex/v4-job-and-connectors` | ⏳ pending | 重试、沙箱、文件交换 |
| V4-5 安全与运维 | `codex/v4-security-operations` | ⏳ pending | 私有云生产认证 |

## V4-0 已交付（17 提交，已并入 main）

- **隔离测试栈**：`docker-compose.test.yml` + 独立项目名 `finance-taxation-v4-test`（不碰生产/开发库）
- **测试数据工具**：`tools/v4/` — `fixture-schema`（+test）、`reset-test-db`（+test）、`seed-acceptance-data`（+test）、`run-web-tests`、`typecheck`
- **确定性 fixtures**：`tests/fixtures/v4/` — companies / users / 采购报销 / 差旅报销 / 合同收入
- **三条 baseline E2E**：`tests/e2e/scenarios/` — `purchase-expense` / `travel-expense` / `contract-revenue`（Playwright）
- **登录/导航冒烟 + auth 合约加固**：`middleware/auth`、`utils/body`、`contracts` 去重与摘要单测
- **脚本**：`npm run v4:test:setup` / `test:e2e` / `v4:report` / `verify:v4`

## V4-0 收尾项（进入 V4-1A 前）

- [ ] baseline E2E 在隔离栈中稳定绿（`v4:test:setup && test:e2e`）
- [ ] `verify:v4` 纳入 CI 门禁
- [ ] 验收报告 `v4:report` 输出基线快照

## 后续工作流要点（V4-1A → V4-5）

- **V4-1A 工作流运行时**：为业务切片提供统一状态机 + 授权校验 + 幂等键 + 失败补偿（其余切片依赖此底座，应先行）。
- **V4-1B/2/3 三条业务切片**：在 baseline 之上补「标准路径 + 异常路径」生产门禁断言（缺票/超额/驳回/重复提交）。
- **V4-4 任务与连接器**：异步任务重试、外部连接器沙箱、文件交换往返验收。
- **V4-5 安全与运维**：对齐 `docs/upgrade-plan-phase10.md` 的 10-A 安全加固（CSRF/CSP/Rate Limit/输入校验/脱敏）+ 运维（日志/监控/备份）。

## 与 Phase 10+ 路线图的关系

V4 是 `docs/upgrade-plan-phase10.md` 中 **Phase 10（质量加固与生产就绪）** 的具体执行轨道，聚焦 10-A 安全 + 10-B 测试覆盖。Phase 11（多租户）/12（数据智能）/13（外部集成）/14（移动体验）在 V4 稳定后按该路线图推进。

## 新窗口接力

1. 先读本文件 + `docs/superpowers/specs/2026-06-22-v4-production-acceptance-design.md`（设计）与 `plans/2026-06-22-v4-baseline-and-e2e.md`（计划）。
2. 从 `main` 切 `codex/v4-workflow-runtime` 开始 V4-1A。
3. 每切片：先补 fixtures → E2E 标准/异常路径 → 后端门禁 → `verify:v4` 绿 → 合回 main。
