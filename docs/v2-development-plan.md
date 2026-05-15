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

### Phase 0：工程与协作底座

目标：

- 确立多模块工程结构
- 确立分支规范
- 确立任务拆解规范
- 确立自动化检查、环境与联调基线

### Phase 1：统一业务对象与经营事项总线

目标：

- 建立 `business_events`
- 建立 `tasks`
- 建立合同、票据、收付款、单据的统一关系

### Phase 2：董事长驾驶舱 + AI 财税秘书

目标：

- 建立老板视角首页
- 建立自然语言交办入口
- 建立任务拆解、催办、异常提示能力

### Phase 3：账务内核

目标：

- 凭证
- 总账
- 明细账
- 科目余额表
- 日记账
- 自动过账

### Phase 4：税务与申报准备

目标：

- 纳税人口径
- 税种事项
- 申报批次
- 税务底稿
- 税务留档

### Phase 5：研发财税中台

目标：

- 研发项目
- 研发辅助账
- 加计扣除
- 汇算口径

### Phase 6：风险与勾稽中台

目标：

- 合同 / 开票 / 回款 / 收入确认
- 工资 / 个税 / 社保 / 公积金
- 研发 / 辅助账 / 优惠口径

### Phase 7：归档、打印、审计与企业化收口

目标：

- 资料包
- 打印与 PDF
- 权限完善
- 审计日志
- 上线准备

## 4. 工作流分组

### WS0：产品与架构

职责：

- 产品蓝图
- 信息架构
- 数据模型
- API 设计
- 领域边界定义

### WS1：前端应用骨架

职责：

- React + TS 工程化
- 路由
- Layout
- 设计系统
- 页面骨架

### WS2：身份、权限、组织与配置

职责：

- 登录
- 会话
- 角色
- 菜单
- 数据权限
- 企业设置

### WS3：经营事项与任务中心

职责：

- 经营事项总线
- AI 拆任务
- 任务流转
- 催办
- 审批

### WS4：单据、附件、归档

职责：

- 单据模型
- 附件上传
- 归档目录
- 下载
- 资料包

### WS5：账务与报表

职责：

- 凭证
- 分录
- 账簿
- 财务三表
- 月结

### WS6：税务与申报准备

职责：

- 纳税人口径
- 税务事项
- 税表底稿
- 留档材料

### WS7：研发财税

职责：

- 研发项目
- 费用归集
- 辅助账
- 加计扣除

### WS8：风险勾稽与审计

职责：

- 风险规则
- 勾稽校验
- 审计日志
- 异常中心

### WS9：AI Agent 与知识库

职责：

- AI 分析服务
- 规则引擎
- Prompt 管理
- Agent 编排
- 知识库 / 制度库

### WS10：DevOps、QA、发布

职责：

- CI/CD
- 测试
- 环境
- 数据迁移
- 发布流程

## 5. 任务拆解

任务编号采用：

- `EPIC-xx`
- `TASK-xx-yy`

### EPIC-00 工程重构与目录标准化

- `TASK-00-01` 建立前端正式工程目录
- `TASK-00-02` 建立后端 TypeScript 工程目录
- `TASK-00-03` 建立共享类型与接口包
- `TASK-00-04` 建立 lint / format / typecheck / test 脚本
- `TASK-00-05` 建立环境变量、配置和 secrets 规范
- `TASK-00-06` 建立 migrations、seed、fixture 目录

### EPIC-01 身份、权限、组织

- `TASK-01-01` 用户表、角色表、权限点表设计
- `TASK-01-02` JWT + refresh token 设计与实现
- `TASK-01-03` 企业隔离与部门隔离
- `TASK-01-04` 菜单与页面权限控制
- `TASK-01-05` 数据域权限控制
- `TASK-01-06` 审计日志接入认证链路

### EPIC-02 经营事项总线

- `TASK-02-01` `business_events` 数据模型
- `TASK-02-02` 经营事项创建、编辑、状态流 API
- `TASK-02-03` 合同、发票、收付款、附件关联模型
- `TASK-02-04` 经营事项列表、详情、时间轴页面
- `TASK-02-05` 事项到任务自动拆解机制
- `TASK-02-06` 事项到单据、税务、凭证的影响映射

### EPIC-03 董事长驾驶舱

- `TASK-03-01` 现金与回款驾驶舱卡片
- `TASK-03-02` 利润、费用、税负概览卡片
- `TASK-03-03` 待审批与风险事项卡片
- `TASK-03-04` AI 今日工作摘要卡片
- `TASK-03-05` 老板问答入口
- `TASK-03-06` 高风险经营事件钻取页

### EPIC-04 AI 财税秘书

- `TASK-04-01` 自然语言交办入口
- `TASK-04-02` 行为录入结果结构化协议
- `TASK-04-03` 规则优先 + 模型补充的决策流水
- `TASK-04-04` 分析快照持久化
- `TASK-04-05` 分析结果锁定生成
- `TASK-04-06` 可展示过程摘要与依据面板

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

- **偏差 1：单主分支推进**（已识别）  
  当前仍在 `main` 连续演进，未切入多分支工作流。待模块迁移 PostgreSQL 阶段再按 workstream 拆分。

- **偏差 2：存储层仍为 JSON 文件**（进行中）  
  DB-MIGRATE 基础设施已就位（schema + pg client + migration runner），但各业务模块仍在读写 JSON 文件。下一步逐模块迁移（DB-MIGRATE-AUTH → EVENTS → TASKS → DOCS → VOUCHERS → TAX）。

### Phase 2 剩余执行顺序

| 优先级 | 任务 ID | 描述 | 依赖 |
| --- | --- | --- | --- |
| P0 | DB-MIGRATE-AUTH | auth 模块迁至 pg（users / roles / sessions） | DB-MIGRATE schema ✅ |
| P0 | DB-MIGRATE-EVENTS | events 模块迁至 pg | DB-MIGRATE-AUTH |
| P1 | DB-MIGRATE-TASKS | tasks 模块迁至 pg | DB-MIGRATE-EVENTS |
| P1 | DB-MIGRATE-VOUCHERS | vouchers + ledger 模块迁至 pg | DB-MIGRATE-TASKS |
| P1 | DB-MIGRATE-DOCS | documents + attachments 迁至 pg | DB-MIGRATE-EVENTS |
| P1 | DB-MIGRATE-TAX | tax_items + tax_filing_batches 迁至 pg | DB-MIGRATE-EVENTS |
| P1 | TASK-07-02 | 凭证模板与自动分录 | DB-MIGRATE-VOUCHERS |
| P2 | TASK-03-02 | 驾驶舱利润 / 费用概览卡片 | DB-MIGRATE-VOUCHERS |
| P2 | TASK-03-03 | 驾驶舱风险事项可点击列表 | DB-MIGRATE-EVENTS |
| P2 | EPIC-08 | 资产负债表 / 利润表 / 现金流量表 | TASK-07-02 |

### Sprint 3-4 目标（Phase 2 持续）

- 完成全量模块 PostgreSQL 迁移，下线 JSON 文件存储
- 凭证模板：按事项类型（sales / procurement / payroll 等）预置借贷模板
- 驾驶舱深化：利润、费用、税负、风险事项
- 启动 EPIC-08 财务三表生成

### EPIC-05 任务中心与审批流

- `TASK-05-01` 任务模型
- `TASK-05-02` 子任务树模型
- `TASK-05-03` SLA 与截止时间规则
- `TASK-05-04` 催办与升级机制
- `TASK-05-05` 审批流配置
- `TASK-05-06` 任务看板、列表、责任人工作台

### EPIC-06 单据、附件、归档

- `TASK-06-01` 单据模板系统
- `TASK-06-02` 附件 multipart 上传
- `TASK-06-03` 对象存储接入
- `TASK-06-04` 在线预览服务
- `TASK-06-05` 单据详情页重构
- `TASK-06-06` 资料包导出

### EPIC-07 账务内核

- `TASK-07-01` 科目体系与辅助核算
- `TASK-07-02` 凭证模板与自动分录
- `TASK-07-03` 过账服务
- `TASK-07-04` 总账与明细账查询
- `TASK-07-05` 科目余额表生成
- `TASK-07-06` 现金 / 银行日记账生成
- `TASK-07-07` 反结账与锁账控制

### EPIC-08 财务报表

- `TASK-08-01` 资产负债表生成
- `TASK-08-02` 利润表生成
- `TASK-08-03` 现金流量表生成
- `TASK-08-04` 月 / 季 / 年快照
- `TASK-08-05` 报表差异分析
- `TASK-08-06` 老板口径摘要

### EPIC-09 税务运营

- `TASK-09-01` 纳税人身份切换联动
- `TASK-09-02` 税率规则与期间规则
- `TASK-09-03` 增值税底稿
- `TASK-09-04` 企业所得税预缴与汇算准备
- `TASK-09-05` 个税申报资料
- `TASK-09-06` 印花税与附加税事项
- `TASK-09-07` 申报批次、复核、留档

### EPIC-10 研发财税

- `TASK-10-01` 研发项目主数据
- `TASK-10-02` 研发费用归集流水
- `TASK-10-03` 研发辅助账
- `TASK-10-04` 加计扣除资料包
- `TASK-10-05` 资本化 / 费用化规则支持
- `TASK-10-06` 政策补贴与研发口径提示

### EPIC-11 风险与勾稽

- `TASK-11-01` 收入闭环勾稽
- `TASK-11-02` 工资个税社保公积金勾稽
- `TASK-11-03` 研发项目与辅助账勾稽
- `TASK-11-04` 发票、付款、入账勾稽
- `TASK-11-05` 风险评分与优先级模型
- `TASK-11-06` 异常关闭与复盘记录

### EPIC-12 知识库与制度库

- `TASK-12-01` 企业制度库
- `TASK-12-02` 财税口径库
- `TASK-12-03` 常见问题知识库
- `TASK-12-04` Prompt 版本化
- `TASK-12-05` AI 结论回放页
- `TASK-12-06` 法规更新对照机制

### EPIC-13 打印、PDF、导出

- `TASK-13-01` HTML 模板体系
- `TASK-13-02` PDF 渲染服务
- `TASK-13-03` 单据打印
- `TASK-13-04` 报表打印
- `TASK-13-05` 税务底稿打印
- `TASK-13-06` 月结 / 审计 / 稽核资料包导出

### EPIC-14 测试、联调、上线

- `TASK-14-01` 单元测试基线
- `TASK-14-02` API 合约测试
- `TASK-14-03` 前后端联调清单
- `TASK-14-04` 端到端回归场景
- `TASK-14-05` 首年 28 个创业场景自动回归
- `TASK-14-06` 发布准入评审

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

## 7. 建议排期

### Sprint 0

- 工程重构
- 目录定型
- CI / PR 规则
- 开发机制生效

### Sprint 1-2

- 身份权限
- 企业配置
- 经营事项总线
- 任务中心基础

### Sprint 3-4

- AI 财税秘书
- 董事长驾驶舱第一版
- 单据、附件、归档改造

### Sprint 5-6

- 凭证、总账、明细账、余额表、日记账
- 月结闭环

### Sprint 7-8

- 税务事项、申报准备、留档
- 纳税人口径联动

### Sprint 9-10

- 研发财税中心
- 风险与勾稽中心

### Sprint 11-12

- 打印、PDF、资料包
- 全链路联调
- 回归与上线准备

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
