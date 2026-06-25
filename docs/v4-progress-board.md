# V4 进度板

目标：真实业务验收与生产可靠性

基线：`origin/main@91e906c`

| 工作流 | 分支 | 状态 | 验收范围 |
|--------|------|------|----------|
| V4-0 基线与 E2E | `codex/v4-baseline-and-e2e` | `completed` | CI、测试数据、三条 baseline E2E、设计审计 |
| V4-1A 工作流运行时 | `codex/v4-workflow-runtime` | `in_progress` | 状态机、授权、幂等、补偿 |
| V4-1B 采购报销 | `codex/v4-expense-purchase-slice` | `pending` | 标准/异常路径生产门禁 |
| V4-2 差旅报销 | `codex/v4-travel-expense-slice` | `pending` | 标准/异常路径生产门禁 |
| V4-3 合同收入 | `codex/v4-contract-revenue-slice` | `pending` | 合同至申报闭环 |
| V4-4 任务与连接器 | `codex/v4-job-and-connectors` | `pending` | 重试、沙箱、文件交换 |
| V4-5 安全与运维 | `codex/v4-security-operations` | `pending` | 私有云生产认证 |

## V4-1A 当前完成

- API runtime 状态机、授权校验、命令幂等、补偿记录与 inspection/control routes 已落地。
- `workflow_runs / workflow_transition_records / workflow_command_executions / workflow_compensation_records` 已补真实 PostgreSQL 集成测试，覆盖写入、读取、失败重试、成功复用与人工补偿。
- 任务中心、税务中心、凭证中心、工资代发页已接入 workflow runtime 消费，页面可展示运行态、授权态、最近命令、重试次数、补偿记录与阻塞原因。

## V4-1A 剩余

- 将 runtime 展示继续下沉到更多业务页，补 drilldown 场景下的上下文联动。
- 继续补 route/db contract tests，覆盖更多业务对象接入后的稳定性。
- 评估是否把 retry / cancel / compensation 操作入口直接开放到前端工作台。
