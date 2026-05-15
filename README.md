# Finance Taxation Web Prototype

中国大陆中小企业财务及税务管理 Web 原型。

这个项目当前已经演进为 `前端高保真原型 + 后端骨架 + V2 升级方案` 的组合形态，聚焦企业经营事项录入、财税资料自动拆分、原始凭证归档、税务底稿预览、规则库匹配、本地 AI 辅助判断，以及后续向“AI 财税工作台”升级的工程化路线。它适合用于流程演示、产品验证、财税场景梳理、协作开发和内部培训，不应直接视为正式记账报税系统。

## 当前版本重点更新

本次版本在原有原型基础上，重点补强了以下能力：

- 行为录入智能识别增强
  - 本地规则优先识别
  - 可选网络参考摘要
  - 可选本地 Ollama 辅助判断
  - 动态显示识别进度
  - 展示“识别依据”而不暴露模型原始推理
  - 增加“模型过程摘要（流式）”显示可读判断过程
- 生成结果展示重构
  - 右侧拆分为“本次输入刚生成的结果”和“历史记录”
  - 自动汇总本次新增单据数量、缺失凭证数量、补录入口和查询入口
- 凭证链完整性增强
  - 每条生成记录可标记待补原始凭证
  - 自动提示去哪里补、补后去哪里查
  - 下载与附件 URL 管理做了稳定性和内存释放优化
- 本地 AI 配置优化
  - 默认 Ollama 模型已调整为 `gemma4:latest`
  - 检索密钥不再持久化到 `localStorage`
  - 带密钥的自定义检索接口仅允许本地地址，降低误发到外部域名的风险

## 功能概览

- 统一导航
  - 总览
  - 录入中心
  - 单据报表
  - 规则库
  - 归档检索
  - 系统设置
- 录入中心
  - 单据录入
  - 行为录入
  - 税务事项录入
  - 原始凭证上传
  - 补充上传并绑定已有记录
- 行为录入智能判断
  - 本地规则库初判
  - 本地 Ollama 大模型辅助判断
  - 网络参考摘要
  - 输出会计科目建议、税务关注点、合规提醒、识别依据和生成建议
- 单据与报表
  - 记账凭证预览
  - 原始凭证归档封面预览
  - 小企业资产负债表
  - 小企业利润表
  - 现金流量表
  - 财务三表支持月度 / 季度 / 年度查询方案
  - 财务三表预览改为更接近常规填报/列报格式
  - 增值税及附加税费申报表示意版
  - 企业所得税预缴测算表
  - 个人所得税扣缴申报清单
- 归档检索
  - 单据总库查询
  - 单据列表表格化展示
  - 一张单据一行
  - 编号、类别、日期、部门、业务、金额、附件等主要字段集中显示
  - 支持按类别、时间、部门、业务等多条件组合查询
  - 在线预览
  - 下载资料
  - 导出清单
  - 跨页面跳转
- 系统设置
  - Ollama 地址
  - 模型名称
  - 温度参数
  - 网络参考开关
  - 自定义检索接口地址
  - 本地设置保存
  - Ollama 与检索接口测试

## 已覆盖业务场景

当前规则库已覆盖并可生成对应单据、台账、归档卡或合规提醒的常见场景，包括但不限于：

- 银行账户管理费
- 银行利息收入
- 销售收款
- 收入调整与退款
- 采购付款
- 费用报销
- 业务招待费
- 设立与开办费用
- 云服务与软件订阅
- 研发外包与技术服务
- 薪酬发放
- 社保公积金缴纳
- 固定资产采购
- 折旧与摊销
- 借款与融资
- 借款利息
- 股东出资
- 利润分配
- 政府补助
- 增值税及附加
- 企业所得税
- 个人所得税扣缴
- 印花税
- 存货盘点与报损
- 资产处置
- 房租与水电物业
- 知识产权与资质申请
- 应收与坏账管理
- 月度结账与申报准备
- 年度归档与工商年报
- 研发加计扣除与汇算备查
- 罚款与捐赠

## 创业公司首年全流程压测

项目已补充了一套“科技创业公司首年财税全流程”模拟资料，并据此做过顺序化压测，覆盖：

- 公司设立、开户、开办费
- 股东出资
- 租赁、押金、办公费用
- 云服务、软件订阅、研发外包
- 固定资产采购、知识产权申请
- 工资、个税、社保公积金
- 销售回款、退款、红字发票、坏账风险
- 差旅参会、业务招待
- 借款、利息、政府补助
- 月度结账、税务申报准备
- 企业所得税预缴、研发加计扣除
- 年度归档、工商年报、税务稽核备查

相关文档：

- 场景矩阵：[STARTUP_YEAR1_SIMULATION.md](./STARTUP_YEAR1_SIMULATION.md)
- 验证报告：[STARTUP_YEAR1_VALIDATION.md](./STARTUP_YEAR1_VALIDATION.md)

## V2 规划文档

仓库已经补充 V2 升级蓝图与协作机制文档：

- [V2 产品蓝图](./docs/v2-product-blueprint.md)
- [V2 升级开发计划](./docs/v2-development-plan.md)
- [V2 协作与开发运行机制](./docs/v2-collaboration-operating-model.md)
- [V2 进度板](./docs/v2-progress-board.md)

这些文档用于指导后续多人员、多 Agent、多分支并行开发，目标是将当前系统升级为可供科技型中小企业董事长直接交办日常财税工作的 `AI 财税负责人工作台`。

## 项目结构

当前项目主要包含：

- `index.html` / `src/` — 旧版单页原型（保留供参考）
- `apps/web/` — V2 前端（React + TypeScript + Vite）
  - `src/pages/` — 7 个业务页面（驾驶舱 / 事项 / 任务 / 单据 / 凭证 / 总账 / 税务）
  - `src/lib/api.ts` — 统一 API 客户端
  - `src/components/AppLayout.tsx` — 主导航布局
- `apps/api/` — V2 后端（Node.js + TypeScript）
  - `src/modules/` — 模块化路由（auth / access / events / tasks / documents / vouchers / tax / ledger）
  - `src/middleware/auth.ts` — JWT 认证中间件
  - `src/services/jsonStore.ts` — JSON 文件存储层（Phase 1 临时存储）
  - `src/data/` — Phase 1 运行时数据目录
- `packages/domain-model/` — 共享领域类型包（BusinessEvent / Task / Voucher / TaxItem 等）
- `backend/` — 旧版 JS 后端（保留供迁移参考）
- `docs/` — V2 设计文档与进度板
- `README.md`
- `STARTUP_YEAR1_SIMULATION.md`
- `STARTUP_YEAR1_VALIDATION.md`

## 本地运行

在项目目录执行：

```bash
python3 -m http.server 8080
```

浏览器打开：

```text
http://127.0.0.1:8080/
```

## Sprint 0 基线

V2 已开始进入 `Sprint 0`，当前仓库新增了正式工程骨架：

- `apps/web`
  - React + TypeScript + Vite 的正式前端入口
- `apps/api`
  - TypeScript 后端入口，用于承接后续正式 API 模块
- `packages/domain-model`
  - `business_events`、`tasks` 等共享领域类型起点
- `apps/api/src/db/entities.sql`
  - Sprint 0 的角色、组织、经营事项、任务实体草案
- `apps/api/migrations/`
  - 正式 migration 目录占位
- 根目录 `package.json`
  - 提供 `npm run verify` 作为基础质量门禁
- `docs/rbac-organization-model.md`
  - 正式 RBAC、组织、数据域设计基线
- `docs/business-events-task-model.md`
  - 正式 `business_events` / `tasks` 统一对象设计基线

当前 `npm run verify` 会执行：

- 原型前端脚本语法检查
- 现有 JS 后端语法检查
- `backend/data` JSON 结构检查
- `docs/v2-progress-board.md` 结构检查

此外，V2 根目录还预留了：

```bash
npm run typecheck:v2
```

用于在依赖安装完成后检查：

- `apps/web`
- `apps/api`

`Sprint 0` 第二批任务当前已经补齐：

- `TASK-01-01` 用户、角色、权限模型设计
- `TASK-02-01` `business_events` 数据模型
- `TASK-03-01` 董事长首页基础卡片
- `TASK-05-01` 任务模型设计

`Sprint 0` 目前还补齐了：

- `apps/web` 的正式路由与 layout 基线
- `apps/api` 的模块化路由占位结构
- `apps/api/src/db/entities.sql` 数据实体草案

## Phase 1 当前进展

仓库已经开始进入 `Phase 1`，当前第一批实现已打通一条最小链路：

- 登录拿取 access token
- refresh token 续期
- 按企业维度访问菜单和数据
- 按部门维度收缩非公司级事项与任务视图
- 创建经营事项
- 查看经营事项列表、详情、活动时间轴
- 更新经营事项状态
- 触发经营事项的最小 AI 任务拆解
- 查看任务列表与任务树
- 在事项详情中查看单据映射、税务处理映射、凭证草稿
- 将分析结果同步落为正式 `documents`、`tax_items`、`vouchers` 对象
- 同一事项重复分析时替换既有 AI 任务和映射产物，避免无限叠加
- `documents` 已支持附件绑定与归档动作
- `vouchers` 已支持校验、审核和过账前检查
- `tax_items` 已支持按税种/期间生成申报批次草稿
- `documents` 已具备附件记录查询接口
- `vouchers` 已具备过账记录查询接口
- `tax_filing_batches` 已具备详情、批次校验、提交动作
- `vouchers` 过账时会同步生成总账分录与过账批次
- V2 前端已增加 `ledger` 占位页承接总账查询
- V2 前端已增加 `documents` 占位页承接单据对象查询
- V2 前端已增加 `tax` 占位页承接税务事项和申报批次查询
- `documents` 前端已支持单据详情、附件绑定和归档动作承接
- `tax` 前端已支持批次详情、校验和提交动作承接
- `ledger` 前端已支持按凭证编号过滤钻取
- `vouchers` 前端已支持凭证详情、校验、审核、过账动作承接
- `ledger` 前端已支持按事项编号进一步过滤钻取
- `vouchers` 前端已支持修改凭证摘要
- `ledger` 前端已增加科目余额视图

当前已接入的 V2 接口（38 个）：

**认证与权限**

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/access/me`
- `GET /api/access/menu`（按角色过滤可见菜单项）

**经营事项与任务**

- `GET /api/events`
- `POST /api/events`（需 `events.create` 权限）
- `GET /api/events/:id`
- `PUT /api/events/:id`（需 `events.create` 权限）
- `POST /api/events/:id/analyze`（需 `events.create` 权限）
- `GET /api/tasks`

**单据**

- `GET /api/documents`
- `GET /api/documents/:id`
- `PUT /api/documents/:id`（需 `documents.manage` 权限）
- `POST /api/documents/:id/attach`（需 `documents.manage` 权限）
- `POST /api/documents/:id/upload`（multipart 文件上传，需 `documents.manage` 权限）
- `POST /api/documents/:id/archive`（需 `documents.manage` 权限）
- `GET /api/documents/:id/attachments`

**凭证**

- `GET /api/vouchers`
- `GET /api/vouchers/:id`
- `PUT /api/vouchers/:id`（需 `ledger.post` 权限）
- `GET /api/vouchers/:id/validate`
- `POST /api/vouchers/:id/approve`（需 `ledger.post` 权限）
- `POST /api/vouchers/:id/post`（需 `ledger.post` 权限）
- `GET /api/vouchers/:id/posting-records`

**税务**

- `GET /api/tax-items`
- `GET /api/tax-items/:id`
- `PUT /api/tax-items/:id`（需 `tax.manage` 权限）
- `GET /api/tax-filing-batches`
- `POST /api/tax-filing-batches`（需 `tax.manage` 权限）
- `GET /api/tax-filing-batches/:id`
- `POST /api/tax-filing-batches/:id/validate`（需 `tax.manage` 权限）
- `POST /api/tax-filing-batches/:id/submit`（需 `tax.manage` 权限）

**总账**

- `GET /api/ledger/entries`
- `GET /api/ledger/posting-batches`
- `GET /api/ledger/summary`
- `GET /api/ledger/balances`

**科目主数据**

- `GET /api/accounts`（支持 `category` / `q` / `leafOnly` 过滤）
- `GET /api/accounts/:code`

当前已接入的 V2 页面（7 个）：

- 董事长驾驶舱（`/dashboard/chairman`）— 真实数据：银行余额 / 应收 / 税负 / 风险事项
- 经营事项总线（`/events`）
- 任务中心（`/tasks`）
- 单据中心（`/documents`）— 支持 multipart 文件上传
- 凭证中心（`/vouchers`）
- 总账中心（`/ledger`）
- 税务中心（`/tax`）

## Phase 2 Sprint 1 完成项（2026-05-14）

在 Phase 1 基础上，Phase 2 Sprint 1 已完成以下内容：

- **TASK-01-04** 菜单权限过滤：`GET /api/access/menu` 按用户角色返回可见菜单项
- **TASK-01-05** 全量 API 权限守卫：所有写操作加 `requirePermission`，视图操作加 view 权限
- **TASK-03-01** 驾驶舱真实数据：从 ledger / events / tasks / vouchers JSON 实时计算 4 张指标卡
- **TASK-07-01** 科目主数据：小企业会计准则 60+ 科目 + `GET /api/accounts`；`ChartAccount` 已加入 domain-model
- **TASK-06-02** 文件 multipart 上传：busboy 解析落盘 + `POST /api/documents/:id/upload`
- **DB-MIGRATE** PostgreSQL 基础设施：25 张表完整 schema（`migrations/001_initial_schema.sql`）+ 种子数据（`migrations/002_seed_data.sql`）+ pg 连接池（`src/db/client.ts`）+ migration runner（`src/db/migrate.ts`）

### 运行数据库迁移

```bash
# 配置 .env
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/finance_taxation_v2

# 执行迁移（跳过已应用版本，幂等）
npm run -w @finance-taxation/api db:migrate
```

## Phase 2 后续计划

按优先级：

1. **DB-MIGRATE-AUTH / EVENTS / TASKS**：将各业务模块从 JSON 文件存储迁移至 PostgreSQL（P0）
2. **TASK-07-02**：凭证模板与自动分录（P1）
3. **TASK-03-02 / 03 / 04**：驾驶舱深化——利润概览 / 风险卡片 / AI 摘要（P2）
4. **EPIC-08**：资产负债表、利润表、现金流量表生成（P2）

## GitHub Actions

仓库当前已经补充 GitHub Actions，覆盖两类自动检查：

- `CI`
  - 在 `push` 和 `pull_request` 上执行
  - 校验前端脚本语法
  - 校验后端源码语法
  - 校验 `backend/data` 下的 JSON 数据文件可解析
  - 校验关键项目文件是否存在
- `PR Review Summary`
  - 在 PR 打开、更新、重新打开、转为 Ready for review 时执行
  - 自动在 PR 里回帖说明当前自动审查覆盖范围和人工仍需复核的重点

当前自动审查仍属于基础质量门禁，不替代人工财税规则复核，也不替代正式端到端测试。

## V2 升级方向

V2 的目标不是继续扩展原型页面，而是构建面向科技型中小企业董事长、创始人和财务负责人的 `AI 财税工作台`，核心方向包括：

- 董事长驾驶舱
- AI 财税秘书
- 经营事项总线
- 任务中心与审批流
- 账务内核
- 税务运营中心
- 研发财税中心
- 风险与勾稽中心
- 归档、审计与资料包

详细内容见：

- [V2 产品蓝图](./docs/v2-product-blueprint.md)
- [V2 升级开发计划](./docs/v2-development-plan.md)

## 演示登录

- 用户名：`admin`
- 密码：`123456`

## 本地 AI 辅助判断

系统设置页支持接入本地 Ollama。

默认示例配置：

- Ollama 地址：`http://127.0.0.1:11434`
- 模型：`gemma4:latest`
- 温度：`0.2`

### 使用方式

1. 先启动本地 Ollama 服务。
2. 确保已拉取所需模型。
3. 打开页面中的“系统设置”。
4. 保存设置并点击“测试 Ollama”。
5. 回到“录入中心 -> 行为录入”。
6. 点击“重新识别”或“解析并生成”。

### 说明

- AI 判断是辅助初判，不是最终会计或税务结论。
- 页面会先跑本地规则，再结合网络参考和本地模型输出建议。
- 页面展示的是可读的识别依据、风险提示和推荐场景，不展示模型原始私有推理。
- 本地模型调用时会额外流式显示“过程摘要”，仅展示可读的事实、规则比对和风险提示，不展示私有思考。
- 正式入账、申报和税务处理仍需人工复核。

## 网络参考

系统设置页支持：

- DuckDuckGo Instant Answer
- 自定义 JSON 检索接口

注意：

- 某些浏览器环境下，第三方接口可能受跨域限制。
- 如需稳定线上能力，建议自建检索代理接口。
- 出于安全考虑，带密钥的自定义检索接口仅建议使用本地代理地址。

## 当前重要交互规则

- 本次新生成结果与历史记录分开展示，避免混淆
- 缺失附件不会被系统自动忽略，而会明确标记为待补凭证
- 系统中的税务资料均按“底稿/核对表/备查包”定位展示
- 工商年报、税务申报、汇算清缴仍需在对应官方系统中正式完成
- 归档检索页已升级为“上方查询、下方单据总列表”的集中式布局
- 单据总库以表格形式展示，一张单据一行，可直接点进完整单据预览
- 财务三表支持月度、季度、年度方案切换，表头和期间信息会同步联动

## 已验证的典型能力

- “今天招待客户吃饭，业务招待费200元”
  - 可识别为业务招待费
  - 不再错误落入待人工确认
- “今天公司买了一辆汽车，汽车费用100000元”
  - 可识别为固定资产采购
  - 自动拆分为采购审批、固定资产卡片、验收归档和缺失凭证提醒
- 差旅/参会复杂口述
  - 可按人员、机票、住宿、餐饮结构化拆分
  - 可自动生成审批、报销、票据索引和税务复核单
- 归档检索与导出
  - 支持单据总库多条件筛选
  - 支持表格化一行一单据展示
  - 支持在线预览完整原始单据
- 财务报表中心
  - 支持按月、按季、按年查看三大报表
  - 表格形式更接近常规财务列报结构
- 创业公司全年 28 个代表场景
  - 已做规则识别与生成链路压测

## 依据与定位

本项目中的表单、报表和识别逻辑，尽量参考了中国大陆财务税务管理的常见实务和公开官方规则来源，例如：

- 《会计基础工作规范》
- 《中华人民共和国会计法》
- 《小企业会计准则》
- 企业所得税税前扣除凭证管理办法
- 研发费用加计扣除政策执行指引
- 个人所得税扣缴申报规则
- 增值税及附加税费申报规则
- 《中华人民共和国印花税法》
- 《企业信息公示暂行条例》

说明：

- 当前仍属于高保真演示原型，而不是正式报送系统。
- 页面中的税表和财务报表为展示型预览，不等同于税务机关电子申报模板的完整 1:1 复刻。
- 创业公司首年全流程已经具备较好的场景覆盖，但正式会计处理、正式申报、税收优惠适用判断仍应由专业人员最终确认。

## 后续可扩展方向

- 拆分为多文件前端项目
- 接入真实后端和数据库
- 持久化附件与记录
- 接入正式登录权限体系
- 增加打印版与 PDF 版
- 增加总账、明细账、科目余额表、日记账
- 增加纳税人身份切换
  - 一般纳税人
  - 小规模纳税人
  - 简易计税路径
- 增加更强的勾稽校验
  - 合同、开票、回款、收入确认
  - 工资、个税、社保、公积金
  - 研发项目、辅助账、汇算优惠口径
- 增加创业公司专项模块
  - 股权激励
  - 资本化研发支出
  - 递延收益与专项补助摊销
