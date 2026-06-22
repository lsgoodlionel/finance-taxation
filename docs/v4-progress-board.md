# V4 进度板

目标：真实业务验收与生产可靠性

基线：`origin/main@91e906c`

| 工作流 | 分支 | 状态 | 验收范围 |
|--------|------|------|----------|
| V4-0 基线与 E2E | `codex/v4-baseline-and-e2e` | `in_progress` | CI、测试数据、三条 baseline E2E、设计审计 |
| V4-1A 工作流运行时 | `codex/v4-workflow-runtime` | `pending` | 状态机、授权、幂等、补偿 |
| V4-1B 采购报销 | `codex/v4-expense-purchase-slice` | `pending` | 标准/异常路径生产门禁 |
| V4-2 差旅报销 | `codex/v4-travel-expense-slice` | `pending` | 标准/异常路径生产门禁 |
| V4-3 合同收入 | `codex/v4-contract-revenue-slice` | `pending` | 合同至申报闭环 |
| V4-4 任务与连接器 | `codex/v4-job-and-connectors` | `pending` | 重试、沙箱、文件交换 |
| V4-5 安全与运维 | `codex/v4-security-operations` | `pending` | 私有云生产认证 |
