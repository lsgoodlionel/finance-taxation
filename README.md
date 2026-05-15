# Finance Taxation Web Prototype

中国大陆中小企业财务及税务管理 Web 原型。

这个项目当前已经演进为 `前端高保真原型 + 后端骨架 + V2 升级方案` 的组合形态，聚焦企业经营事项录入、财税资料自动拆分、原始凭证归档、税务底稿预览、规则库匹配、本地 AI 辅助判断，以及后续向“AI 财税工作台”升级的工程化路线。它适合用于流程演示、产品验证、财税场景梳理、协作开发和内部培训，不应直接视为正式记账报税系统。

## 当前版本重点更新

本次版本在原有原型基础上，重点补强了以下能力：

- V2 报表、税务、研发、风险深化
  - 财务三表已补月 / 季 / 年快照持久化
  - 已支持报表差异分析、老板口径摘要、报表打印版
  - 已支持纳税人口径档案、税率规则与期间规则、增值税底稿、企业所得税准备、个税申报资料、印花税与附加税汇总
  - 已支持税务批次复核、留档、复核记录、留档记录
  - 已支持研发加计扣除资料包摘要、资本化 / 费用化冲突复核、政策补贴与研发口径提示
  - 已支持风险评分、异常关闭与复盘记录，以及收入/采购/研发勾稽规则深化
  - 已支持月结 / 审计 / 稽核资料包导出

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

## 功能概览（V2 当前版本）

V2 系统当前已具备完整的"经营事项 → 账务 → 税务 → 报表 → 风险"全闭环，共 10 个业务页面：

| 页面 | 路由 | 核心能力 |
|------|------|----------|
| 董事长驾驶舱 | `/dashboard/chairman` | 银行余额 / 利润 / 税负 / 风险事项 / AI 摘要 |
| 经营事项总线 | `/events` | 创建 / 编辑 / AI 拆任务 / 风险检查 |
| 任务中心 | `/tasks` | 任务树 / 状态流 / 催办 |
| 单据中心 | `/documents` | 附件上传（multipart）/ 归档 |
| 凭证中心 | `/vouchers` | 模板生成 / 校验 / 审核 / 过账 |
| 总账中心 | `/ledger` | 分录列表 / 科目余额 / 过账批次 |
| 财务报表 | `/reports` | 三表 + 快照 + 差异分析 + 老板摘要 + 打印版 |
| 税务中心 | `/tax` | 增值税底稿 / 企所税 / 个税 / 印花税 / 申报批次 / 复核留档 |
| 研发辅助账 | `/rnd` | 研发项目 / 费用归集 / 加计扣除资料包 |
| 风险勾稽 | `/risk` | 规则引擎 / 风险发现 / 异常关闭复盘 |

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
  - `src/pages/` — 10 个业务页面（驾驶舱 / 事项 / 任务 / 单据 / 凭证 / 总账 / 报表 / 税务 / 研发 / 风险）
  - `src/lib/api.ts` — 统一 API 客户端
  - `src/components/AppLayout.tsx` — 主导航布局
- `apps/api/` — V2 后端（Node.js + TypeScript）
  - `src/modules/` — 模块化路由（auth / access / events / tasks / documents / vouchers / ledger / reports / tax / rnd / risk）
  - `src/middleware/auth.ts` — JWT 认证中间件
  - `src/db/` — PostgreSQL client、migration runner、实体草案
- `packages/domain-model/` — 共享领域类型包（BusinessEvent / Task / Voucher / TaxItem 等）
- `backend/` — 旧版 JS 后端（保留供迁移参考）
- `docs/` — V2 设计文档与进度板
- `README.md`
- `STARTUP_YEAR1_SIMULATION.md`
- `STARTUP_YEAR1_VALIDATION.md`

## 本地运行

### 环境依赖

- Node.js >= 18
- PostgreSQL >= 14

### 配置环境变量

```bash
cp apps/api/.env.example apps/api/.env
# 修改 DATABASE_URL、JWT_SECRET 等必填项
```

### 初始化数据库

```bash
npm run -w @finance-taxation/api db:migrate
```

### 启动开发服务

```bash
# 后端 API（端口 3001）
npm run -w @finance-taxation/api dev

# 前端（端口 5173，新建终端）
npm run -w @finance-taxation/web dev
```

浏览器打开：

```text
http://localhost:5173/
```

### 演示账号

- 用户名：`admin`，密码：`123456`（董事长角色）

## 历史阶段说明（已收口）

- **Phase 0**（Sprint 0）：工程骨架搭建，monorepo / TS 工程 / env / migration 目录建立，已收口。
- **Phase 1**：身份权限、经营事项总线、任务中心、账务内核、单据、初步报表、初步税务，已收口。
- **Phase 2**：全量 PostgreSQL 迁移（下线 JSON 文件存储）、RBAC、驾驶舱、财务三表、税务运营中心、研发辅助账、风险勾稽引擎，已收口。

详细进度历史见：[docs/v2-progress-board.md](./docs/v2-progress-board.md)

## Phase 2 新增实现

- `EPIC-08` 财务三表首版
  - 后端已实现：
    - `GET /api/reports/balance-sheet`
    - `GET /api/reports/profit-statement`
    - `GET /api/reports/cash-flow`
  - 前端已接入报表中心页，支持月度 / 季度 / 年度切换
- `TASK-RND-01` 研发项目辅助账首版
  - 已新增 PostgreSQL migration：
    - `rnd_projects`
    - `rnd_cost_lines`
    - `rnd_time_entries`
  - 后端已实现：
    - `GET /api/rnd/projects`
    - `POST /api/rnd/projects`
    - `GET /api/rnd/projects/:id`
  - 已提供研发费用化 / 资本化 / 工时 / 可选加计扣除基数摘要
  - 已支持研发成本归集、工时录入和加计扣除资料包摘要
- `TASK-RISK-01` 风险勾稽首版
  - 已新增 PostgreSQL migration：
    - `risk_findings`
  - 后端已实现：
    - `GET /api/risk/findings`
    - `POST /api/events/:id/risk-check`
  - 首版规则包括：
    - 销售收入已入账但未形成增值税事项
    - 已过账凭证缺少关联原始单据
    - 研发支出未归集到研发项目辅助账
    - 存在逾期且阻塞的执行任务
    - 工资事项缺少个税处理
    - 工资事项缺少社保处理
    - 工资事项缺少公积金支持资料
  - 风险结果已返回评分和优先级
- `TASK-08-04 / 08-05`
  - 已支持报表快照保存、快照列表和差异分析
- `TASK-09-02 / 09-04 / 13-05`
  - 已支持税率规则与期间规则解析
  - 已支持企业所得税预缴与汇算准备视图
  - 已支持增值税底稿和企业所得税准备打印版
- `TASK-10-05`
  - 已支持研发项目资本化 / 费用化冲突复核和口径建议
- `TASK-11-01 ~ 11-04`
  - 已扩展销售合同缺失、回款依据缺失、采购进项税缺失、采购发票/付款依据缺失等风险规则
- V2 前端已增加 `documents` 占位页承接单据对象查询
- V2 前端已增加 `tax` 占位页承接税务事项和申报批次查询
- `documents` 前端已支持单据详情、附件绑定和归档动作承接
- `tax` 前端已支持批次详情、校验和提交动作承接
- `ledger` 前端已支持按凭证编号过滤钻取
- `vouchers` 前端已支持凭证详情、校验、审核、过账动作承接
- `ledger` 前端已支持按事项编号进一步过滤钻取
- `vouchers` 前端已支持修改凭证摘要
- `ledger` 前端已增加科目余额视图

当前已接入的 V2 接口（约 76 个）：

**认证与权限**

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/access/me`
- `GET /api/access/menu`（按角色过滤可见菜单项）

**经营事项与任务**

- `GET /api/events`、`POST /api/events`
- `GET /api/events/:id`、`PUT /api/events/:id`
- `POST /api/events/:id/analyze`
- `POST /api/events/:id/risk-check`（触发风险勾稽）
- `GET /api/tasks`

**单据**

- `GET /api/documents`、`GET /api/documents/:id`、`PUT /api/documents/:id`
- `POST /api/documents/:id/attach`、`POST /api/documents/:id/upload`（multipart）
- `POST /api/documents/:id/archive`、`GET /api/documents/:id/attachments`

**凭证**

- `GET /api/vouchers`、`GET /api/vouchers/:id`、`PUT /api/vouchers/:id`
- `GET /api/vouchers/:id/validate`、`POST /api/vouchers/:id/approve`、`POST /api/vouchers/:id/post`
- `GET /api/vouchers/:id/posting-records`
- `GET /api/vouchers/templates`（凭证模板列表）
- `POST /api/vouchers`（模板生成模式）

**税务**

- `GET /api/tax-items`、`GET /api/tax-items/:id`、`PUT /api/tax-items/:id`
- `GET /api/tax-filing-batches`、`POST /api/tax-filing-batches`、`GET /api/tax-filing-batches/:id`
- `POST /api/tax-filing-batches/:id/validate`、`POST /api/tax-filing-batches/:id/submit`
- `POST /api/tax-filing-batches/:id/review`、`POST /api/tax-filing-batches/:id/archive`
- `GET /api/tax-filing-batches/:id/reviews`、`GET /api/tax-filing-batches/:id/archives`
- `GET /api/taxpayer-profiles`、`POST /api/taxpayer-profiles`、`PUT /api/taxpayer-profiles/:id/activate`
- `GET /api/tax/rules`、`GET /api/tax/vat-working-paper`、`GET /api/tax/corporate-income-tax-preparation`
- `GET /api/tax/individual-income-tax-materials`、`GET /api/tax/stamp-and-surtax-summary`
- `GET /api/tax/printable`

**总账**

- `GET /api/ledger/entries`、`GET /api/ledger/posting-batches`
- `GET /api/ledger/summary`、`GET /api/ledger/balances`

**科目主数据**

- `GET /api/accounts`（支持 `category` / `q` / `leafOnly` 过滤）
- `GET /api/accounts/:code`

**财务报表**

- `GET /api/reports/balance-sheet`、`GET /api/reports/profit-statement`、`GET /api/reports/cash-flow`
- `GET /api/reports/snapshots`、`POST /api/reports/snapshots`、`GET /api/reports/diff`
- `GET /api/reports/chairman-summary`、`GET /api/reports/printable`

**研发辅助账**

- `GET /api/rnd/projects`、`POST /api/rnd/projects`、`GET /api/rnd/projects/:id`
- `POST /api/rnd/projects/:id/cost-lines`、`POST /api/rnd/projects/:id/time-entries`
- `GET /api/rnd/projects/:id/super-deduction-package`

**风险勾稽**

- `GET /api/risk/findings`、`POST /api/risk/findings/:id/close`
- `GET /api/risk/closure-records`

**资料包**

- `GET /api/packages/closing-bundle`（月结 / 审计 / 稽核资料包）

当前已接入的 V2 页面（10 个）：

- 董事长驾驶舱（`/dashboard/chairman`）— 真实数据：银行余额 / 利润 / 税负 / 风险事项 / AI 摘要
- 经营事项总线（`/events`）— 支持风险检查入口
- 任务中心（`/tasks`）
- 单据中心（`/documents`）— 支持 multipart 文件上传
- 凭证中心（`/vouchers`）— 支持凭证模板生成
- 总账中心（`/ledger`）
- 财务报表（`/reports`）— 三表 + 快照 + 差异分析 + 老板摘要 + 打印版
- 税务中心（`/tax`）— 增值税底稿 + 企所税 + 个税 + 印花税 + 申报批次管理
- 研发辅助账（`/rnd`）— 项目主数据 + 成本归集 + 加计扣除资料包
- 风险勾稽（`/risk`）— 规则引擎 + 风险发现 + 异常关闭复盘

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

## Phase 2 完成情况

**所有 Phase 2 任务已收口**，按完成顺序：

1. **DB-MIGRATE**（全部完成）：所有业务模块（auth / events / tasks / vouchers / ledger / documents / tax / rnd / risk / reports）已切换到 PostgreSQL；原 JSON 数据文件（`apps/api/src/data/*.v2.json`）已全部删除；新增 migrations 001–006
2. **TASK-07-02**：凭证模板与自动分录（5 种模板：销售/采购/费用报销/工资计提/固定资产采购）
3. **TASK-03-02/03/04**：驾驶舱利润概览、风险待办列表、AI 今日工作摘要
4. **EPIC-08**：财务三表（资产负债表/利润表/现金流量表）+ 快照持久化 + 差异分析 + 老板口径摘要 + 打印版 + 月结/审计/稽核资料包
5. **EPIC-09**（全部完成）：纳税人口径档案、税率规则与期间规则、增值税底稿、企业所得税预缴准备、个税申报资料、印花税与附加税汇总、批次复核与留档
6. **EPIC-10**（全部完成）：研发项目辅助账、成本归集、工时录入、加计扣除资料包、资本化/费用化冲突复核、政策补贴与口径提示
7. **EPIC-11**（全部完成）：风险规则引擎、评分模型、收入/采购/工资/研发/税务勾稽规则深化、风险关闭与复盘记录

**Phase 3 优先顺序：**

1. `TASK-09-08` — 税务批次自动归集与期间锁定
2. `TASK-10-07` — 研发项目成果与补贴申报资料绑定
3. `TASK-11-07` — 风险处置 SLA、升级和关闭后回归检查
4. `TASK-13-07` — 报表 / 税务 / 资料包 PDF 导出
5. `TASK-12-01` — 企业制度库

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

## V2 设计文档

- [V2 产品蓝图](./docs/v2-product-blueprint.md) — 目标用户、模块边界、Agent 规划
- [V2 升级开发计划](./docs/v2-development-plan.md) — 任务拆解与实施对照
- [V2 协作与开发运行机制](./docs/v2-collaboration-operating-model.md) — 分支策略与团队协作规则
- [V2 进度板](./docs/v2-progress-board.md) — 当前实时进度

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

## Phase 3 计划方向

以下为 Phase 3 的主要优先项（Phase 0–2 已全部完成）：

- **AI 财税秘书**（EPIC-04）— 自然语言交办 + 经营事件结构化识别
- **合同管理**（EPIC-02 补全）— 合同主数据 + 收入/采购闭环
- **员工 / 工资 / 社保 / 公积金**（EPIC-05 补全）— 工资计提闭环 + 个税勾稽
- **PDF 导出**（TASK-13-07）— 报表 / 税务底稿 / 资料包 PDF 渲染
- **老板问答 Agent**（EPIC-04-05）— 结构化数据已就绪，可接入问答层
- **完整审计日志**（EPIC-01-06）— 操作人 / 时间 / 资料来源追踪
- **企业制度库**（EPIC-12）— AI 建议优先参考企业内部口径
