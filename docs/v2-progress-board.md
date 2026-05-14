# V2 进度板

> 本文件是 V2 开发的单一事实来源。所有人员、Agent、分支在开始任务、发生阻塞、提交合并前都应更新这里。

## 1. 当前阶段

- 当前目标：`Phase 1 统一业务对象与经营事项总线启动`
- 当前里程碑：`Phase 1`
- 更新时间：`2026-05-14`

## 2. 总览

| Workstream | Scope | Owner | Branch | Status | Last Update | Next Action | Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WS0 | 工程与架构底座 | Codex | main | done | 2026-05-14 | Sprint 0 底座已闭环，下一步进入 Phase 1 数据与业务实现 | 无 |
| WS1 | 前端应用骨架 | Codex | main | in_progress | 2026-05-14 | 开始承接 Phase 1 的经营事项列表、详情与任务中心页面 | 无 |
| WS2 | 认证、权限、组织 | Codex | main | in_progress | 2026-05-14 | 开始将 RBAC 文档转为数据库实体与中间件目录 | 无 |
| WS3 | 经营事项总线 | Codex | main | in_progress | 2026-05-14 | 开始将 `business_events` / `tasks` 转为正式存储与 API | 无 |
| WS4 | 单据、附件、归档 | TBD | TBD | not_started | 2026-05-14 | 将样例存储升级为正式文件服务 | 无 |
| WS5 | 账务内核 | TBD | TBD | not_started | 2026-05-14 | 设计正式过账服务与科目体系 | 无 |
| WS6 | 税务与申报准备 | TBD | TBD | not_started | 2026-05-14 | 设计税种与申报批次模型 | 无 |
| WS7 | 研发财税 | TBD | TBD | not_started | 2026-05-14 | 设计研发项目与辅助账模型 | 无 |
| WS8 | 风险勾稽与审计 | TBD | TBD | not_started | 2026-05-14 | 设计风险规则与勾稽事件模型 | 无 |
| WS9 | AI Agent 与知识库 | TBD | TBD | not_started | 2026-05-14 | 设计 Agent 协议与 Prompt 版本管理 | 无 |
| WS10 | DevOps、QA、发布 | Codex | main | done | 2026-05-14 | 依赖已安装，锁文件、PR 模板、Issue 模板和 typecheck 基线已就位 | 无 |

## 3. 当前优先任务

| Task ID | Task | Workstream | Owner | Branch | Status | Dependency | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TASK-00-01 | 建立前端正式工程目录 | WS0 | Codex | main | done | 无 | `apps/web` 已建立，与现有原型并存 |
| TASK-00-02 | 建立后端 TypeScript 工程目录 | WS0 | Codex | main | done | 无 | `apps/api` 已建立，保留现有 JS 骨架作为迁移参考 |
| TASK-00-03 | 建立共享类型与接口包 | WS0 | Codex | main | done | 无 | `packages/domain-model` 已扩展角色、组织、事项、任务类型 |
| TASK-00-04 | 建立 lint / format / typecheck / test 脚本 | WS10 | Codex | main | done | TASK-00-01 / 00-02 | 根目录已建立基础校验脚本 `npm run verify` |
| TASK-00-05 | 建立环境变量、配置和 secrets 规范 | WS0 | Codex | main | done | TASK-00-02 | `apps/api/.env.example` 和 `apps/web/.env.example` 已建立 |
| TASK-00-06 | 建立 migrations、seed、fixture 目录 | WS0 | Codex | main | done | TASK-00-02 | 已建立 `apps/api/migrations` 和 `entities.sql` 草案 |
| TASK-01-01 | 用户、角色、权限模型设计 | WS2 | Codex | main | done | TASK-00-02 | `docs/rbac-organization-model.md` 已落地 |
| TASK-02-01 | `business_events` 数据模型 | WS3 | Codex | main | done | TASK-00-02 | 共享类型与 `docs/business-events-task-model.md` 已落地 |
| TASK-03-01 | 董事长首页基础卡片 | WS1 | Codex | main | done | TASK-00-01 | `apps/web/src/App.tsx` 已承接静态骨架 |
| TASK-01-02 | JWT + refresh token 设计与实现 | WS2 | Codex | main | not_started | TASK-01-01 | Phase 1 首批任务 |
| TASK-01-03 | 企业隔离与部门隔离 | WS2 | Codex | main | not_started | TASK-01-01 | Phase 1 首批任务 |
| TASK-02-02 | 经营事项创建、编辑、状态流 API | WS3 | Codex | main | not_started | TASK-02-01 | Phase 1 首批任务 |
| TASK-02-04 | 经营事项列表、详情、时间轴页面 | WS1 | Codex | main | not_started | TASK-02-01 | Phase 1 首批任务 |
| TASK-02-05 | 事项到任务自动拆解机制 | WS3 | Codex | main | not_started | TASK-02-01 / 05-01 | Phase 1 首批任务 |
| TASK-04-01 | 自然语言交办入口 | WS9 | TBD | TBD | not_started | TASK-00-01 / 02-01 | 与现有行为录入合并设计 |
| TASK-05-01 | 任务模型设计 | WS3 | Codex | main | done | TASK-02-01 | 已并入共享领域模型与事件关系设计 |
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

## 6. Sprint 0 已落地内容

- 已建立 `apps/web` 正式前端工程目录
- 已建立 `apps/api` 正式后端 TypeScript 工程目录
- 已建立 `packages/domain-model` 共享领域类型包
- 已建立根目录 `package.json` 与 `npm run verify`
- 已建立根目录 `npm run typecheck:v2` 脚本定义
- 已建立 `tools/check-json.mjs` 与 `tools/check-progress-board.mjs`
- 已建立 PR 模板与 Issue 模板作为协作提交基线
- 已安装 workspace 依赖并生成 `package-lock.json`
- 已建立 RBAC 与组织模型设计文档
- 已建立 `business_events` 与 `tasks` 统一对象设计文档
- 已建立董事长首页静态骨架与 V2 API 元信息占位接口
- 已建立 V2 前端路由 / layout 基线
- 已建立 V2 后端模块目录和数据库实体草案
- 已建立前后端 `.env.example` 基线

## 7. Phase 1 启动任务

- 将 `business_events` 和 `tasks` 从共享类型推进为正式存储模型
- 建立经营事项创建、编辑、查询、详情、状态流 API
- 建立任务树与自动拆解接口
- 承接经营事项列表、详情、时间轴页面
- 将 RBAC 文档推进为正式认证、菜单、数据隔离实现
