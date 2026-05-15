# V2 进度板

> 本文件是 V2 开发的单一事实来源。所有人员、Agent、分支在开始任务、发生阻塞、提交合并前都应更新这里。

## 1. 当前阶段

- 当前目标：`Phase 2 权限体系、科目主数据、驾驶舱真实数据、附件上传`
- 当前里程碑：`Phase 2 - Sprint 1`
- 更新时间：`2026-05-14`

## 2. 总览

| Workstream | Scope | Owner | Branch | Status | Last Update | Next Action | Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WS0 | 工程与架构底座 | Codex | main | done | 2026-05-14 | Sprint 0 底座已闭环，下一步进入 Phase 1 数据与业务实现 | 无 |
| WS1 | 前端应用骨架 | Codex | main | in_progress | 2026-05-14 | 已接入事项、任务、单据、凭证、税务、总账页，并承接主要对象详情与动作 | 无 |
| WS2 | 认证、权限、组织 | Codex | main | in_progress | 2026-05-14 | 已实现 access/refresh token 与公司、部门两级最小数据边界，下一步补正式权限中间件 | 无 |
| WS3 | 经营事项总线 | Codex | main | in_progress | 2026-05-14 | 已实现事项创建、更新、分析、活动记录、映射快照和幂等分析替换 | 无 |
| WS4 | 单据、附件、归档 | Codex | main | in_progress | 2026-05-14 | 已支持 documents 附件记录、绑定与归档，下一步接正式文件服务和前端详情承接 | 无 |
| WS5 | 账务内核 | Codex | main | in_progress | 2026-05-14 | 已支持 vouchers 过账生成 ledger entries 与 posting batches，下一步接总账详情与科目余额 | 无 |
| WS6 | 税务与申报准备 | Codex | main | in_progress | 2026-05-14 | 已支持 tax_filing_batches 详情、校验、提交，下一步接批次状态流和留档 | 无 |
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
| TASK-01-02 | JWT + refresh token 设计与实现 | WS2 | Codex | main | in_progress | TASK-01-01 | 已具备 access/refresh token 最小闭环，后续补轮换与撤销细化 |
| TASK-01-03 | 企业隔离与部门隔离 | WS2 | Codex | main | in_progress | TASK-01-01 | 已按 company 和 department 收缩数据范围，后续补细粒度 RBAC |
| TASK-02-02 | 经营事项创建、编辑、状态流 API | WS3 | Codex | main | in_progress | TASK-02-01 | 已支持列表、创建、详情、更新、分析 |
| TASK-02-04 | 经营事项列表、详情、时间轴页面 | WS1 | Codex | main | in_progress | TASK-02-01 | 已支持列表、详情、状态编辑、时间轴、任务树和映射展示 |
| TASK-02-05 | 事项到任务自动拆解机制 | WS3 | Codex | main | in_progress | TASK-02-01 / 05-01 | 已支持父子任务树与 AI 任务拆解，重复分析会替换既有 AI 任务 |
| TASK-02-06 | 事项到单据/税务/凭证映射 | WS3 | Codex | main | in_progress | TASK-02-02 / 02-05 | 已输出映射快照并同步生成正式 documents、tax_items、vouchers 对象 |
| TASK-04-02 | 单据对象详情与状态流 | WS4 | Codex | main | in_progress | TASK-02-06 | 已支持 documents 列表、详情、状态更新、附件记录、绑定、归档 |
| TASK-05-02 | 凭证对象详情与过账前状态流 | WS5 | Codex | main | in_progress | TASK-02-06 | 已支持 vouchers 列表、详情、校验、审核、过账与过账记录 |
| TASK-05-03 | 总账分录与过账批次占位接口 | WS5 | Codex | main | in_progress | TASK-05-02 | 已支持 ledger entries、posting batches、summary 与前端占位页 |
| TASK-06-01 | 税务事项详情与处理状态流 | WS6 | Codex | main | in_progress | TASK-02-06 | 已支持 tax_items 列表、详情、状态更新，并支持申报批次详情、校验、提交 |
| TASK-04-01 | 自然语言交办入口 | WS9 | TBD | TBD | not_started | TASK-00-01 / 02-01 | 与现有行为录入合并设计 |
| TASK-05-01 | 任务模型设计 | WS3 | Codex | main | done | TASK-02-01 | 已并入共享领域模型与事件关系设计 |
| TASK-06-02 | 附件 multipart 上传 | WS4 | Codex | main | done | TASK-00-02 | busboy multipart 解析，文件落盘至 data/uploads/ |
| TASK-07-01 | 科目体系与辅助核算 | WS5 | Codex | main | done | TASK-00-02 | 小企业会计准则 60+ 科目，GET /api/accounts 已上线 |

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

## 8. Phase 1 当前进展

- 已实现 `POST /api/auth/login`
- 已实现 `POST /api/auth/refresh`
- 已实现 `GET /api/access/me`
- 已实现 `GET /api/access/menu`
- 已实现 `GET /api/events`
- 已实现 `POST /api/events`
- 已实现 `GET /api/events/:id`
- 已实现 `PUT /api/events/:id`
- 已实现 `POST /api/events/:id/analyze`
- 已实现 `GET /api/tasks`
- 已实现 `GET /api/documents`
- 已实现 `GET /api/documents/:id`
- 已实现 `PUT /api/documents/:id`
- 已实现 `POST /api/documents/:id/attach`
- 已实现 `POST /api/documents/:id/archive`
- 已实现 `GET /api/documents/:id/attachments`
- 已实现 `GET /api/tax-items`
- 已实现 `GET /api/tax-items/:id`
- 已实现 `PUT /api/tax-items/:id`
- 已实现 `GET /api/tax-filing-batches`
- 已实现 `POST /api/tax-filing-batches`
- 已实现 `GET /api/tax-filing-batches/:id`
- 已实现 `POST /api/tax-filing-batches/:id/validate`
- 已实现 `POST /api/tax-filing-batches/:id/submit`
- 已实现 `GET /api/vouchers`
- 已实现 `GET /api/vouchers/:id`
- 已实现 `PUT /api/vouchers/:id`
- 已实现 `GET /api/vouchers/:id/validate`
- 已实现 `POST /api/vouchers/:id/approve`
- 已实现 `POST /api/vouchers/:id/post`
- 已实现 `GET /api/vouchers/:id/posting-records`
- 已实现 `GET /api/ledger/entries`
- 已实现 `GET /api/ledger/posting-batches`
- 已实现 `GET /api/ledger/summary`
- 已实现 `GET /api/ledger/balances`
- 已具备公司与部门两级最小数据隔离
- 前端 `events` 页面已接入列表、创建、详情、状态更新、活动时间轴、任务树与映射展示
- 前端 `tasks` 页面已接入任务列表与任务树
- 前端已接入 `documents` 占位页
- 前端已接入 `tax` 占位页
- 前端已接入 `vouchers` 详情页
- 已具备事项到单据映射、税务处理映射、凭证草稿的快照输出
- 已具备事项分析后同步生成 documents、tax_items、vouchers 对象
- 同一事项重复分析时会替换既有 AI 任务和对象，避免重复堆叠
- 已具备 documents、tax_items、vouchers 的详情和状态更新接口
- 已具备 documents 附件绑定和归档动作
- 已具备 vouchers 校验、审核和过账前检查
- 已具备 tax_items 的申报批次草稿生成
- 已具备 documents 附件记录查询
- 已具备 vouchers 过账记录查询
- 已具备 tax_filing_batches 的详情、校验和提交
- 已具备 vouchers 过账后自动生成 ledger entries 与 posting batches
- 前端已具备 `ledger` 占位页
- 前端已具备 `documents` 和 `tax` 占位页
- 前端已具备 `documents` 详情、附件绑定、归档动作承接
- 前端已具备 `tax_filing_batches` 详情、校验、提交动作承接
- 前端已具备 `ledger` 按凭证编号过滤钻取
- 前端已具备 `vouchers` 详情、校验、审核、过账动作承接
- 前端已具备 `ledger` 按事项编号过滤钻取
- 前端已具备 `vouchers` 摘要编辑
- 前端已具备 `ledger` 科目余额视图
- 已实现 `GET /api/accounts`（科目主数据列表，支持 category/q/leafOnly 过滤）
- 已实现 `GET /api/accounts/:code`（按科目编码查询）
- 已实现 `POST /api/documents/:id/upload`（multipart 文件上传，busboy 解析落盘）
- 已实现全量 `requirePermission` 守卫：events.view/create、ledger.view/post、tax.view/manage、documents.view/manage、tasks.view、dashboard.view
- 董事长驾驶舱已切换为真实数据：银行余额、应收账款、应交税费、风险事项数从 JSON 存储实时计算
- `ChartAccount`、`AccountCategory`、`AccountDirection` 已加入 domain-model 共享类型

## 9. Phase 1 完成情况（2026-05-14）

### 9.1 已完成

- 认证：access / refresh token 最小闭环
- 权限：公司与部门两级数据隔离（最小实现）
- 经营事项：创建、编辑、状态流、AI 任务拆解、幂等替换
- 任务：任务树、父子关系、AI 拆解
- 单据：列表、详情、状态更新、附件绑定、归档
- 凭证：列表、详情、摘要编辑、校验、审核、过账、分录、过账记录
- 税务事项：列表、详情、状态更新、申报批次生成、批次校验与提交
- 总账：分录列表、过账批次列表、科目汇总、科目余额
- 前端：7 个业务页面全部接入，事项到单据 / 税务 / 凭证完整展示

### 9.2 Phase 2 已收口项（2026-05-14）

| Task ID | 描述 | 状态 |
| --- | --- | --- |
| TASK-01-04 | 菜单与页面权限控制 | ✅ done — `getMenu` 按角色过滤菜单项 |
| TASK-01-05 | 数据域权限控制（细粒度 RBAC） | ✅ done — 所有写操作加 `requirePermission` 守卫 |
| TASK-03-01 | 董事长驾驶舱真实数据卡片 | ✅ done — 读取 ledger entries / events / tasks / vouchers 实时计算 |
| TASK-06-02 | 附件 multipart 上传（替代 base64） | ✅ done — `POST /api/documents/:id/upload` + busboy 解析落盘 |
| TASK-07-01 | 科目体系与辅助核算（科目主数据） | ✅ done — 小企业会计准则 60+ 科目 + `GET /api/accounts` |
| DB-MIGRATE | PostgreSQL schema + migration + 数据种子 | ✅ done — 完整 schema 25 张表 + 种子数据 + pg client + migration runner |

## 10. Phase 2 启动计划（目标：2026-05-21 开始）

### 10.1 目标

- 董事长驾驶舱接入真实数据（现金、回款、利润、税负概览）
- 建立正式权限体系，支持多角色菜单与数据访问控制
- 建立正式数据库存储层，替换 JSON 文件存储
- 启动财务运营中心的完整账务内核（科目体系、凭证模板、自动分录）

### 10.2 Phase 2 任务完成情况（2026-05-15 更新）

| Task ID | Task | Workstream | Priority | Status |
| --- | --- | --- | --- | --- |
| TASK-01-04 | 菜单与页面权限控制 | WS2 | P0 | ✅ done |
| TASK-01-05 | 数据域权限控制 | WS2 | P0 | ✅ done |
| TASK-03-01 | 董事长驾驶舱真实数据卡片 | WS1 | P0 | ✅ done |
| DB-MIGRATE | PostgreSQL schema + migration + 数据种子 | WS0 | P0 | ✅ done |
| TASK-07-01 | 科目体系与辅助核算 | WS5 | P1 | ✅ done |
| TASK-06-02 | 附件 multipart 上传 | WS4 | P1 | ✅ done |
| DB-MIGRATE-AUTH | auth 模块迁至 PostgreSQL | WS2 | P0 | 🕐 next |
| DB-MIGRATE-EVENTS | events 模块迁至 PostgreSQL | WS3 | P0 | 🕐 pending |
| DB-MIGRATE-TASKS | tasks 模块迁至 PostgreSQL | WS3 | P1 | 🕐 pending |
| DB-MIGRATE-VOUCHERS | vouchers + ledger 迁至 PostgreSQL | WS5 | P1 | 🕐 pending |
| DB-MIGRATE-DOCS | documents + attachments 迁至 PostgreSQL | WS4 | P1 | 🕐 pending |
| DB-MIGRATE-TAX | tax_items + batches 迁至 PostgreSQL | WS6 | P1 | 🕐 pending |
| TASK-07-02 | 凭证模板与自动分录 | WS5 | P1 | 🕐 pending |
| TASK-03-02 | 利润、费用、税负概览卡片 | WS1 | P2 | 🕐 pending |
| TASK-03-03 | 待审批与风险事项卡片 | WS1 | P2 | 🕐 pending |
| TASK-03-04 | AI 今日工作摘要卡片 | WS9 | P2 | 🕐 pending |
| EPIC-08 | 资产负债表 / 利润表 / 现金流量表 | WS5 | P2 | 🕐 pending |

### 10.3 Phase 2 验收标准

- ✅ 所有 API 接口有权限守卫，未授权返回 403
- ✅ 董事长驾驶舱核心 4 个卡片有真实数据
- ✅ 科目体系支持标准科目码查询
- ✅ PostgreSQL schema + migration + seed 就位
- 🕐 所有业务模块完成从 JSON 文件迁移到 PostgreSQL（下一阶段验收目标）
- 🕐 凭证模板支持按事项类型预置借贷分录

## 11. 偏差检查（2026-05-15）

- 对照产品蓝图：未偏离”经营事项主线优先”的核心路径；Phase 2 Sprint 1 已按计划推进
- 对照开发计划：Phase 2 Sprint 1 的 6 个 P0/P1 任务（TASK-01-04/05、TASK-03-01、TASK-07-01、TASK-06-02、DB-MIGRATE schema）已全部收口
- 对照协作机制：当前仍主要在 `main` 单线推进（已识别偏差），待模块迁移阶段再切换多分支模式
- **当前存储层：JSON 文件存储**（进行中迁移）。DB-MIGRATE 基础设施已就位，下一步是逐模块迁移。迁移顺序：auth → events → tasks → vouchers → documents → tax
- Phase 2 Sprint 1 已收口；Phase 2 Sprint 2 重点：全量 PostgreSQL 模块迁移 + 凭证模板
