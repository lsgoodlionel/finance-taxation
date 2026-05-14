# V2 进度板

> 本文件是 V2 开发的单一事实来源。所有人员、Agent、分支在开始任务、发生阻塞、提交合并前都应更新这里。

## 1. 当前阶段

- 当前目标：`V2 方案与工程协作机制建立`
- 当前里程碑：`Sprint 0`
- 更新时间：`2026-05-14`

## 2. 总览

| Workstream | Scope | Owner | Branch | Status | Last Update | Next Action | Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WS0 | 工程与架构底座 | TBD | TBD | not_started | 2026-05-14 | 明确正式前后端目录结构 | 无 |
| WS1 | 前端应用骨架 | TBD | TBD | not_started | 2026-05-14 | 建立正式 React + TS 工程 | 无 |
| WS2 | 认证、权限、组织 | TBD | TBD | not_started | 2026-05-14 | 设计正式 RBAC 和 token 刷新 | 无 |
| WS3 | 经营事项总线 | TBD | TBD | not_started | 2026-05-14 | 建立 `business_events` 模型 | 无 |
| WS4 | 单据、附件、归档 | TBD | TBD | not_started | 2026-05-14 | 将样例存储升级为正式文件服务 | 无 |
| WS5 | 账务内核 | TBD | TBD | not_started | 2026-05-14 | 设计正式过账服务与科目体系 | 无 |
| WS6 | 税务与申报准备 | TBD | TBD | not_started | 2026-05-14 | 设计税种与申报批次模型 | 无 |
| WS7 | 研发财税 | TBD | TBD | not_started | 2026-05-14 | 设计研发项目与辅助账模型 | 无 |
| WS8 | 风险勾稽与审计 | TBD | TBD | not_started | 2026-05-14 | 设计风险规则与勾稽事件模型 | 无 |
| WS9 | AI Agent 与知识库 | TBD | TBD | not_started | 2026-05-14 | 设计 Agent 协议与 Prompt 版本管理 | 无 |
| WS10 | DevOps、QA、发布 | TBD | TBD | not_started | 2026-05-14 | 补 CI/CD、PR 模板、测试策略 | 无 |

## 3. 当前优先任务

| Task ID | Task | Workstream | Owner | Branch | Status | Dependency | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-00-01 | 建立前端正式工程目录 | WS0 | TBD | TBD | not_started | 无 | 先与现有原型并存 |
| TASK-00-02 | 建立后端 TypeScript 工程目录 | WS0 | TBD | TBD | not_started | 无 | 保留现有 JS 骨架作为迁移参考 |
| TASK-00-04 | 建立 lint / format / typecheck / test 脚本 | WS10 | TBD | TBD | not_started | TASK-00-01 / 00-02 | 作为合并门禁 |
| TASK-01-01 | 用户、角色、权限模型设计 | WS2 | TBD | TBD | not_started | TASK-00-02 | 先出 ER 图与 API |
| TASK-02-01 | `business_events` 数据模型 | WS3 | TBD | TBD | not_started | TASK-00-02 | V2 核心对象 |
| TASK-03-01 | 董事长首页基础卡片 | WS1 | TBD | TBD | not_started | TASK-00-01 | 先做静态骨架 |
| TASK-04-01 | 自然语言交办入口 | WS9 | TBD | TBD | not_started | TASK-00-01 / 02-01 | 与现有行为录入合并设计 |
| TASK-05-01 | 任务模型设计 | WS3 | TBD | TBD | not_started | TASK-02-01 | 支持子任务树 |
| TASK-06-02 | 附件 multipart 上传 | WS4 | TBD | TBD | not_started | TASK-00-02 | 替代当前 base64 流程 |
| TASK-07-01 | 科目体系与辅助核算 | WS5 | TBD | TBD | not_started | TASK-00-02 | 与报表口径保持一致 |

## 4. 风险清单

| Risk ID | Description | Severity | Owner | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| R-001 | 当前前端原型与未来正式前端工程可能长期并存，造成双线维护成本 | high | TBD | 明确 `prototype` 与 `app` 的边界和迁移时点 | open |
| R-002 | AI 财税建议若无制度库和口径版本，容易出现同类问题多答案 | high | TBD | 先做规则、Prompt、口径版本化 | open |
| R-003 | 账务内核、税务口径、研发口径若并行无统一对象模型，后期返工很大 | high | TBD | 先锁定 `business_events`、`tasks`、`vouchers`、`tax_items` 模型 | open |
| R-004 | 多 Agent 同时改动共享目录会产生高冲突率 | medium | TBD | 用工作流分区、目录所有权、集成窗口控制 | open |

## 5. 更新规范

- 新建任务前先在本页登记
- 分支创建后立刻填入 `Branch`
- 状态变更时必须更新 `Last Update`
- 出现阻塞必须填 `Blocker`
- 合并完成后将状态改为 `done`
