# Finance Taxation V2

中国大陆中小企业财务及税务管理 Web 应用（V2 正式版）。

本项目为 `全栈 TypeScript monorepo + PostgreSQL + AI 辅助` 的形态，覆盖企业经营事项录入、账务内核、财税申报、合同管理、工资计算、研发辅助账、风险勾稽、AI 财税秘书、老板专线和审计日志，目标是为科技型中小企业董事长提供可以直接交办日常财税工作的 **AI 财税负责人工作台**。

## 当前状态

**Phase 0 → Phase 3 全部完成**（截止 2026-05-18）

| 阶段 | 状态 | 完成时间 |
|------|------|----------|
| Phase 0 Sprint 0（工程骨架） | ✅ 完成 | 2026-05-12 |
| Phase 1（身份权限 + 账务骨架） | ✅ 完成 | 2026-05-14 |
| Phase 2（PostgreSQL 全迁移 + 三表 + 税务 + 研发 + 风险） | ✅ 完成 | 2026-05-15 |
| Phase 3 Sprint P3-1（合同管理） | ✅ 完成 | 2026-05-15 |
| Phase 3 Sprint P3-2（员工/工资/社保/公积金） | ✅ 完成 | 2026-05-15 |
| Phase 3 Sprint P3-3（AI 财税秘书） | ✅ 完成 | 2026-05-15 |
| Phase 3 Sprint P3-4（PDF 导出） | ✅ 完成 | 2026-05-15 |
| Phase 3 Sprint P3-5（审计日志） | ✅ 完成 | 2026-05-15 |
| Phase 3 Sprint P3-6（老板专线 + 研发深化） | ✅ 完成 | 2026-05-15 |
| WS-FINAL（企业知识库 + 日记账 + 任务逾期 + 单测基线） | ✅ 完成 | 2026-05-16 |
| WS-BUGFIX（全功能验证修复，21/21 端点全 200） | ✅ 完成 | 2026-05-18 |
| WS-LOCK（锁账/反结账控制） | ✅ 完成 | 2026-05-18 |
| WS-SETTINGS（系统设置页） | ✅ 完成 | 2026-05-18 |
| WS-AI-OLLAMA（Ollama 本地 AI 降级） | ✅ 完成 | 2026-05-18 |
| WS-V1ALIGN（V1/V2 功能全对齐） | ✅ 完成 | 2026-05-18 |
| WS-UX（单据/凭证正式表格 + AI 识别上传 + 审计修复 + 风险交互升级） | ✅ 完成 | 2026-05-20 |
| **V3.0 升级**（全页结构化 + 统一 hero/section 壳层 + a11y/响应式 + 合同看板 + 工资向导） | ✅ 完成 | 2026-06-02 |
| **外部对接 P1–P5**（文件交换 · 发票验真 · 对账+工资代发 · 社保联动 · 银行 API 直连框架） | ✅ 完成 | 2026-06-02 |
| **日常效率 P0–P2**（全局期间 · 月度结账向导 · 待办收件箱 · 全局搜索⌘K · 导航角标 · 工资账号批量 · 发票→凭证 · 快速开始 · 报表→申报 · 面包屑） | ✅ 完成 | 2026-06-03 |
| **P6 AI Agent 体系**（留痕底座 + 会计/资料/审计/老板问答 Agent） | ✅ 完成 | 2026-06-03 |
| **P7 前瞻经营管理**（现金流 90 天预测 · 往来单位画像 · 申报到期提醒） | ✅ 完成 | 2026-06-03 |
| **P8 生产化**（健康检查/性能索引/容器探活 · 订阅计费体系） | ✅ 完成 | 2026-06-03 |

> 银行/税务**真实 API 联调（P8-C1）**已预留框架（P5），手工导入资料已闭环全部业务逻辑，待企业 CA 证书与开放平台签约后启用。

## 功能概览（V2 最终版）

系统共 **18 个业务页面**，覆盖"经营事项 → 账务 → 税务 → 报表 → 风险"完整闭环，并叠加合同、工资、AI 辅助、知识库、审计等高阶功能：

| 页面 | 路由 | 核心能力 |
|------|------|----------|
| 董事长驾驶舱 | `/dashboard/chairman` | 银行余额 / 利润 / 税负 / 风险事项 / AI 摘要 |
| 经营事项总线 | `/events` | 创建 / 编辑 / AI 拆任务 / 风险检查 / 跨页导航 |
| 任务中心 | `/tasks` | 任务树 / 状态流 / 逾期高亮 / 催办徽章 |
| 单据中心 | `/documents` | 附件上传（multipart）/ 归档 / 正式财务单据格式展示（含单据说明） |
| 凭证中心 | `/vouchers` | 模板生成 / 校验 / 审核 / 过账 / 摘要编辑 / 正式记账凭证表格（借贷合计） |
| 总账中心 | `/ledger` | 分录列表 / 科目余额 / 过账批次 / 日记账 Tab / 期间锁账 |
| 财务报表 | `/reports` | 三表 + 快照 + 差异分析 + 老板摘要 + 打印版 |
| 税务中心 | `/tax` | 增值税底稿 / 企所税 / 个税 / 印花税 / 申报批次 / 复核留档 |
| 研发辅助账 | `/rnd` | 研发项目 / 费用归集 / 加计扣除资料包 / 月度趋势 |
| 风险勾稽 | `/risk` | 规则引擎 / 风险发现 / 异常关闭复盘 / 事项选择升级为可搜索下拉列表 |
| 合同管理 | `/contracts` | 合同主数据 / 类型 / 状态流 / 关联事项 |
| 工资管理 | `/payroll` | 员工档案 / IIT 七级计算 / 社保公积金 / 工资确认 |
| AI 财税秘书 | `/assistant` | 流式对话 / 财税问答 / 建议事项一键创建 / PDF 直传识别（无需转图）/ 标准业务流程图回看 |
| PDF 导出 | `/pdf-export` | 工资汇总 / 工资条 / 凭证 / 报表快照四类 PDF |
| 审计日志 | `/audit` | 操作人 / 时间 / 模块 / 变更详情全量追踪 |
| 老板专线 | `/boss-qa` | 实时财务快照注入 + SSE 流式问答 |
| 企业知识库 | `/knowledge` | 制度条款 / 口径规则 / AI Prompt 关键词注入 / PDF & Word 批量上传 + AI 自动提取结构化内容 |
| 系统设置 | `/settings` | 公司信息 / AI 配置（Anthropic/Ollama）/ 关于系统 |

## V2 规划文档

- [V2 产品蓝图](./docs/v2-product-blueprint.md) — 目标用户、模块边界、Agent 规划
- [V2 升级开发计划](./docs/v2-development-plan.md) — 任务拆解与实施对照
- [V2 协作与开发运行机制](./docs/v2-collaboration-operating-model.md) — 分支策略与团队协作规则
- [V2 进度板](./docs/v2-progress-board.md) — 完整历史进度记录

## 项目结构

```text
.
├── apps/
│   ├── api/                        — V2 后端（Node.js + TypeScript）
│   │   ├── src/
│   │   │   ├── modules/            — 业务路由模块
│   │   │   │   ├── auth/           — 登录 / 刷新 / 登出（服务端吊销）
│   │   │   │   ├── access/         — me / menu（RBAC 过滤）
│   │   │   │   ├── events/         — 经营事项总线
│   │   │   │   ├── tasks/          — 任务管理（含逾期与催办）
│   │   │   │   ├── documents/      — 单据 + 附件 + 文件下载
│   │   │   │   ├── vouchers/       — 凭证 + 过账 + 分录
│   │   │   │   ├── ledger/         — 总账 + 科目余额 + 日记账 + 期间锁账
│   │   │   │   ├── reports/        — 三表 + 快照 + 差异分析 + 打印版
│   │   │   │   ├── tax/            — 税务底稿 + 申报批次 + 纳税人档案
│   │   │   │   ├── rnd/            — 研发项目 + 成本 + 工时 + 趋势
│   │   │   │   ├── risk/           — 风险勾稽引擎 + 复盘记录
│   │   │   │   ├── contracts/      — 合同主数据 + 事项关联
│   │   │   │   ├── payroll/        — 员工档案 + IIT + 社保/公积金
│   │   │   │   ├── assistant/      — AI 财税秘书（SSE 流式）
│   │   │   │   ├── boss-qa/        — 老板专线（实时快照注入 + SSE）
│   │   │   │   ├── pdf/            — 工资/凭证/报表 HTML 打印模板
│   │   │   │   ├── audit/          — 审计日志查询
│   │   │   │   ├── knowledge/      — 企业知识库 CRUD
│   │   │   │   ├── settings/       — 公司信息 / AI 配置
│   │   │   │   └── accounts/       — 科目主数据（60+ 科目）
│   │   │   ├── services/
│   │   │   │   ├── ai.ts           — AI 抽象层（Anthropic 优先 / Ollama 降级）
│   │   │   │   └── audit.ts        — writeAudit fire-and-forget 服务
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts         — JWT 认证中间件
│   │   │   ├── db/
│   │   │   │   ├── client.ts       — pg 连接池
│   │   │   │   └── migrate.ts      — migration runner（幂等）
│   │   │   └── utils/              — body 解析 / multipart / http 工具
│   │   └── migrations/             — 001–015 完整 schema + 种子数据 + 首年模拟数据
│   └── web/                        — V2 前端（React + TypeScript + Vite）
│       └── src/
│           ├── pages/              — 18 个业务页面
│           ├── components/
│           │   └── AppLayout.tsx   — 主导航布局（含退出登录服务端吊销）
│           └── lib/api.ts          — 统一 API 客户端
├── packages/
│   └── domain-model/               — 共享领域类型（BusinessEvent / Voucher / Contract / Employee / AuditLog …）
├── backend/                        — 旧版 JS 后端（保留供迁移参考）
├── docs/                           — V2 设计文档与进度板
├── STARTUP_YEAR1_SIMULATION.md
└── STARTUP_YEAR1_VALIDATION.md
```

## 本地运行

### 方式一：Docker Compose（推荐）

```bash
# 配置环境变量
cp apps/api/.env.docker apps/api/.env.docker.local
# 按需填入 ANTHROPIC_API_KEY 或 OLLAMA_BASE_URL

# 启动三服务（db / api / web）
docker compose up -d
```

浏览器打开：`http://localhost:5173/`

如需切换 AI 后端：
- **Anthropic Claude**：在 `.env.docker` 中填入 `ANTHROPIC_API_KEY`
- **本地 Ollama**：保持 key 为空，填入 `OLLAMA_BASE_URL` 和 `OLLAMA_MODEL`，重启 api 容器生效

### V4 验收环境

V4 验收必须使用独立测试数据库，不得连接生产数据库或日常开发数据库。

```bash
npm run v4:test:setup
npm run test:e2e
npm run v4:report
```

### 方式二：本地开发

#### 环境依赖

- Node.js >= 18
- PostgreSQL >= 14

#### 配置环境变量

```bash
cp apps/api/.env.example apps/api/.env
# 修改 DATABASE_URL、JWT_SECRET 等必填项
```

#### 初始化数据库

```bash
npm run -w @finance-taxation/api db:migrate
```

#### 加载演示数据（可选）

```bash
# 执行 migration 015，注入某科技有限公司首年（2026-01 至 2026-05）28 个完整业务场景
# 含：5名员工、6份合同、工资/税务/研发/风险全链路数据
psql $DATABASE_URL -f migrations/015_startup_year1_simulation.sql
```

#### 启动开发服务

```bash
# 后端 API（端口 3001）
npm run -w @finance-taxation/api dev

# 前端（端口 5173，新建终端）
npm run -w @finance-taxation/web dev
```

### 演示账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `chairman` | `123456` | 创始人董事长（全权限）|
| `finance` | `123456` | 财务负责人（财务全权限，无系统设置权）|

## AI 后端说明

系统支持两种 AI 后端，自动降级：

1. **Anthropic Claude**（优先）：配置 `ANTHROPIC_API_KEY` 后启用，用于财税秘书、老板专线和驾驶舱摘要
2. **本地 Ollama**（降级）：未配置 API Key 时自动切换，支持 `gemma4:latest` 等本地模型

切换方式见 `系统设置 → AI 配置` 页面说明。

## 已接入 API 接口（约 110+ 个）

### 认证与权限

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`（服务端吊销 session）
- `GET /api/access/me`
- `GET /api/access/menu`

### 经营事项与任务

- `GET /api/events`、`POST /api/events`
- `GET /api/events/:id`、`PUT /api/events/:id`
- `POST /api/events/:id/analyze`
- `POST /api/events/:id/risk-check`
- `GET /api/tasks`
- `POST /api/tasks/:id/remind`（催办）

### 单据与附件

- `GET /api/documents`、`GET /api/documents/:id`、`PUT /api/documents/:id`
- `POST /api/documents/:id/attach`、`POST /api/documents/:id/upload`（multipart）
- `POST /api/documents/:id/archive`、`GET /api/documents/:id/attachments`
- `GET /api/attachments/:id/download`（文件下载）

### 凭证

- `GET /api/vouchers`、`POST /api/vouchers`（模板生成）
- `GET /api/vouchers/:id`、`PUT /api/vouchers/:id`
- `GET /api/vouchers/:id/validate`
- `POST /api/vouchers/:id/approve`、`POST /api/vouchers/:id/post`
- `GET /api/vouchers/:id/posting-records`
- `GET /api/vouchers/templates`

### 总账与期间

- `GET /api/ledger/entries`、`GET /api/ledger/posting-batches`
- `GET /api/ledger/summary`、`GET /api/ledger/balances`
- `GET /api/ledger/cash-journal`（现金/银行日记账）
- `GET /api/ledger/periods`、`POST /api/ledger/periods`
- `POST /api/ledger/periods/:id/lock`、`POST /api/ledger/periods/:id/unlock`

### 科目主数据

- `GET /api/accounts`（支持 `category` / `q` / `leafOnly` 过滤）
- `GET /api/accounts/:code`

### 财务报表

- `GET /api/reports/balance-sheet`、`GET /api/reports/profit-statement`、`GET /api/reports/cash-flow`
- `GET /api/reports/snapshots`、`POST /api/reports/snapshots`、`GET /api/reports/diff`
- `GET /api/reports/chairman-summary`、`GET /api/reports/printable`

### 税务

- `GET /api/tax-items`、`GET /api/tax-items/:id`、`PUT /api/tax-items/:id`
- `GET /api/tax-filing-batches`、`POST /api/tax-filing-batches`、`GET /api/tax-filing-batches/:id`
- `POST /api/tax-filing-batches/:id/validate`、`POST /api/tax-filing-batches/:id/submit`
- `POST /api/tax-filing-batches/:id/review`、`POST /api/tax-filing-batches/:id/archive`
- `GET /api/tax-filing-batches/:id/reviews`、`GET /api/tax-filing-batches/:id/archives`
- `GET /api/taxpayer-profiles`、`POST /api/taxpayer-profiles`、`PUT /api/taxpayer-profiles/:id/activate`
- `GET /api/tax/rules`、`GET /api/tax/vat-working-paper`、`GET /api/tax/corporate-income-tax-preparation`
- `GET /api/tax/individual-income-tax-materials`、`GET /api/tax/stamp-and-surtax-summary`
- `GET /api/tax/printable`

### 研发辅助账

- `GET /api/rnd/projects`、`POST /api/rnd/projects`、`GET /api/rnd/projects/:id`
- `POST /api/rnd/projects/:id/cost-lines`、`POST /api/rnd/projects/:id/time-entries`
- `GET /api/rnd/projects/:id/super-deduction-package`
- `GET /api/rnd/trend`（月度成本趋势）

### 风险勾稽

- `GET /api/risk/findings`、`POST /api/risk/findings/:id/close`
- `GET /api/risk/closure-records`

### 合同管理

- `GET /api/contracts`、`POST /api/contracts`
- `GET /api/contracts/:id`、`PUT /api/contracts/:id`
- `POST /api/contracts/:id/close`
- `GET /api/contracts/:id/events`

### 工资管理

- `GET /api/employees`、`POST /api/employees`、`PUT /api/employees/:id`
- `GET /api/payroll/policy`、`PUT /api/payroll/policy`
- `POST /api/payroll/compute`、`GET /api/payroll`
- `POST /api/payroll/:id/confirm`
- `GET /api/payroll/periods`

### AI 辅助

- `POST /api/assistant/chat`（SSE 流式，财税秘书）
- `POST /api/boss-qa/chat`（SSE 流式，老板专线，实时财务快照注入）

### PDF 导出

- `GET /api/pdf/payroll`（工资汇总 HTML）
- `GET /api/pdf/payroll-slip/:employeeId`（个人工资条）
- `GET /api/pdf/voucher/:id`（凭证详情）
- `GET /api/pdf/report`（报表快照）

### 审计日志

- `GET /api/audit/logs`（分页 + 模块/时间/操作人过滤）

### 企业知识库

- `GET /api/knowledge`、`POST /api/knowledge`
- `GET /api/knowledge/:id`、`PUT /api/knowledge/:id`、`DELETE /api/knowledge/:id`
- `POST /api/knowledge/parse-documents`（multipart，PDF/Word 批量上传 + AI 内容提取）

### 系统设置

- `GET /api/settings/company`、`PUT /api/settings/company`
- `GET /api/settings/ai`
- `GET /api/settings/users`

### 资料包

- `GET /api/packages/closing-bundle`（月结 / 审计 / 稽核资料包）

## 已覆盖业务场景

当前规则库已覆盖并可生成对应单据、台账、归档卡或合规提醒的常见场景，包括但不限于：

- 银行账户管理费 / 银行利息收入
- 销售收款 / 收入调整与退款
- 采购付款 / 费用报销 / 业务招待费
- 设立与开办费用 / 云服务与软件订阅
- 研发外包与技术服务
- 薪酬发放 / 社保公积金缴纳
- 固定资产采购 / 折旧与摊销
- 借款与融资 / 借款利息 / 股东出资 / 利润分配
- 政府补助 / 增值税及附加 / 企业所得税 / 个人所得税扣缴 / 印花税
- 存货盘点与报损 / 资产处置
- 房租与水电物业 / 知识产权与资质申请
- 应收与坏账管理
- 月度结账与申报准备 / 年度归档与工商年报
- 研发加计扣除与汇算备查 / 罚款与捐赠

## 创业公司首年全流程压测

项目内置 `migrations/015_startup_year1_simulation.sql`，一键注入"某科技有限公司"第一年（2026-01 至 2026-05）**28 个完整业务场景**的结构化演示数据，覆盖：

| # | 场景 |
|---|------|
| 01 | 设立与开办费用 |
| 02 | 股东出资 |
| 03 | 办公室租赁押金 + 租金 |
| 04 | 云服务器 / SaaS 订阅 |
| 05 | 电脑显示器设备采购 |
| 06 | 软件著作权申请 |
| 07 | 员工工资（2026年3月）|
| 08 | 社保公积金（2026年3月）|
| 09 | 委外研发付款 |
| 10 | 客户A签约首付 |
| 11 | 客户A开票收入确认 |
| 12 | 客户B退款 |
| 13 | 应收逾期催收 |
| 14 | 差旅报销 |
| 15 | 业务招待 |
| 16 | 银行贷款 |
| 17 | 贷款利息 |
| 18 | 政府补助 |
| 19 | 增值税月报 |
| 20 | 个税扣缴 |
| 21 | 印花税 |
| 22 | 折旧摊销 |
| 23 | 月末结账准备 |
| 24 | 企业所得税预缴 |
| 25 | 研发加计扣除 |
| 26 | 年度归档年报 |
| 27 | 固定资产出售 |
| 28 | 罚款捐赠 |

加载方式：

```bash
psql $DATABASE_URL -f migrations/015_startup_year1_simulation.sql
```

执行后系统将具备：5名员工档案、6份合同、完整的凭证/账目/税务/风险数据，可直接在各业务页面浏览真实演示效果。

相关文档：

- 场景矩阵：[STARTUP_YEAR1_SIMULATION.md](./STARTUP_YEAR1_SIMULATION.md)
- 验证报告：[STARTUP_YEAR1_VALIDATION.md](./STARTUP_YEAR1_VALIDATION.md)

## Phase 3 完成明细

### Sprint P3-1：合同管理（2026-05-15）

- `migrations/007_contracts.sql` + `business_events.contract_id` 外键
- `contracts/routes.ts` — listContracts / createContract / getContractDetail / updateContract / closeContract / getContractEvents
- `ContractsPage.tsx` — 列表、筛选、新建、详情、关闭动作
- domain-model 扩展 Contract / ContractWithEventCount / ContractType / ContractStatus

### Sprint P3-2：员工/工资/社保/公积金（2026-05-15）

- `migrations/008_employees_payroll.sql` — employees + payroll_policy + payroll_records 表
- IIT 七级超额累进税率计算引擎（taxableIncome → iitWithheld）
- 社保/公积金 clamp 计算（base = clamp(gross, min, max)，员工+单位分别计算）
- `PayrollPage.tsx` — 员工管理 / 工资计算 / 参数设置三 Tab

### Sprint P3-3：AI 财税秘书 v1（2026-05-15）

- `@anthropic-ai/sdk` 接入，SSE 流式响应
- 系统 Prompt：公司名称 + 今日日期 + 近期经营事项 + 待办任务
- `AssistantPage.tsx` — 快捷提示 / 流式渲染 / 建议事项一键创建

### WS-PROCESSFLOW：AI 财税秘书标准业务流程图（2026-05-21）

- `docs/superpowers/specs/2026-05-20-assistant-business-process-flow-design.md` — 外购物品 / 业务招待通用主流程图设计
- `apps/web/src/features/process-flow/*` — 流程节点定义、状态推导、通用流程图卡片、阶段回看组件
- `AssistantPage.tsx` — 提交业务问题或附件时显示标准流程图，按会话保留流程位置，可反复回看
- `EventsPage.tsx` — 事项详情页高亮当前事项所处流程位置
- `DocumentsPage.tsx` / `TaxPage.tsx` / `VouchersPage.tsx` / `RiskPage.tsx` — 回看流程图并可点击节点穿透到上下游业务页

### Sprint P3-4：PDF 导出（2026-05-15）

- `pdf/template.ts` — `wrapHtml()` HTML 打印模板（A4 + CJK 字体）
- 工资汇总 / 工资条 / 凭证 / 报表快照四类路由
- `PdfExportPage.tsx` — 三 Tab 下载中心

### Sprint P3-5：完整审计日志（2026-05-15）

- `migrations/009_audit_log.sql` — audit_logs 表 + 三个索引
- `writeAudit()` fire-and-forget 服务（event / voucher / contract / payroll 写操作接入）
- `AuditPage.tsx` — 日志列表、类型/时间过滤、变更详情展开、分页

### Sprint P3-6：老板专线 + 研发深化（2026-05-15）

- `boss-qa/routes.ts` — 实时财务快照（现金/应收/税负/利润/风险事项）注入 Prompt + SSE
- `BossQAPage.tsx` — 6 个常见问题快捷入口
- `GET /api/rnd/trend` — 月度研发成本趋势（费用化/资本化/合计）

### Sprint F-1 ~ F-4：最终收尾（2026-05-16）

- **F-1** 企业知识库：`migration 010`、knowledge CRUD、KnowledgePage、AI Prompt 关键词注入
- **F-2** 日记账 + 事项跨页导航：getCashJournal API、LedgerPage Tab 重构（科目汇总/余额/日记账/总账分录）、EventsPage 凭证/单据跨页链接
- **F-3** 任务逾期 + 催办机制：isTaskOverdue、remindTask API、TasksPage 逾期高亮+催办按钮+逾期计数徽章
- **F-4** 单元测试基线：纯函数提取（`overdue.ts`）、6 条逾期测试、根 `npm run test`，共 44 passes

### WS-BUGFIX：全功能验证修复（2026-05-18）

修复 requireAuth 缺失（401）、表名错误（503）、RBAC 权限缺口（403）、migration 011 修复 UUID 类型崩溃（22P02）；21/21 端点全部 200。

### WS-LOCK：锁账/反结账控制（2026-05-18）

- `migration 012` accounting_periods 表
- `GET/POST /api/ledger/periods`、`lock` / `unlock` 接口
- postVoucher 过账前期间锁定检查
- LedgerPage 新增「期间锁账」Tab

### WS-SETTINGS：系统设置页（2026-05-18）

- `migration 013` companies 补充字段（creditCode / legalRep / bankName / bankAccount）
- `/api/settings/company`（GET/PUT）、`/api/settings/ai`、`/api/settings/users`
- `SettingsPage.tsx` — 公司信息 / AI 配置 / 关于系统三 Tab
- AppLayout 导航入口

### WS-AI-OLLAMA：AI 后端 Ollama 降级支持（2026-05-18）

- `services/ai.ts` 抽象层（Anthropic 优先 / Ollama 降级）
- docker-compose extra_hosts、`.env.docker` 新增 OLLAMA 配置
- 财税秘书 + 老板专线均已切换至统一 AI 服务层

### WS-V1ALIGN：V1/V2 功能全对齐（2026-05-18）

- `POST /api/auth/logout` — 服务端吊销 session，AppLayout 退出登录入口同步更新
- `migration 014` companies 扩展字段（统一社会信用代码 / 法定代表人 / 开户银行 / 银行账号）
- `GET /api/attachments/:id/download` — 磁盘文件读取并以正确 MIME 类型返回
- SettingsPage 公司信息表单已补充上述新字段的编辑和保存支持

### WS-UX：体验提升与 UI 精化（2026-05-20）

**企业知识库 — PDF/Word 批量导入 + AI 内容识别**

- 新增 `POST /api/knowledge/parse-documents` multipart 接口：接收 PDF 或 DOCX/DOC 文件（单个或批量）
- PDF 文件以 base64 document block 直传 Anthropic API 识别；Word 文件通过 `mammoth` 提取纯文本后送 AI
- AI 自动结构化提取：标题、分类、正文、关键词标签，结果以卡片形式展示
- 支持「填入编辑表单」（预填并手动微调）或「直接创建」两种落库方式

**单据中心 — 正式财务单据格式**

- 单据详情从简单字段列表升级为正式财务单据卡片：居中标题、信息表格、单据说明区块（含蓝色左边框高亮）
- 补全 `getDocumentDetail` JOIN `event_document_mappings` 返回 `notes` 字段
- 修复单据类型 / 状态在中文模式下显示英文的问题（`DOC_TYPE_LABELS` 补全 12 类型，`DOC_STATUS_LABELS` 补全 `awaiting_upload` / `ready` 等缺失映射）

**凭证中心 — 正式记账凭证格式**

- 凭证详情从列表布局升级为标准记账凭证表格：居中"记 账 凭 证"大标题、日期/凭证号/类型/状态行
- 分录行列：摘要 / 科目编码 / 会计科目 / 借方金额 / 贷方金额，底部合计行自动汇总
- 制单人 / 审核日期 / 过账日期 / 关联事项独立展示于凭证底部

**AI 财税秘书 — PDF 直接识别**

- 文件上传改为 📎 图标；提示文案说明 PDF 可直接识别，无需转为图片
- 底层已通过 Anthropic document block API 支持原生 PDF 理解

**审计日志 — 变更详情修复**

- 修复变更详情展开后仍显示原始 JSON 的问题
- 新增 `{ fieldName: { from, to } }` 格式识别（任务状态变更等场景）
- 新增通用 key-value 平铺回退，覆盖 `{ before, after }`、`{ data }` 及任意扁平对象格式
- 扩充 `valueLabel` 映射，各模块状态值均以中文标注

**风险勾稽 — 事项选择交互升级**

- 事项 ID 输入框升级为可搜索下拉列表：展示经营事项名称（标题 + ID）
- 支持键盘输入实时过滤，点击外部自动收起，已选事项以 `<code>` 标注显示
- 页面加载时自动预填第一个可用事项

## GitHub Actions

仓库当前已经补充 GitHub Actions，覆盖两类自动检查：

- **CI**：在 `push` 和 `pull_request` 上执行，校验前后端脚本语法、JSON 数据文件可解析性、关键项目文件是否存在
- **PR Review Summary**：在 PR 打开、更新时自动在 PR 里回帖说明当前自动审查覆盖范围

当前自动审查属于基础质量门禁，不替代人工财税规则复核。

## 历史阶段说明（已收口）

- **Phase 0**（Sprint 0）：工程骨架搭建，monorepo / TS 工程 / env / migration 目录建立，已收口
- **Phase 1**：身份权限、经营事项总线、任务中心、账务内核、单据、初步报表、初步税务，已收口
- **Phase 2**：全量 PostgreSQL 迁移（下线 JSON 文件存储）、RBAC、驾驶舱、财务三表、税务运营中心、研发辅助账、风险勾稽引擎，已收口
- **Phase 3**：合同管理、工资计算、AI 财税秘书、PDF 导出、审计日志、老板专线、企业知识库、锁账控制、系统设置、V1 功能全对齐，已收口

详细进度历史见：[docs/v2-progress-board.md](./docs/v2-progress-board.md)

## 依据与定位

本项目中的表单、报表和识别逻辑，尽量参考了中国大陆财务税务管理的常见实务和公开官方规则来源，例如：

- 《会计基础工作规范》/ 《中华人民共和国会计法》/ 《小企业会计准则》
- 企业所得税税前扣除凭证管理办法 / 研发费用加计扣除政策执行指引
- 个人所得税扣缴申报规则 / 增值税及附加税费申报规则
- 《中华人民共和国印花税法》/ 《企业信息公示暂行条例》

说明：

- 当前仍属于高保真演示原型，而不是正式报送系统。
- 页面中的税表和财务报表为展示型预览，不等同于税务机关电子申报模板的完整 1:1 复刻。
- 正式会计处理、正式申报、税收优惠适用判断仍应由专业人员最终确认。
