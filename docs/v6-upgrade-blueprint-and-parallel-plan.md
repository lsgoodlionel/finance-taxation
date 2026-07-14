# V6 升级蓝图与并行开发计划 — 串联收口 · 体验合并 · AI 月结

> 日期：2026-07-13
> 编制方式：全代码库重扫（路由表/导航/接线点逐一核实）+ 2026-07 外部前沿刷新 + 承接 `docs/v5-upgrade-blueprint-and-parallel-plan.md`
> 基线：`main`（V5 全车道已收敛，typecheck 绿 / API 单测 320 绿 / B2·C1 真实 PG 验证绿）
> 定位：V5 解决了「工程底座」，V6 解决三件事——**① 全模块功能串联收口（纯核心接线）② 操作简便性与引导（同类功能合并、流程简化）③ AI 从问答升级为 Agent 干活（月结自动化）**

---

## 执行进展 · Stage H AI 月结 Agent（旗舰，更新 2026-07-14，分支 `codex/v6-stage-h`）

> 入场策略：账务逻辑高风险，按协作约束先建**可测纯核心 + 评测集**（不含自动过账/HTTP/DB 写入），把风险接线留给后续 PR + SME 评审。4 车道多 agent 并行，全部纯函数 + 单测。验证：api typecheck 绿 · API 单测 **378/378**（+50）。

| 车道 | 交付 | 关键点 |
|---|---|---|
| H3 自动分录评测集 | `ai-evals/journal-entry-bench.ts`（24 黄金集）+ 测试断言 accuracy ≥0.8 | **实测 95.8%** 通过 M4 门 |
| H1 草稿提案纯核心 | `ai-agents/close/draft-proposal.ts` `buildDraftProposal` | 借贷平衡**硬校验不交 LLM**；不平衡/needsReview/空行 → 强制 manual；本函数只产提案、绝不入账 |
| H2 月结编排纯核心 | `ledger/close-plan.ts` `buildClosePlan` | 8 步有序状态机（清扫→折旧→计提→票税→结转→快照→申报→归档）；前置未完则后续 blocked；票税 alert 卡 in_review |
| H4 异常检测纯核心 | `ai-agents/anomaly/detectors.ts` | 重复付款/断号发票/周末大额/税负突变 4 检测器 + 聚合 |

**评测暴露的两处关键真相（供后续 wave 决策，非放宽阈值）**：
1. `suggestAccountingEntry` **所有分支恒 `needsReview:true`** → 经 draft-proposal 真实路径 level 永远 = manual（符合「入账必经人批准」，但当前无「高置信可自动生成草稿」路径）。
2. 28 首年场景中 general/financing/rnd/tax 四类（约 53%）**无分录模板** → 恒返回 null+needsReview。已支持类型分类准确率 95.8%，但按真实类型分布的「全自动覆盖率」约 46%。→ 后续应**增强 accounting-agent 覆盖更多类型 + 区分进项/销项发票**，而非调低门槛。

**Stage H 剩余（高风险，需 PR + SME 评审）**：H1→草稿凭证入 `event_voucher_drafts` 队列 + inbox 草稿卡（G3 占位）接线；H2→月结向导 HTTP 端点 + 逐步批准驱动（结转/快照/归档串联，全程 hash 链留痕 F2）；H4→接 HTTP + inbox 预警卡 + 与风险勾稽合流；accounting-agent 类型覆盖增强。

---

## 执行进展 · Stage G 功能合并与引导（更新 2026-07-14，分支 `codex/v6-stage-g`，PR #7）

> 多 agent 并行（3 波共 9 车道），各 agent 在自有模块内构建、主控串行集成 App.tsx/AppLayout.tsx。验证：web typecheck 绿 · web 单测 57/57 · 生产构建通过。**导航 26 → 17 项（达成 ≤17 目标）**。PR #7（stacked on F 的 PR #6）。

| 车道 | 状态 | 落地 |
|---|---|---|
| G1 导出与归档中心 | ✅ | `pages/export-center/`（11 文件，10 类导出场景 + 历史）；`/export-center` 路由，`/pdf-export`·`/archive-package` → 301 重定向；导航 2 项并 1 |
| G2 票据中心 | ✅ | `pages/bills/BillsCenterPage`（3 Tab 包裹 单据/发票/银行，?tab 深链）；`/documents`·`/invoices`·`/banking` → `/bills?tab=` 重定向；「外部系统对接」组撤销、3 项并 1 |
| G3 inbox-first 工作台 | ✅ | `MyDayPage` 重构 + `pages/inbox/`（待办/风险/审批/AI草稿[占位] 四类卡片）；登录默认落 `/inbox`；`/tasks` 降级出一级导航（路由保留供深链） |
| G4 工资域合并 | ✅ | `pages/payroll/PayrollDomainPage`（工资管理 + 代发与社保 Tab）；`/payroll/transfer` → `/payroll?tab=transfer`；导航 2 项并 1 |
| G5 链路条全覆盖 | ✅ | `FinanceFlowBar` 补到总账页（报表页原已有）；闭合凭证过账→报表/总账断点，无新增 stage 枚举 |
| G6 场景引导 v2 | ✅ | `lib/scene-commands.ts` + CommandPalette「场景」组：发工资/收到发票/要报税/月底结账/导出资料/记一笔 → 直达合并后新路由 |
| G7 大页拆分 | ✅ | `AssistantPage` 1022 → 334 行 + `pages/assistant/` 13 子文件（全部 <400 行），零行为变更 |

**wave 3 收敛（21→17）**：W3-a 系统中心 `pages/system/SystemHubPage`（设置+计费+反馈 3 Tab，/billing·/feedback → /settings?tab= 重定向，系统组 3→1）；W3-b 合同与往来 `pages/contracts/ContractsDomainPage`（合同+往来 2 Tab，/counterparties → /contracts?tab= 重定向，2→1）；月度结账 /close 移出一级导航（路由保留，入口经 inbox 提醒 + ⌘K「月底结账」场景命令）。

**导航明细（17 项）**：业务入口(4: inbox/assistant/events/驾驶舱) · 经营管理(2: 合同与往来/工资) · 财务运营(5: 票据中心/凭证/总账/报表/导出归档) · 税务(1) · 研发风控(3: 研发/风险/审计) · AI与工具(1: 制度库) · 系统(1: 系统中心)。

**剩余 Stage G 项**：各 Tab 容器直接嵌现有页（含各自 hero 壳层，视觉略嵌套，后续可下沉轻壳）；G3 AI 草稿卡为 Stage H 占位；E2E 更新（旧路由重定向、新容器页）。

---

## 执行进展 · Stage F（更新 2026-07-14，已提交 PR #6，均经磁盘 + typecheck + 单测 + 真实 PG 验证）

> 本节记录真实落地状态，供接力追溯。基线较下方蓝图已推进：Stage F 后端接线 + 前端消费 + F5 调度 + F9 校验机制已完成；F8 出设计方案待评审。**当前全部改动未提交（工作区待 commit）**，`typecheck:v2` 绿、API 单测 **328/328** 绿、路由构建冒烟通过。

| 项 | 状态 | 落地 / 证据 |
|---|---|---|
| **F1 票税一致性** | ✅ 接线 | `GET /api/tax-integration/consistency`（`consistency.routes.ts`）+ 风险页「票税比对」面板（`risk/TaxConsistencyPanel.tsx`）。申报数暂缺稳定来源 → `declaredDataAvailable:false` 显式标注 |
| **F2 审计 hash 链** | ✅ 接线 | migration `036` + `services/audit.ts`（per-company 串行链式写入 + `buildAuditPayload` 写/校验共用）+ `GET /api/audit/verify-chain` + 审计页「校验完整性」 |
| **F3 数电票解析** | ✅ 接线 | `POST /api/invoices/parse`（`einvoice.routes.ts`，解析+价税校验+入库）+ 发票页「导入数电票」 |
| **F4 AI 决策门** | ✅ 接线 | `POST /api/ai/automation/decide`、`GET .../thresholds`（`ai-agents/governance.routes.ts`）+ 设置页「AI 自动化治理」只读展示 |
| **F5 调度 runner** | ✅ 完成 | migration `038_scheduled_jobs` + `jobs/runner.ts`（ALS 无关的 setInterval 轮询 + `resolveJobOutcome` 纯函数退避）+ `jobs/handlers.ts`（overdue_task_scan）+ `GET/POST /api/jobs` + main.ts 挂载（env 开关）+ 4 条纯函数单测 |
| **F6 开放能力** | ✅ 接线 | migration `037_api_credentials` + `open-api/credentials.routes.ts`（API Key 生成/列出/撤销 + Webhook）+ 设置页「开放 API」 |
| **F7 预算差异** | ✅ 接线 | `GET /api/analytics/budget-variance` + 报表工作台「预算差异」面板 |
| **F9 校验覆盖** | ✅ 全量完成 | `RouteDef.bodySchema` + dispatch 统一校验（非破坏式、POST/PUT/PATCH，`dispatch.test.ts` 2 例）。**95 个变更路由全覆盖**：54 个消费 JSON body 的路由由 7 个并行 agent 逐 handler 核对后产出 schema（`routes/schemas/*.ts` 7 文件 51 条 + 3 条内联），经 `createAppRouter` 合并挂载；其余为 body-less action / multipart 上传（核实后不加 schema=安全）。已校验 51 个 schema key 全部命中真实路由（无孤儿）；required 仅在 handler 确有 400 守卫处标注（spot-check 抽验 knowledge/exports/settings 均属实） |
| **F8 多租户 RLS** | ✅ 机制+策略+激活链已实施并端到端 DB 验证 | 评审决策见 [`docs/v6-f8-rls-design.md`](v6-f8-rls-design.md)。**R1 采纳** AsyncLocalStorage 透明租户连接（核查证实 16 个自管事务模块**全部走 `withTransaction` 助手**→ 令其 ALS 感知、复用请求事务、无嵌套冲突）：`db/client.ts`（query/withTransaction 租户感知）+ `db/tenant.ts` `withTenantRequest`/`runTenantScoped` + `dispatch.ts` 注入（env `TENANT_RLS_ENABLED` 默认关，零回归）。**R2 采纳 (c)-当前**：只给 5 张纯请求上下文表（business_events/ledger_entries/vouchers/invoices/contracts）启 RLS（migration `039`），审计/调度所触及表暂不启用避免 fails-closed。**R3 采纳**：请求级事务原子化 + 2 个 SSE 端点标 `streaming:true` 豁免、其取数阶段改用 `runTenantScoped`（先取数后流式）。ENABLE 非 FORCE（owner 跑迁移/种子绕过）。**生产激活已交付**：`scripts/provision-app-role.sql`+`.sh` 建非属主 finance_app 角色（已跑通，属性 nosuper/nobypassrls/login ✓）。**端到端 DB 验证**：core-rls 隔离/拒写/fails-closed 3/3；ALS 运行时 query/withTransaction 携带上下文 1/1；**以 finance_app 真连的端到端强制隔离 PASS**（cmp-a 只见自身行）。**激活开关**：DATABASE_URL 指向 finance_app + `TENANT_RLS_ENABLED=true` |

**里程碑 M6.0「通电」达成**：7 纯核心接线 ✅ · 前端可见 ✅ · 调度 runner ✅ · 校验全量 ✅ · 多租户 RLS 机制+激活链 ✅ · **DB 集成验证 ✅**（036/037/038/039 迁移 + hash 链防篡改 + 调度完成/死信/重排 + RLS 隔离 + ALS 运行时 + finance_app 端到端强制隔离，共 10 例真实 PG 绿）｜ **全绿**：typecheck · API 单测 328/328 · apps 集成 5/5 · tools DB 集成 19/19。剩余为部署配置（切 DATABASE_URL 到 finance_app + 开 flag + 其余租户表分批启 RLS）与 F8 §5.2 异步写入包上下文的后续项。

**工程说明**：本轮采用真实多 agent 并行（6 后端车道 + 5 前端车道，均各自独立模块内实现），registry/api.ts 等共享文件集成由主控串行完成；每车道产物均经磁盘核实（早前一段被污染工具输出产生的"完成"假象已识别并作废重做）。修正的越界：删除某车道多建的未接线 `period_budgets` 表；修复 runner 退避双重自增 bug（单测捕获）。

---

## 0. 执行摘要（TL;DR）

- **现状**：业务纵深完整（26 页 / 206 API / 35 migrations），V5 交付了安全、架构、账务内核、多租户机制、7 个集成/AI 纯核心与 PWA 外壳。**但重扫证实：7 个纯核心 0 个接入 HTTP、`withTenantContext` 0 个业务调用点、入参校验仅覆盖 1/206 端点、RLS 未在任何业务表启用**——V5 的核心资产还躺在库里没通电。
- **体验侧**：导航 8 组 25 项，同类功能至少 5 组重叠（导出×4 入口、票据×3 入口、上传识别×3 处、工作台×3 页、工资×2 页）；财税链路条只覆盖 6/26 页；`AssistantPage` 1022 行超标。用户从「一笔业务」到「凭证入账」仍需跨 4–5 页手动找入口。
- **前沿刷新（2026-07）**：赛道已从「AI 问答」进入「**Agentic Close（AI 月结代理）**」——Pilot 发布全自主 AI Accountant，Digits 走 autonomous-first（AI 先做、人复核），Puzzle 发布 agent 月结方法论；共识模式是 **draft-then-approve（AI 起草分录/对账 → 批量呈报 → 人一键批准）**。本项目已有的「分级自动化决策门 + 月结向导 + 结转损益内核」恰好是这套模式的全部零件，**只差组装**。
- **V6 主线**：Stage F 接线收口 → Stage G 功能合并与引导简化 → Stage H AI 月结 Agent（旗舰）→ Stage I 外部真连与商用试点。四个 Stage 拆 9 条并行车道。

---

## 1. 现状全貌核查（2026-07-13 重扫实证）

### 1.1 规模盘点

| 维度 | 实测值 |
|---|---|
| 前端路由 | 27 条（`apps/web/src/App.tsx:37`），26 个页面（`/boss-qa` 已 301 → `/assistant`） |
| 导航结构 | 8 组 25 项（`AppLayout.tsx:70-149`）：业务入口 / 经营管理 / 财务运营 / 税务人力 / 研发风控 / 外部系统对接 / AI 与工具 / 系统 |
| 后端路由 | **206 条**（`apps/api/src/routes/registry.ts`），最大域：payroll 18 · banking 13 · settings 11 |
| 数据库 | migrations 001–035，约 45+ 张表 |
| 测试 | 123 个测试文件（含 3 个 `*.integration.test.ts`）；E2E 13 spec（smoke 7 + scenarios 6） |
| CI | `ci.yml` + `pr-review.yml` |

### 1.2 接线缺口（V6-F 的直接输入，逐项核实）

| V5 交付的纯核心 | 文件 | HTTP/持久层接线 |
|---|---|---|
| 票税一致性引擎 | `modules/tax-integration/consistency.ts` | ❌ 未接（registry 无引用） |
| 开票连接器（诺诺槽） | `modules/tax-integration/invoicing/` | ❌ 未接 |
| 审计 hash 链 | `security/hash-chain.ts` | ❌ 未接（审计写入未挂链） |
| 调度退避 | `modules/jobs/schedule.ts` | ❌ 未接（无 job runner 进程） |
| 数电票解析 | `modules/invoices/einvoice-parse.ts` | ❌ 未接（发票台账未调用） |
| AI 分级自动化决策门 | `ai-agents/governance.ts` | ❌ 未接（assistant 未走门） |
| API Key + Webhook HMAC | `security/api-credentials.ts` | ❌ 未接（无对外开放端点） |
| 数据智能 | `modules/analytics/` | 🟡 仅 2 条（cash-forecast / revenue-comparison）；预算差异未接 |
| 结转损益 | `modules/ledger/closing.ts` | ✅ 已接（`POST /api/ledger/periods/:id/close-income`） |

多租户与安全覆盖面：

- `withTenantContext`（`db/tenant.ts`）**除定义处外零调用点**；`migrations/` 中**无任何 `ENABLE ROW LEVEL SECURITY`**（RLS 证明只存在于集成测试临时建的表）→ C1 生产铺开度 ≈ 0。
- `utils/validate.ts` 仅 `middleware/auth.ts`（login）一处接入 → 入参校验覆盖 **1/206**。
- headers / rate-limit / redact ✅ 已全局生效（dispatch 层）。

### 1.3 同类功能重叠清单（V6-G 合并对象）

| # | 重叠组 | 现状入口 | 合并方向 |
|---|---|---|---|
| 1 | **导出类 ×4** | `/pdf-export`（688 行独立页）· `/archive-package` · 报表打印版 · 税务 printable（另有 4 条 `/api/exports` 路由） | 合并为一个「**导出与归档中心**」：场景卡片（月结包/审计包/单张凭证/工资条…）+ 历史记录；`/pdf-export`、`/archive-package` 下线，各业务页保留就地「导出」按钮直达对应场景 |
| 2 | **票据类 ×3** | `/invoices` 发票台账 · `/documents` 单据中心 · `/banking` 银行流水 | 统一「**票据收件箱**」心智：任何来源（上传/邮件/数电票结构化/银行流水）进同一收纳管道 → AI 识别 → 分派到 单据/发票/流水 三个视图（同页 Tab），保留深链 |
| 3 | **上传识别 ×3** | 单据 multipart 上传 · 知识库 `parse-documents` · 秘书 PDF 直传 | 抽公共「**智能上传识别管道**」组件 + 后端统一 `POST /api/ingest`（type=document/knowledge/chat），三处复用同一 UI 与解析链 |
| 4 | **工作台类 ×3** | `/inbox` 我的一天 · `/tasks` 任务中心 · `/dashboard/chairman` 驾驶舱 | 按角色收敛：**财务视角默认落 `/inbox`（inbox-first，融合任务待办）**，`/tasks` 降级为 inbox 的「全部任务」视图；驾驶舱保留为老板视角只读页 |
| 5 | **工资类 ×2** | `/payroll`（703 行）· `/payroll/transfer`（445 行） | 合并为「**工资域**」单入口：档案→计算→确认→代发→社保 一条向导流（现有工资向导扩到代发环节），导航减 1 项 |
| 6 | AI 入口 ×2（已收敛 1 例） | `/boss-qa` → `/assistant` ✅ 已合并 | 继续：驾驶舱 AI 摘要与 assistant 共用同一后端会话上下文，避免两套 prompt 漂移 |

### 1.4 串联断点（业务主链核查）

财税链路条（`features/process-flow`）现覆盖 **6/26 页**：Assistant / Events / Vouchers / Tax / Risk / DocumentDetail。断点：

1. **凭证过账后 → 报表/总账**：Reports、Ledger 页无链路条、无「来源事项」回溯；
2. **报表 → 申报**：有直达按钮，但申报完成后 → 归档（archive-package）需手动找入口；
3. **发票台账 / 银行管理**（外部对接组）完全游离于链路条之外，对账结果不回写事项链路；
4. **月度结账向导**（`/close`，146 行）只是 checklist，不驱动实际动作（结转、快照、申报、归档均需跳出手动做）——这正是 Stage H 的组装点。

引导现状：双主入口文案（`lib/entry-guidance.ts`）+ CommandPalette ⌘K + GlobalPeriodPicker + 导航角标已就位；缺**场景级引导**（"发工资"、"收到发票"、"要报税"一键进入对应流程）与**空状态下一步建议**。

---

## 2. 外部对标刷新（2026-07）

V5 蓝图 §3 的调研（复式记账铁律 / 分层对接策略 / 金税四期卖点）仍然成立，本节只做增量刷新：

- **Agentic Close 成为赛道主叙事**：[Pilot 2026-02 发布全自主 AI Accountant](https://cfotech.asia/story/ai-agents-shake-up-accounting-firms-bookkeeping-workflows)（onboarding→月结零人工）；[Puzzle 发布 AI Agent 月结方法论](https://puzzle.io/blog/ai-agents-month-end-close-guide)；Deloitte 2026-01：63% 财务组织已全面部署 AI。
- **两种人机模式分化**：Digits 走 **autonomous-first**（AI 先做、人复核结果）；主流稳妥派走 **draft-then-approve**（每笔 AI 起草的分录/对账例外先进复核队列，批量呈报、借贷全显、一键批准）——后者与本项目已有的 `governance.ts` 分级决策门完全同构，**V6 采用 draft-then-approve，本项目差异化在「硬校验绝不交 LLM」+ hash 链留痕**。
- **准确率是商用门槛**：行业公开口径为标准报表准备 95%+ 准确率；意味着 V6 必须建立**自动分录评测集**（用 migration 015 的 28 个首年场景作黄金标注集，是现成资产）。
- **开源侧**：[Bigcapital](https://openalternative.co/compare/bigcapital/vs/erpnext)（同栈参照）与 ERPNext 仍是域模型教科书；ERPNext 的 AI 均为外挂 add-on（changAI/NextAI），**开源界尚无「记账内核 + 原生 AI 治理门」一体的产品——这是本项目的空位**。Midday（TS/React，inbox-first + 时间轴 + magic inbox 邮件收票）是票据收件箱与极简 UX 的最佳交互参照。
- **中国合规**：数电票为默认形态、报税层无官方自助 API、乐企对 SME 不可及——V5 结论不变，开票/查验层走诺诺沙箱仍是唯一可真连路径。

来源：[cfotech.asia](https://cfotech.asia/story/ai-agents-shake-up-accounting-firms-bookkeeping-workflows) · [puzzle.io agent close guide](https://puzzle.io/blog/ai-agents-month-end-close-guide) · [puzzle.io best AI finance agents](https://puzzle.io/blog/best-ai-finance-agents) · [dualentry AI in accounting 2026](https://www.dualentry.com/blog/ai-in-accounting) · [openalternative Bigcapital vs ERPNext](https://openalternative.co/compare/bigcapital/vs/erpnext)

---

## 3. V6 设计原则（产品北极星）

> **从「26 页功能工具箱」→「三屏 AI 财税工作台」**：
> ① **收件箱（Inbox）** —— 所有待办、票据、审批、AI 草稿在一处，处理完即归零；
> ② **对话（Copilot）** —— 提问、上传、指挥 Agent 干活的统一入口；
> ③ **账簿（Books）** —— 凭证/总账/报表/税务等结果页，只读复核 + 导出。
> 其余页面全部是这三屏的下钻视图。**衡量指标：完成"收到一张发票→入账"从 ~12 次点击降到 ≤4 次；月结从跨 6 页手动操作降到向导内一键驱动 + 逐项批准。**

硬原则（继承 V5 并加严）：金额硬校验/借贷平衡绝不交 LLM；AI 只产草稿，入账必经人批准（draft-then-approve）；每个 AI 动作过 `governance.ts` 决策门并挂 hash 链留痕。

---

## 4. V6 升级蓝图（四 Stage）

### Stage F — 接线收口：让 V5 资产通电（1.5–2 周，P0）

**目标**：§1.2 表格全部变 ✅，无新功能，只做「核心→HTTP→持久层→前端消费」。

- **F1 票税一致性上线**：`consistency.ts` → `GET /api/tax-integration/consistency`（按期间比对进销项/税负）+ 持久化预警记录 → 风险勾稽页新增「票税比对」Tab + 税务中心横幅预警。
- **F2 审计链挂载**：`writeAudit` 写入时串 `hash-chain.ts`（prev_hash 列，migration 036）；审计页显示链校验状态；提供 `GET /api/audit/verify-chain`。
- **F3 数电票解析接线**：发票台账上传 XML/OFD → `einvoice-parse.ts` → 结构化落库 + 价税校验结果展示（为 Stage G 票据收件箱铺路）。
- **F4 AI 决策门接线**：assistant 的「建议创建事项/凭证」动作全部改走 `governance.ts` 分级门（auto/confirm/deny），返回决策级别给前端呈现。
- **F5 调度 runner**：以 `jobs/schedule.ts` 起最小 job runner（`setInterval` 轮询 jobs 表即可，暂不引 pg-boss），承接：申报到期提醒、逾期任务扫描、快照定时生成。
- **F6 开放能力**：`api-credentials.ts` → API Key 管理端点 + 1 个 Webhook 事件（凭证过账）打通端到端。
- **F7 analytics 补全**：预算差异端点 + 报表页消费三个 analytics 端点（图表化）。
- **F8 多租户生产铺开（高风险，独立车道）**：migration 037 给核心业务表加 `tenant_id` + `ENABLE ROW LEVEL SECURITY` + 策略；`dispatch.ts` 统一注入 `withTenantContext`（一处接入覆盖 206 路由，而非逐 handler 改）；建非超级用户 app 角色；DB 集成测试扩到 ≥5 张核心表。
- **F9 校验覆盖**：`utils/validate.ts` schema 声明入路由表（`RouteDef` 加 `bodySchema` 字段，dispatch 统一校验），POST/PUT 端点覆盖 100%。

### Stage G — 功能合并与引导简化（2 周，P0，可与 F 并行）

**目标**：§1.3 五组重叠合并落地，导航 25 项 → **≤17 项**；主链无断点。

- **G1 导出与归档中心**（合并组 1）：新 `ExportCenterPage`（场景卡片 + 历史）；`/pdf-export`、`/archive-package` 路由 301；各业务页「导出」按钮带参深链。
- **G2 票据收件箱**（合并组 2+3，借鉴 Midday magic inbox）：统一 `POST /api/ingest` 收纳管道（复用 F3 解析）；`/documents`、`/invoices`、`/banking` 流水导入合并为「票据中心」三 Tab；抽公共 `SmartUploadDropzone` 组件供知识库/秘书复用。
- **G3 inbox-first 工作台**（合并组 4）：`/inbox` 吸收任务待办、审批请求、AI 草稿（为 Stage H 预留队列区）、风险预警四类卡片；`/tasks` 变为其全量视图；登录后默认落 `/inbox`。
- **G4 工资域合并**（合并组 5）：工资向导扩为 档案→计算→确认→代发→社保申报 五步；`/payroll/transfer` 并入；导航减 1。
- **G5 链路条全覆盖**：process-flow 扩到 Reports/Ledger/票据中心/导出中心（§1.4 断点 1–3 闭合）；每个结果页固定「← 来源事项 / 下一步 →」导航条。
- **G6 场景引导 v2**：CommandPalette 增加**场景动词**（"发工资 / 收到发票 / 要报税 / 月底结账"→ 直达对应向导第一步）；全站空状态组件带「下一步建议 + 一键示例数据」；新手 checklist（公司信息→科目→首笔事项→首张凭证）。
- **G7 大页拆分**：`AssistantPage` 1022 行拆为 会话/流程图/建议动作 三模块（<400 行/文件）；Payroll、PdfExport、Settings、Events 同步拆到 <500 行。

### Stage H — AI 月结 Agent（旗舰，2–3 周，P1，依赖 F4/F5/G3）

**目标**：把「月度结账向导」从 checklist 升级为 **draft-then-approve 的 Agentic Close**——对标 Puzzle/Digits，2026 年的核心竞争位。

- **H1 自动分录草稿**：事项→分录建议器（规则引擎优先命中 + LLM 兜底分类），全部产出为 `draft` 凭证进 inbox 草稿队列，借贷全显、来源留痕、过 governance 门。
- **H2 月结 Agent 编排**：月结向导逐步自动执行——未入账事项清扫→折旧/摊销草稿→社保工资计提核对→票税一致性检查（F1）→结转损益（已有端点）→快照→申报底稿生成→归档包（G1）；每步产出草稿/检查结果，人逐项批准后推进；全程 hash 链留痕（F2）。
- **H3 准确率评测集**：以 migration 015 的 28 个首年场景为黄金集，建 `ai/evals/journal-entry-bench`，CI 报告分类准确率；**M4 验收「自动记账 ≥80%」在此闭环**。
- **H4 异常检测**：规则型（重复付款/断号发票/周末大额/税负突变）进 inbox 预警卡片，与风险勾稽引擎合流。

### Stage I — 外部真连与商用试点（2–3 周，P1/P2，外部依赖强）

- **I1 诺诺沙箱真连**：`InvoiceProvider` 接 `sandbox.nuonuocs.cn`（需申请凭证），开票/查验闭环 → 票税一致性用真实数据。
- **I2 企微/钉钉通知**：审批请求、风险预警、月结完成推送（需企业凭证）。
- **I3 多租户试点**：F8 之上造 3 家企业数据，验证隔离 + 计费联动（M2 收口）。
- **I4 移动审批**：PWA 深化——inbox 卡片移动端审批（批准 AI 草稿）、BottomSheet、暗色模式（M5 收口）。
- **I5 生产部署**：secrets 轮换、TLS、备份演练、安全扫描 0 CRITICAL、覆盖率 ≥60% 门禁 + E2E 扩到「票据→草稿→批准→月结」新主链。

### 里程碑

| 里程碑 | 验收标准 |
|---|---|
| **M6.0 通电** | §1.2 表全 ✅：7 核心接线 + RLS 铺开(≥5 表) + 校验 100% POST/PUT + 调度 runner 跑通 |
| **M6.1 简化** | 导航 ≤17 项 · 发票→入账 ≤4 次点击（E2E 断言）· 链路条覆盖主链全部结果页 · 无 >800 行页面 |
| **M6.2 AI 月结** | 月结向导一键驱动全步骤 · 自动分录评测 ≥80%（28 场景基准）· 全部 AI 动作过门 + 上链 |
| **M6.3 商用** | 诺诺沙箱真连 · 3 租户隔离运行 · 移动审批 · 安全扫描 0 CRITICAL + 覆盖率 ≥60% |

---

## 5. 并行车道分派（可直接开工）

沿用既有协作模型：每车道独立 worktree + `codex/v6-*` 分支从最新 `main` 切出；共享文件仅集成车道可改。

**高冲突共享文件（业务车道禁改，走集成窗口）**：`apps/api/src/routes/registry.ts`、`router/dispatch.ts`、`apps/web/src/App.tsx`、`AppLayout.tsx`、`lib/api.ts`、`packages/domain-model/src/index.ts`、`package.json`、`.github/workflows/*`。
> 注：F 阶段多数车道需要在 registry.ts 注册路由——各车道在自己模块内导出 `xxxRoutes: RouteDef[]` 数组，由集成车道每日窗口统一并入 registry，避免冲突。

### 波次与车道

```
波次 1（并行）：F 系接线（4 车道）+ G7 大页拆分
波次 2（并行，依赖波次 1 部分合入）：G1–G6 合并简化（3 车道）
波次 3（并行）：H 月结 Agent · I4 移动 · I5 生产化
外部凭证到位即插入：I1 诺诺 · I2 企微 · I3 租户试点
```

| 车道 | 分支 | 范围 | 依赖 | 完成定义 |
|---|---|---|---|---|
| K0 集成/共享文件 | `codex/v6-integration` | 唯一可改共享文件；每日合并窗口 | — | registry/导航/路由变更全部经此合入，CI 全绿 |
| K1 集成接线 | `codex/v6-wire-integration` | F1/F2/F3/F6：tax-integration、hash-chain、einvoice、api-credentials 模块内 | — | 4 组核心接 HTTP+持久化+前端消费，集成测试绿 |
| K2 AI 接线与治理 | `codex/v6-wire-ai` | F4/F7 + H3 评测集地基：ai-agents、analytics、assistant 模块 | — | 决策门生效、analytics 3 端点图表化、评测集跑通 |
| K3 调度与开放 | `codex/v6-jobs-runner` | F5：jobs 模块 + runner 进程 | — | 3 类定时任务跑通，退避可观测 |
| K4 多租户铺开 | `codex/v6-rls-rollout` | F8/F9：migrations、db/tenant、dispatch（经 K0） | — | ≥5 表 RLS + 全路由租户上下文 + 校验 100%，**高风险：PR + SME 评审** |
| K5 UX 合并·导出与票据 | `codex/v6-ux-merge-io` | G1/G2：导出中心、票据中心、ingest 管道 | K1(F3) | 导航减 3 项，旧路由 301，E2E 更新 |
| K6 UX 合并·工作台与工资 | `codex/v6-ux-merge-work` | G3/G4：inbox-first、工资域合并 | — | 导航减 2 项，inbox 四类卡片，工资五步向导 |
| K7 引导与链路 | `codex/v6-guidance` | G5/G6/G7：process-flow 扩展、场景命令、空状态、大页拆分 | — | 链路条全覆盖、场景动词 ≥4 个、无 >800 行页面 |
| K8 月结 Agent | `codex/v6-agentic-close` | H1/H2/H4：close 向导、草稿队列、异常检测 | K2/K3/K6 | M6.2 全项，**高风险：PR + SME 评审** |
| K9 移动与生产化 | `codex/v6-mobile-prod` | I4/I5：PWA 审批、暗色、E2E/覆盖率/扫描门禁 | K6 | M6.3 的非外部凭证项 |

### 每车道验收门禁（沿用 V5 八项，证据落 `artifacts/v6/<lane>/`）

1 typecheck:v2 绿 · 2 车道单测绿 · 3 相关集成/E2E 绿 · 4 无新增 CRITICAL · 5 不触共享文件（或经 K0）· 6 PR 含范围/验证/风险/回滚 · 7 高风险域（K4/K8 + 账务/税规）SME 评审 · 8 进度板回写。

### 启动命令模板

```bash
cd /Users/lionel/Develop/FT
git fetch origin
git worktree add ../ft-v6-<lane> -b codex/v6-<lane> main
# 进入后：npm install && npm run typecheck:v2 && npm run test:api
```

---

## 6. 立即启动的 3 件事

1. **K1+K2 接线双车道开工**（无外部依赖、无共享文件冲突、收益立现）：优先 F1 票税一致性与 F4 决策门——这两个是产品差异化卖点，通电即形成演示价值。
2. **K4 租户铺开设计评审先行**：`dispatch.ts` 统一注入 `withTenantContext` 的方案（一处覆盖 206 路由）+ RLS migration 草案，先出 PR 讨论再动手——这是 V6 风险最高的改动。
3. **申请外部凭证**（长周期，今天就发起）：诺诺沙箱账号、企微自建应用——Stage I 的日历时间由它们决定，代码槽位已就绪。

---

## 附录 · 本次核查关键证据索引

- 路由全集：`apps/web/src/App.tsx:37-70` · 导航分组：`apps/web/src/components/AppLayout.tsx:70-149`
- 后端路由表：`apps/api/src/routes/registry.ts`（206 条；analytics 仅 :1012-1013 两条）
- 未接线核心：`grep` 证实 consistency/invoicing/hash-chain/jobs/einvoice-parse/governance/api-credentials 在 registry.ts 零引用
- 租户零调用：`withTenantContext` 仅存在于 `apps/api/src/db/tenant.ts`；`migrations/` 无 RLS 语句
- 校验覆盖：`utils/validate.ts` 仅 `middleware/auth.ts` 引用
- 入口引导：`apps/web/src/lib/entry-guidance.ts`（双主入口 + boss-qa 别名）
- 链路条覆盖：`features/process-flow` 用于 Assistant/Events/Vouchers/Tax/Risk/DocumentDetail 共 6 页
- 页面规模：AssistantPage 1022 · PayrollPage 703 · PdfExportPage 688 · SettingsPage 665 · EventsPage 655
