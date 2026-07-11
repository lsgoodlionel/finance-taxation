# Workflow Runtime Runbook

## Scope

V4-1A 为统一工作流运行时提供四类能力：

- 工作流状态机与迁移留痕
- 高风险动作授权与职责分离校验
- 幂等命令执行、重试与取消
- 失败后的补偿与人工接管

## 操作入口

- `GET /api/workflows/runs`
- `GET /api/workflows/runs/:id`
- `GET /api/workflows/commands`
- `POST /api/workflows/commands/:id/retry`
- `POST /api/workflows/commands/:id/cancel`
- `POST /api/workflows/commands/:id/compensations`

## 查看失败与阻塞

重点字段：

- `status`
- `attemptCount`
- `nextRetryAt`
- `lastErrorCode`
- `lastErrorDetail`
- `authorizerUserId`
- `resultSnapshot`

高风险动作可由页面或上游工作流显式传入：

- `authorizerUserId`
- `authorizerName`

未接入正式审批流的兼容阶段，可回退为当前操作人；正式验收前应替换为真实最终授权人。

失败后优先判断：

1. 是否命中职责分离或授权拒绝。
2. 是否为重复幂等键导致的复用。
3. 是否需要补件或人工接管，而不是继续重试。

## 重试规则

- 仅 `failed` 状态且 `retryPolicy.maxAttempts > attemptCount` 的命令允许重试。
- 重试会保留原 `idempotencyKey`，并累计 `attemptCount`。
- 已 `succeeded` 的命令不得再次执行；会直接复用既有结果。

## 取消规则

- 仅 `waiting` 或 `running` 状态允许取消。
- 取消后状态转为 `cancelled`，并在详情中保留时间和操作者。

## 补偿与人工接管

- 对无法自动恢复的命令创建 compensation 记录。
- `actionType` 可标记为 `manual_takeover`、`rollback`、`document_repair` 等。
- 补偿记录必须写明原因、交接人、备注。

## 审计要求

所有工作流迁移和命令变更都必须同时满足：

- 在 runtime 表中可追溯
- 在 `audit_logs` 中有业务审计
- 能回看到对象、操作者、依据、规则版本和相关资料
