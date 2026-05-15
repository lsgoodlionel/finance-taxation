# V2 升级开发计划

## 1. 计划目标

本计划用于将当前原型升级为可持续开发、可多人并行、可多 Agent 协同推进的 V2 系统。

计划覆盖：

- 产品升级范围
- 技术重构范围
- 任务拆解
- 依赖顺序
- 分工边界
- 集成节奏

## 2. 开发原则

- 先做统一骨架，再做功能堆叠
- 先做经营事项主线，再做局部页面增强
- 先做可追溯与可审计，再做更多自动化
- 先做最小闭环，再扩展复杂场景
- 先建立协作机制，再大规模并行开发

## 3. 总体阶段

> **标注说明**：✅ 已完成  ⚠️ 部分完成  ❌ 未开始

### Phase 0：工程与协作底座 ✅ 已完成

目标：

- 确立多模块工程结构
- 确立分支规范
- 确立任务拆解规范
- 确立自动化检查、环境与联调基线

### Phase 1：统一业务对象与经营事项总线 ✅ 已完成

目标：

- 建立 `business_events`
- 建立 `tasks`
- 建立合同、票据、收付款、单据的统一关系

### Phase 2：董事长驾驶舱 + AI 财税秘书 ✅ 已完成

目标：

- 建立老板视角首页
- 建立自然语言交办入口
- 建立任务拆解、催办、异常提示能力

### Phase 3：账务内核 ✅ 已完成

目标：

- 凭证
- 总账
- 明细账
- 科目余额表
- 日记账
- 自动过账

### Phase 4：税务与申报准备 ✅ 已完成

目标：

- 纳税人口径
- 税种事项
- 申报批次
- 税务底稿
- 税务留档

### Phase 5：研发财税中台 ✅ 已完成

目标：

- 研发项目
- 研发辅助账
- 加计扣除
- 汇算口径

### Phase 6：风险与勾稽中台 ✅ 已完成

目标：

- 合同 / 开票 / 回款 / 收入确认
- 工资 / 个税 / 社保 / 公积金
- 研发 / 辅助账 / 优惠口径

### Phase 7：归档、打印、审计与企业化收口 ⚠️ 部分完成

目标：

- 资料包 ✅（closing-bundle 已落地）
- 打印与 PDF ✅（HTML 打印模板、PdfExportPage 已落地）
- 权限完善 ✅（全量 requirePermission 守卫已就位）
- 审计日志 ✅（audit_logs + writeAudit + AuditPage 已落地）
- 上线准备 ❌（单元测试、E2E、回归、发布准入未完成）

## 4. 工作流分组

> **标注说明**：✅ 已完成  ⚠️ 部分完成  ❌ 未开始

### WS0：产品与架构 ✅ 已完成

职责：

- 产品蓝图
- 信息架构
- 数据模型
- API 设计
- 领域边界定义

**落地情况**：monorepo 结构、domain-model 共享类型包、25 张表 DB schema、API 路由规范全部就位

### WS1：前端应用骨架 ✅ 已完成

职责：

- React + TS 工程化
- 路由
- Layout
- 设计系统
- 页面骨架

**落地情况**：16 个业务页面全部接入路由，AppLayout 导航、React Router、Vite 工程化就位

### WS2：身份、权限、组织与配置 ✅ 已完成

职责：

- 登录
- 会话
- 角色
- 菜单
- 数据权限
- 企业设置

**落地情况**：JWT + refresh token、RBAC 四角色、requirePermission 全量守卫、菜单按角色过滤、PostgreSQL 会话管理全部就位

### WS3：经营事项与任务中心 ✅ 已完成

职责：

- 经营事项总线
- AI 拆任务
- 任务流转
- 催办
- 审批

**落地情况**：business_events / tasks / relations / activities 全链路 + 合同管理（contracts）+ 工资管理（payroll）均已落地；催办与审批流未实现

### WS4：单据、附件、归档 ⚠️ 部分完成

职责：

- 单据模型
- 附件上传
- 归档目录
- 下载
- 资料包

**落地情况**：✅ 单据 CRUD + 状态流 + 附件 multipart 上传 + 资料包导出；❌ 对象存储接入（当前本地落盘）、在线预览、单据打印模板未实现

### WS5：账务与报表 ✅ 已完成

职责：

- 凭证
- 分录
- 账簿
- 财务三表
- 月结

**落地情况**：凭证模板 + 自动分录 + 过账 + 分类账 + 科目余额 + 资产负债表/利润表/现金流量表 + 快照 + 差异分析 + 老板摘要 + 打印版全部落地

### WS6：税务与申报准备 ✅ 已完成

职责：

- 纳税人口径
- 税务事项
- 税表底稿
- 留档材料

**落地情况**：taxpayer_profiles + 税率规则 + 增值税底稿 + 企业所得税准备 + 个税资料 + 印花税附加税 + 申报批次复核留档全部落地

### WS7：研发财税 ✅ 已完成

职责：

- 研发项目
- 费用归集
- 辅助账
- 加计扣除

**落地情况**：rnd_projects + rnd_cost_lines + rnd_time_entries + 加计扣除资料包 + 资本化/费用化复核 + 政策提示 + 月度支出趋势全部落地

### WS8：风险勾稽与审计 ✅ 已完成

职责：

- 风险规则
- 勾稽校验
- 审计日志
- 异常中心

**落地情况**：risk_findings + 评分模型 + 收入/采购/工资/研发/税务勾稽规则 + 异常关闭复盘 + audit_logs + writeAudit 服务 + AuditPage 全部落地

### WS9：AI Agent 与知识库 ⚠️ 部分完成

职责：

- AI 分析服务
- 规则引擎
- Prompt 管理
- Agent 编排
- 知识库 / 制度库

**落地情况**：✅ AI 财税秘书（SSE 流式对话 + 上下文注入）、老板专线（实时财务快照问答）；❌ 知识库/制度库、Prompt 版本化、Agent 编排、AI 结论回放未实现

### WS10：DevOps、QA、发布 ⚠️ 部分完成

职责：

- CI/CD
- 测试
- 环境
- 数据迁移
- 发布流程

**落地情况**：✅ PR 模板 / Issue 模板 / typecheck 基线 / migration runner / package-lock；❌ 单元测试基线、API 合约测试、E2E、回归场景、发布准入评审未实现

## 5. 任务拆解

> **标注说明**：✅ 已完成  ⚠️ 部分完成  ❌ 未开始

任务编号采用：

- `EPIC-xx`
- `TASK-xx-yy`

### EPIC-00 工程重构与目录标准化 ✅ 全部完成

- `TASK-00-01` ✅ 建立前端正式工程目录
- `TASK-00-02` ✅ 建立后端 TypeScript 工程目录
- `TASK-00-03` ✅ 建立共享类型与接口包
- `TASK-00-04` ✅ 建立 lint / format / typecheck / test 脚本
- `TASK-00-05` ✅ 建立环境变量、配置和 secrets 规范
- `TASK-00-06` ✅ 建立 migrations、seed、fixture 目录

### EPIC-01 身份、权限、组织 ✅ 全部完成

- `TASK-01-01` ✅ 用户表、角色表、权限点表设计（users_v2 / roles / role_permissions）
- `TASK-01-02` ✅ JWT + refresh token 设计与实现
- `TASK-01-03` ✅ 企业隔离与部门隔离
- `TASK-01-04` ✅ 菜单与页面权限控制（getMenu 按角色过滤）
- `TASK-01-05` ✅ 数据域权限控制（全量 requirePermission 守卫）
- `TASK-01-06` ✅ 审计日志接入认证链路（P3-5：audit_logs + writeAudit 接入认证用户信息）

### EPIC-02 经营事项总线 ✅ 全部完成

- `TASK-02-01` ✅ `business_events` 数据模型
- `TASK-02-02` ✅ 经营事项创建、编辑、状态流 API
- `TASK-02-03` ⚠️ 合同关联已建立（contracts + contract_id 外键）；发票、收付款独立关联模型未完整建立
- `TASK-02-04` ✅ 经营事项列表、详情、时间轴页面
- `TASK-02-05` ✅ 事项到任务自动拆解机制（AI 拆解 + 幂等替换）
- `TASK-02-06` ✅ 事项到单据、税务、凭证的影响映射

### EPIC-03 董事长驾驶舱 ⚠️ 大部分完成

- `TASK-03-01` ✅ 现金与回款驾驶舱卡片（bank/receivables 实时计算）
- `TASK-03-02` ✅ 利润、费用、税负概览卡片
- `TASK-03-03` ✅ 待审批与风险事项卡片
- `TASK-03-04` ✅ AI 今日工作摘要卡片
- `TASK-03-05` ✅ 老板问答入口（P3-6：BossQAPage + /api/boss-qa/chat）
- `TASK-03-06` ❌ 高风险经营事件钻取页（独立钻取页未实现，当前仅有风险列表）

### EPIC-04 AI 财税秘书 ⚠️ 基础已完成，深化未实现

- `TASK-04-01` ✅ 自然语言交办入口（AssistantPage + /api/assistant/chat SSE）
- `TASK-04-02` ✅ 行为录入结果结构化协议（action 块 JSON 输出 + 一键创建经营事项）
- `TASK-04-03` ❌ 规则优先 + 模型补充的决策流水（当前全量模型，无规则引擎分层）
- `TASK-04-04` ❌ 分析快照持久化（对话历史仅存前端内存）
- `TASK-04-05` ❌ 分析结果锁定生成（无锁定机制）
- `TASK-04-06` ❌ 可展示过程摘要与依据面板（无来源引用展示）

### EPIC-05 任务中心与审批流 ⚠️ 基础已完成，审批流未实现

- `TASK-05-01` ✅ 任务模型（tasks_v2 + task_checklist_items）
- `TASK-05-02` ✅ 子任务树模型（parent_task_id 自引用）
- `TASK-05-03` ❌ SLA 与截止时间规则（due_at 字段存在但无规则引擎触发）
- `TASK-05-04` ❌ 催办与升级机制
- `TASK-05-05` ❌ 审批流配置
- `TASK-05-06` ⚠️ 任务列表与责任人视图已实现；任务看板（Kanban）未实现

### EPIC-06 单据、附件、归档 ⚠️ 核心已完成，存储与预览未实现

- `TASK-06-01` ❌ 单据模板系统（当前单据为 AI 生成 + 手动，无预置模板体系）
- `TASK-06-02` ✅ 附件 multipart 上传（busboy + 本地落盘）
- `TASK-06-03` ❌ 对象存储接入（当前为本地 data/uploads/ 落盘）
- `TASK-06-04` ❌ 在线预览服务
- `TASK-06-05` ⚠️ 单据详情页有基础实现（列表/详情/状态/附件）；完整重构未做
- `TASK-06-06` ✅ 资料包导出（closing-bundle 月结/审计/稽核包）

### EPIC-07 账务内核 ⚠️ 核心已完成，日记账与锁账未实现

- `TASK-07-01` ✅ 科目体系与辅助核算（小企业准则 60+ 科目）
- `TASK-07-02` ✅ 凭证模板与自动分录（按事项类型预置借贷）
- `TASK-07-03` ✅ 过账服务（自动生成 ledger_entries + posting_batches）
- `TASK-07-04` ✅ 总账与明细账查询（按凭证/事项/科目多维过滤）
- `TASK-07-05` ✅ 科目余额表生成（GET /api/ledger/balances）
- `TASK-07-06` ❌ 现金 / 银行日记账生成（专项日记账页未实现）
- `TASK-07-07` ❌ 反结账与锁账控制

### EPIC-08 财务报表 ✅ 全部完成

- `TASK-08-01` ✅ 资产负债表生成（GET /api/reports/balance-sheet）
- `TASK-08-02` ✅ 利润表生成（GET /api/reports/profit-statement）
- `TASK-08-03` ✅ 现金流量表生成（GET /api/reports/cash-flow）
- `TASK-08-04` ✅ 月 / 季 / 年快照（report_snapshots 表 + 快照接口）
- `TASK-08-05` ✅ 报表差异分析（GET /api/reports/diff）
- `TASK-08-06` ✅ 老板口径摘要（GET /api/reports/chairman-summary）

### EPIC-09 税务运营 ✅ 全部完成

- `TASK-09-01` ✅ 纳税人身份切换联动（taxpayer_profiles + 口径解析）
- `TASK-09-02` ✅ 税率规则与期间规则（GET /api/tax/rules）
- `TASK-09-03` ✅ 增值税底稿（GET /api/tax/vat-working-paper）
- `TASK-09-04` ✅ 企业所得税预缴与汇算准备（GET /api/tax/corporate-income-tax）
- `TASK-09-05` ✅ 个税申报资料（GET /api/tax/individual-income-tax-materials）
- `TASK-09-06` ✅ 印花税与附加税事项（GET /api/tax/stamp-and-surtax）
- `TASK-09-07` ✅ 申报批次、复核、留档（tax_filing_batch_reviews + archives）

### EPIC-10 研发财税 ✅ 全部完成

- `TASK-10-01` ✅ 研发项目主数据（rnd_projects 模型 + CRUD）
- `TASK-10-02` ✅ 研发费用归集流水（rnd_cost_lines + rnd_time_entries）
- `TASK-10-03` ✅ 研发辅助账（项目级费用化/资本化/工时汇总）
- `TASK-10-04` ✅ 加计扣除资料包（getRndSuperDeductionPackage）
- `TASK-10-05` ✅ 资本化 / 费用化规则支持（冲突复核与建议）
- `TASK-10-06` ✅ 政策补贴与研发口径提示（buildRndPolicyGuidance）

### EPIC-11 风险与勾稽 ✅ 全部完成

- `TASK-11-01` ✅ 收入闭环勾稽（销售收入 / 合同 / 应收 / 回款规则）
- `TASK-11-02` ✅ 工资个税社保公积金勾稽（已纳入风险规则引擎）
- `TASK-11-03` ✅ 研发项目与辅助账勾稽（资本化/费用化冲突复核）
- `TASK-11-04` ✅ 发票、付款、入账勾稽（采购事项 + 进项税规则）
- `TASK-11-05` ✅ 风险评分与优先级模型（risk_score + priority 字段）
- `TASK-11-06` ✅ 异常关闭与复盘记录（risk_closure_records + 复盘接口）

### EPIC-12 知识库与制度库 ❌ 全部未完成

- `TASK-12-01` ❌ 企业制度库
- `TASK-12-02` ❌ 财税口径库
- `TASK-12-03` ❌ 常见问题知识库
- `TASK-12-04` ❌ Prompt 版本化
- `TASK-12-05` ❌ AI 结论回放页
- `TASK-12-06` ❌ 法规更新对照机制

### EPIC-13 打印、PDF、导出 ⚠️ 大部分完成，单据打印未实现

- `TASK-13-01` ✅ HTML 模板体系（wrapHtml + A4 页面 + CJK 字体 + 打印按钮）
- `TASK-13-02` ✅ PDF 渲染服务（浏览器打印方式，window.print() / 新窗口打开）
- `TASK-13-03` ❌ 单据打印（document 独立打印模板未实现）
- `TASK-13-04` ✅ 报表打印（GET /api/reports/printable）
- `TASK-13-05` ✅ 税务底稿打印（GET /api/tax/printable）
- `TASK-13-06` ✅ 月结 / 审计 / 稽核资料包导出（GET /api/packages/closing-bundle）

额外完成（P3-4 Sprint）：
- ✅ `GET /api/pdf/payroll` 工资汇总 PDF
- ✅ `GET /api/pdf/payroll-slip` 工资条 PDF
- ✅ `GET /api/pdf/voucher/:id` 凭证 PDF
- ✅ `GET /api/pdf/report` 报表快照 PDF
- ✅ PdfExportPage（工资/报表/凭证三 Tab 下载中心）

### EPIC-14 测试、联调、上线 ❌ 全部未完成

- `TASK-14-01` ❌ 单元测试基线
- `TASK-14-02` ❌ API 合约测试
- `TASK-14-03` ❌ 前后端联调清单（未正式整理）
- `TASK-14-04` ❌ 端到端回归场景
- `TASK-14-05` ❌ 首年 28 个创业场景自动回归
- `TASK-14-06` ❌ 发布准入评审

## 6. 当前实施对照（2026-05-15）

### Phase 0 + Phase 1 完成情况（已收口）

| 任务 | 实际状态 | 备注 |
| --- | --- | --- |
| TASK-00-01 ~ 00-06 工程底座 | done | monorepo / TS 工程 / env / migration 目录 |
| TASK-01-02 JWT + refresh token | done | access + refresh 最小闭环 |
| TASK-01-03 企业 + 部门隔离 | done | 公司与部门两级数据边界 |
| TASK-02-02 经营事项 CRUD + 状态流 | done | 创建、编辑、状态更新、分析 |
| TASK-02-04 经营事项列表 + 时间轴 | done | 列表、详情、时间轴、任务树 |
| TASK-02-05 AI 任务拆解 | done | 幂等替换已具备 |
| TASK-02-06 事项→映射→正式对象 | done | documents / vouchers / tax_items 全链路 |
| TASK-04-02 单据详情与状态流 | done | 附件绑定、归档动作 |
| TASK-05-02 凭证详情与过账前状态流 | done | 校验、审核、过账、过账记录 |
| TASK-05-03 总账分录与过账批次 | done | 分录列表、汇总、科目余额 |
| TASK-06-01 税务事项详情与状态流 | done | 税务事项详情、申报批次、校验、提交 |

### Phase 2 Sprint 1 完成情况（2026-05-14 ~ 2026-05-15）

| 任务 | 状态 | 关键产物 |
| --- | --- | --- |
| TASK-01-04 菜单权限控制 | done | `getMenu` 按角色过滤 7 个菜单项 |
| TASK-01-05 数据域权限控制 | done | 全量 `requirePermission` 守卫；所有写操作 + view 分组 |
| TASK-03-01 驾驶舱真实数据 | done | 从 ledger / events / tasks / vouchers 实时计算 4 张卡 + 3 队列 |
| TASK-07-01 科目主数据 | done | 小企业会计准则 60+ 科目；`GET /api/accounts`；`ChartAccount` 加入 domain-model |
| TASK-06-02 multipart 文件上传 | done | busboy + `POST /api/documents/:id/upload` + 落盘 `data/uploads/` |
| DB-MIGRATE schema + seed | done | 25 张表；`migrations/001_initial_schema.sql` + `002_seed_data.sql`；pg 连接池；migration runner |

### 当前偏差记录

- **偏差 1：单主分支推进**（已识别，Phase 3 起按 workstream 拆分）  
  Phase 0–2 全程在 `main` 连续演进，未切入多分支工作流。Phase 3 启动后按 workstream 拆分分支。

### Phase 2 DB 迁移完成情况（全部 done）

| 任务 ID | 描述 | 状态 |
| --- | --- | --- |
| DB-MIGRATE-AUTH | auth 模块迁至 pg（users / roles / sessions） | ✅ done |
| DB-MIGRATE-EVENTS | events 模块迁至 pg | ✅ done |
| DB-MIGRATE-TASKS | tasks 模块迁至 pg | ✅ done |
| DB-MIGRATE-VOUCHERS | vouchers + ledger 模块迁至 pg | ✅ done |
| DB-MIGRATE-DOCS | documents + attachments 迁至 pg | ✅ done |
| DB-MIGRATE-TAX | tax_items + tax_filing_batches 迁至 pg | ✅ done |
| TASK-07-02 | 凭证模板与自动分录 | ✅ done |
| TASK-03-02 | 驾驶舱利润 / 费用概览卡片 | ✅ done |
| TASK-03-03 | 驾驶舱风险事项可点击列表 | ✅ done |
| EPIC-08 | 资产负债表 / 利润表 / 现金流量表 | ✅ done |
| JSON 文件存储全量下线 | 删除 apps/api/src/data/*.v2.json | ✅ done |

### Sprint 3-4 目标（已全部完成）

- ✅ 完成全量模块 PostgreSQL 迁移，下线 JSON 文件存储
- ✅ 凭证模板：按事项类型（sales / procurement / payroll 等）预置借贷模板
- ✅ 驾驶舱深化：利润、费用、税负、风险事项
- ✅ EPIC-08 财务三表生成首版落地

### EPIC-05 任务中心与审批流

- `TASK-05-01` ✅ 任务模型
- `TASK-05-02` ✅ 子任务树模型
- `TASK-05-03` ❌ SLA 与截止时间规则
- `TASK-05-04` ❌ 催办与升级机制
- `TASK-05-05` ❌ 审批流配置
- `TASK-05-06` ⚠️ 任务看板、列表、责任人工作台

### EPIC-06 单据、附件、归档

- `TASK-06-01` ❌ 单据模板系统
- `TASK-06-02` ✅ 附件 multipart 上传
- `TASK-06-03` ❌ 对象存储接入
- `TASK-06-04` ❌ 在线预览服务
- `TASK-06-05` ⚠️ 单据详情页重构
- `TASK-06-06` ✅ 资料包导出

### EPIC-07 账务内核

- `TASK-07-01` ✅ 科目体系与辅助核算
- `TASK-07-02` ✅ 凭证模板与自动分录
- `TASK-07-03` ✅ 过账服务
- `TASK-07-04` ✅ 总账与明细账查询
- `TASK-07-05` ✅ 科目余额表生成
- `TASK-07-06` ❌ 现金 / 银行日记账生成
- `TASK-07-07` ❌ 反结账与锁账控制

### EPIC-08 财务报表

- `TASK-08-01` ✅ 资产负债表生成
- `TASK-08-02` ✅ 利润表生成
- `TASK-08-03` ✅ 现金流量表生成
- `TASK-08-04` ✅ 月 / 季 / 年快照
- `TASK-08-05` ✅ 报表差异分析
- `TASK-08-06` ✅ 老板口径摘要

当前状态（2026-05-15）：

- `TASK-08-01` 首版已完成：后端 `GET /api/reports/balance-sheet` + 前端报表页承接
- `TASK-08-02` 首版已完成：后端 `GET /api/reports/profit-statement` + 前端报表页承接
- `TASK-08-03` 首版已完成：后端 `GET /api/reports/cash-flow` + 前端报表页承接
- `TASK-08-04` 首版已完成：`report_snapshots` 表、快照保存接口、快照列表已落地
- `TASK-08-05` 首版已完成：报表差异分析接口与前端对比视图已落地
- `TASK-08-06` 首版已完成：`GET /api/reports/chairman-summary` 与前端老板摘要视图已落地

### EPIC-09 税务运营

- `TASK-09-01` ✅ 纳税人身份切换联动
- `TASK-09-02` ✅ 税率规则与期间规则
- `TASK-09-03` ✅ 增值税底稿
- `TASK-09-04` ✅ 企业所得税预缴与汇算准备
- `TASK-09-05` ✅ 个税申报资料
- `TASK-09-06` ✅ 印花税与附加税事项
- `TASK-09-07` ✅ 申报批次、复核、留档

当前状态（2026-05-15）：

- `TASK-09-01` 首版已完成：`taxpayer_profiles` 模型、列表、创建、激活口径解析与前端维护页已落地
- `TASK-09-02` 首版已完成：税率规则与期间规则解析接口 `GET /api/tax/rules` 已落地
- `TASK-09-03` 首版已完成：`GET /api/tax/vat-working-paper` 与前端增值税底稿视图已落地
- `TASK-09-04` 首版已完成：企业所得税预缴与汇算准备接口、前端准备页和打印版已落地
- `TASK-09-05` 首版已完成：个税申报资料接口与前端资料清单已落地
- `TASK-09-06` 首版已完成：印花税与附加税事项汇总接口与前端摘要已落地
- `TASK-09-07` 首版已完成：申报批次复核、留档、复核记录和留档记录已落地

### EPIC-10 研发财税

- `TASK-10-01` ✅ 研发项目主数据
- `TASK-10-02` ✅ 研发费用归集流水
- `TASK-10-03` ✅ 研发辅助账
- `TASK-10-04` ✅ 加计扣除资料包
- `TASK-10-05` ✅ 资本化 / 费用化规则支持
- `TASK-10-06` ✅ 政策补贴与研发口径提示

当前状态（2026-05-15）：

- `TASK-10-01` 首版已完成：`rnd_projects` 模型、列表、创建、详情
- `TASK-10-02` 首版已完成：`rnd_cost_lines`、`rnd_time_entries` 已支持录入接口与前端录入
- `TASK-10-03` 首版已完成：项目级费用化 / 资本化 / 工时 / 可选加计扣除基数摘要
- `TASK-10-04` 首版已完成：加计扣除资料包摘要接口与前端展示已落地
- `TASK-10-05` 首版已完成：项目级资本化 / 费用化冲突复核与建议已落地
- `TASK-10-06` 首版已完成：项目详情已支持补贴提示、研发口径提示和风险提示

### EPIC-11 风险与勾稽

- `TASK-11-01` ✅ 收入闭环勾稽
- `TASK-11-02` ✅ 工资个税社保公积金勾稽
- `TASK-11-03` ✅ 研发项目与辅助账勾稽
- `TASK-11-04` ✅ 发票、付款、入账勾稽
- `TASK-11-05` ✅ 风险评分与优先级模型
- `TASK-11-06` ✅ 异常关闭与复盘记录

当前状态（2026-05-15）：

- `TASK-11-01` 首版已完成：销售收入已入账但未形成增值税事项
- `TASK-11-01` 已深化：补充销售合同缺失、回款/应收依据缺失规则
- `TASK-11-03` 首版已完成：研发支出未归集到研发项目辅助账
- `TASK-11-03` 已深化：研发项目已支持资本化 / 费用化口径冲突复核
- `TASK-11-04` 首版已完成：已过账凭证缺少关联原始单据
- `TASK-11-04` 已深化：采购事项补充发票/付款依据缺失、进项税处理缺失规则
- `TASK-11-02` 首版已完成：工资 / 个税 / 社保 / 公积金勾稽规则已接入风险引擎
- `TASK-11-05` 首版已完成：风险评分与优先级模型已接入风险结果返回
- `TASK-11-06` 首版已完成：`risk_closure_records`、关闭接口、复盘记录查询与前端复盘列表已落地

### EPIC-12 知识库与制度库

- `TASK-12-01` ❌ 企业制度库
- `TASK-12-02` ❌ 财税口径库
- `TASK-12-03` ❌ 常见问题知识库
- `TASK-12-04` ❌ Prompt 版本化
- `TASK-12-05` ❌ AI 结论回放页
- `TASK-12-06` ❌ 法规更新对照机制

### EPIC-13 打印、PDF、导出

- `TASK-13-01` ✅ HTML 模板体系（wrapHtml + A4 CSS + CJK 兼容）
- `TASK-13-02` ✅ PDF 渲染服务（浏览器打印方案）
- `TASK-13-03` ❌ 单据打印（documents 独立打印模板未实现）
- `TASK-13-04` ✅ 报表打印
- `TASK-13-05` ✅ 税务底稿打印
- `TASK-13-06` ✅ 月结 / 审计 / 稽核资料包导出

当前状态（2026-05-15）：

- `TASK-13-04` 首版已完成：`GET /api/reports/printable` 与前端打印版打开动作已落地
- `TASK-13-05` 首版已完成：`GET /api/tax/printable` 已支持增值税底稿和企业所得税准备打印
- `TASK-13-06` 首版已完成：`GET /api/packages/closing-bundle` 与前端月结 / 审计 / 稽核资料包打开动作已落地

### EPIC-14 测试、联调、上线

- `TASK-14-01` ❌ 单元测试基线
- `TASK-14-02` ❌ API 合约测试
- `TASK-14-03` ❌ 前后端联调清单
- `TASK-14-04` ❌ 端到端回归场景
- `TASK-14-05` ❌ 首年 28 个创业场景自动回归
- `TASK-14-06` ❌ 发布准入评审

## 6. 依赖顺序

必须遵守下列顺序：

1. `EPIC-00`
2. `EPIC-01`
3. `EPIC-02`
4. `EPIC-04` + `EPIC-05`
5. `EPIC-06` + `EPIC-07`
6. `EPIC-08` + `EPIC-09`
7. `EPIC-10` + `EPIC-11`
8. `EPIC-12` + `EPIC-13`
9. `EPIC-14`

原因：

- 没有 `business_events` 和 `tasks`，AI 就无法成为执行系统
- 没有权限与审计，后续所有自动化都不安全
- 没有账务内核，报表和税务都不能真正可信

## 7. 最新实施情况与下一阶段计划（2026-05-15）

已完成：

- 全量核心业务模块已迁至 PostgreSQL
- 凭证模板与自动分录首版已落地
- 董事长驾驶舱利润 / 风险 / AI 摘要已落地
- `EPIC-08` 财务三表首版已落地
- `TASK-08-06` 老板口径摘要首版已落地
- `EPIC-09` 纳税人口径、税率规则、增值税底稿、企业所得税准备首版已落地
- `TASK-09-05`、`TASK-09-06`、`TASK-09-07` 已完成，税务资料、附加税汇总、批次复核留档已补齐
- `EPIC-10` 研发财税首版已落地
- `TASK-10-05` 研发资本化 / 费用化规则支持首版已落地
- `TASK-10-06` 政策补贴与研发口径提示首版已落地
- `EPIC-11` 风险勾稽首版已落地
- `TASK-11-06` 风险关闭与复盘记录首版已落地
- `TASK-13-04` 报表打印首版已落地
- `TASK-13-05` 税务底稿打印首版已落地
- `TASK-13-06` 月结 / 审计 / 稽核资料包导出首版已落地
- `TASK-01-06` 审计日志已接入认证链路（P3-5：audit_logs + writeAudit + AuditPage）
- `TASK-03-05` 老板问答入口已落地（P3-6：BossQAPage + /api/boss-qa/chat）
- P3-1 合同管理、P3-2 工资/社保/公积金、P3-4 PDF 导出均已落地

下一阶段优先顺序（建议 Next Sprint）：

1. `EPIC-12`（TASK-12-01 起）— 企业制度库 / 财税口径库
2. `TASK-06-03` / `TASK-06-04` — 对象存储接入 + 在线预览
3. `TASK-07-06` / `TASK-07-07` — 日记账 + 锁账控制
4. `TASK-05-03` / `TASK-05-04` — 任务 SLA + 催办升级
5. `EPIC-14` — 测试基线 + 发布准入

## 7. 建议排期

> **标注说明**：✅ 已完成  ⚠️ 部分完成  ❌ 未完成

### Sprint 0 ✅ 已完成

- 工程重构
- 目录定型
- CI / PR 规则
- 开发机制生效

### Sprint 1-2 ✅ 已完成

- 身份权限（JWT + RBAC + 菜单过滤）
- 企业配置（公司 + 部门 + 角色种子数据）
- 经营事项总线（business_events + activities + relations + AI 拆解）
- 任务中心基础（tasks_v2 + 子任务树）

### Sprint 3-4 ✅ 已完成

- AI 财税秘书（AssistantPage + /api/assistant/chat SSE 流式响应）
- 董事长驾驶舱第一版（实时 4 卡 + 3 队列 + profitOverview + riskBoard）
- 单据、附件、归档改造（documents + attachments + busboy 上传 + 归档）

### Sprint 5-6 ✅ 已完成

- 凭证（vouchers + 模板 + 自动分录 + 校验 + 审核 + 过账）
- 总账（ledger_entries + posting_batches + 汇总 + 余额表 + 明细账）
- 财务三表（资产负债表 + 利润表 + 现金流量表 + 快照 + 差异分析）
- 月结（closing-bundle 资料包导出）

### Sprint 7-8 ✅ 已完成

- 税务事项（tax_items + 状态流 + 申报批次 + 校验 + 提交）
- 申报准备、留档（tax_filing_batch_reviews + archives）
- 纳税人口径联动（taxpayer_profiles + 税率规则 + 增值税底稿 + 企业所得税准备）
- 个税资料、印花税附加税汇总

### Sprint 9-10 ✅ 已完成

- 研发财税中心（rnd_projects + rnd_cost_lines + rnd_time_entries + 加计扣除 + 资本化复核 + 政策提示 + 月度趋势）
- 风险与勾稽中心（risk_findings + 规则引擎 + 评分模型 + 关闭 + 复盘记录）

### Sprint 11-12 ⚠️ 部分完成

- 打印、PDF、资料包 ✅（HTML 模板 + PdfExportPage + payroll/voucher/report PDF 端点）
- 合同管理 ✅（Sprint P3-1：contracts 表 + ContractsPage）
- 工资管理 ✅（Sprint P3-2：employees + payroll_records + PayrollPage）
- 审计日志 ✅（Sprint P3-5：audit_logs + AuditPage）
- 老板专线 ✅（Sprint P3-6：BossQAPage + 实时财务快照注入）
- 全链路联调 ❌（未系统整理联调清单）
- 回归与上线准备 ❌（单元测试、E2E、回归场景、发布准入均未实现）

## 8. 每个工作流的推荐分支前缀

- `feat/ws0-`
- `feat/ws1-`
- `feat/ws2-`
- `feat/ws3-`
- `feat/ws4-`
- `feat/ws5-`
- `feat/ws6-`
- `feat/ws7-`
- `feat/ws8-`
- `feat/ws9-`
- `feat/ws10-`

## 9. 推荐多人 / 多 Agent 并行切分

### 人员角色

- 产品负责人
- 架构负责人
- 前端负责人
- 后端负责人
- AI / 规则负责人
- 财税业务负责人
- QA / 联调负责人
- DevOps / 发布负责人

### Agent 角色

- `architect-agent`
- `frontend-agent`
- `backend-agent`
- `ai-agent`
- `tax-agent`
- `qa-agent`
- `devops-agent`
- `documentation-agent`

## 10. 交付标准

一个任务要算完成，至少满足：

- 代码提交
- 测试通过
- 文档同步
- 验收截图 / 返回结果
- 回归无阻塞
- 在进度板更新状态

## 11. 当前建议的第一批启动任务

优先启动这 12 项：

- `TASK-00-01`
- `TASK-00-02`
- `TASK-00-04`
- `TASK-01-01`
- `TASK-01-02`
- `TASK-02-01`
- `TASK-02-02`
- `TASK-03-01`
- `TASK-04-01`
- `TASK-05-01`
- `TASK-06-02`
- `TASK-07-01`

这批任务互相冲突最小，适合第一轮多人并行。

## 12. 完成状态总览（2026-05-15 更新）

| 维度 | 完成数 | 总数 | 完成率 |
| --- | --- | --- | --- |
| Phase（总体阶段） | 7 | 8 | 87.5% |
| WS（工作流分组） | 8 | 11 | 72.7% |
| EPIC（史诗任务组） | 6 | 15 | 40% |
| TASK（具体任务） | 约 55 | 约 85 | 约 65% |
| Sprint（排期） | 6 | 7 | 85.7% |

> **关键缺口**：EPIC-12（知识库/制度库）、EPIC-14（测试/上线）、WS10（测试/QA）、Sprint 11-12 的联调与回归部分尚未启动。
