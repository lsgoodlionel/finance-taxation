# V5 升级蓝图与多 Agent 并行开发计划

> 日期：2026-07-11
> 编制方式：全代码库重扫 + 全规划文档梳理 + 开源同类/前沿调研 + 本地 vs GitHub 差异比对
> 基线：`codex/p3-reconciliation-engine`（领先 origin/main 97 提交），V4 多切片仍在各 worktree 未收口
> 定位：承接并刷新既有 `docs/upgrade-plan-phase10.md`（Phase 10–14），融合开源最佳实践，给出可直接多 Agent 并行分派的执行计划

---

## 0. 执行摘要（TL;DR）

- **产品**：面向中国大陆科技型中小企业董事长的「AI 财税负责人工作台」，全栈 TypeScript monorepo + PostgreSQL + AI 抽象层。业务纵深罕见完整：经营事项 → 任务 → 单据 → 凭证 → 总账 → 三大报表 → 税务 → 研发加计 → 风险 → 合同 → 工资 → AI → 对账，闭环齐全。
- **成熟度**：**高级原型 / 准 MVP（约 70–75%）**。业务广度已达商用产品水平，但**工程与安全底座偏薄**。
- **四大真实差距（从「能演示」到「能交付客户」）**：① 安全（明文密码等 CRITICAL）② 手写 1270 行路由的架构债 + CI 完全不覆盖 V2 ③ 账务结转不完整（资产负债表靠「本年利润」兜底配平）④ 缺 DB 集成测试与 E2E。
- **本地 vs GitHub**：`main` 本地=云端（停在 V4 baseline 脚手架），但**整条 v4 产线 + P1/P2 + 一批 v3 改造共 17 个分支仅存在于本地未推送**，另有 PR #1（Phase 9/10 文档）未合并。**存在明显「本地远超云端」落差，先收敛上云。**
- **升级主线**：Stage A 收敛上云 → Stage B 生产就绪硬底座（安全/CI/账务内核/架构）→ Stage C 多租户 SaaS 化 → Stage D 外部集成与 AI 治理 → Stage E 数据智能与移动体验。

---

## 1. 已完成功能全景（重扫结论）

### 1.1 技术栈与架构现状
| 层 | 现状 |
|---|---|
| 后端 `apps/api` | Node 原生 `node:http`（无 Express/Fastify），`app.ts` 手写 if/正则路由 ~1270 行；`pg` 连接池 + 手写 SQL（无 ORM）；自研迁移 runner + `schema_migrations` |
| 认证 | 自研 Bearer token + DB `sessions`（access/refresh 双 token）；**RBAC 硬编码 `ROLE_PERMISSIONS`（4 角色）** |
| AI | `@anthropic-ai/sdk` + OpenAI 兼容 fetch，多 provider（Anthropic/OpenAI/智谱/DeepSeek/Ollama），SSE 流式；`pdf-parse`/`mammoth`/OCR |
| 前端 `apps/web` | React 18 + Vite + SWC + TS；Ant Design v6 + Recharts + dnd-kit + react-router v6；自研 i18n/api client/URL state hook |
| 共享 `packages/domain-model` | 单文件 927 行纯 TS 类型 + `permissionCatalog`，前后端类型单一真源 |
| 数据库 | ~45 张表，`migrations/001–019` 纯 SQL；`015`（60KB）为「创业首年」仿真种子 |

> **三代实现叠加需清理**：V1 原型（`index.html`+`src/scripts/app.js`）、V1 后端（`backend/` JSON 存储，**但 CI 仍只检查它**）、V2/V3 正式版（`apps/*`）。`apps/api/migrations/` 与根 `migrations/` 重复。

### 1.2 业务模块完成度
| 域 | 完成度 | 备注 |
|---|---|---|
| 认证/会话/RBAC | ✅ | 硬编码角色；**明文密码（CRITICAL）** |
| 经营事项总线 | ✅ | `business_events` 9 类型 8 状态 + AI 拆任务 + 风险检查 |
| 任务中心 | ✅ | 任务树/逾期/催办/dnd 看板 |
| 单据中心 | ✅ | multipart 上传/归档/附件 |
| 凭证中心 | ✅ | 模板/校验/审核/过账，**强制借贷平衡 `|debit−credit|≤0.0001`** |
| 总账 | ✅ | 分录/科目余额/日记账/批次 + **期间锁账反结账** |
| 财务报表 | ✅（偏轻量） | 三表齐全，从 `ledger_entries` 按科目前缀实时汇总；⚠️ 资产负债表靠「本年利润 3131」行强制配平，**无自动结转损益/期末结账凭证**；余额在应用层内存算 |
| 税务中心 | ✅ | 增值税底稿/企所税/个税资料/印花附加/申报批次状态机 + 税规则引擎 |
| 研发辅助账 | ✅ | 项目/费用归集/工时/加计扣除资料包/趋势 |
| 风险勾稽 | ✅ | 规则引擎 + 评分 + 发现 + 关闭复盘 |
| 合同管理 | ✅ | CRUD/关闭/对象链接/时间轴 |
| 工资社保 | ✅ | **个税七级累进 `calcIit`** + 社保公积金 clamp |
| AI 秘书/老板专线 | ✅ | SSE 流式 + 财务快照注入 + OCR |
| 审计日志/知识库/PDF 导出/导出中心/系统设置 | ✅ | 全模块审计埋点；导出四类 PDF；结账包 |
| 对接层 P1（文件交换） | 🟡 | 税务 XML/CSV 导出、银行流水导入完成 |
| 发票验真 P2 | 🟡 | provider 框架完成，真实连通性未验证 |
| 银行对账 P3 | ✅ | 多策略置信度评分对账引擎完成 |

### 1.3 工程质量
- **单测充分**：API 32 + Web 42 = 74 测试文件，覆盖核心算法纯函数。
- **偏科**：全是 unit 纯函数级；**无 PostgreSQL 集成测试、无 E2E（无 Playwright）**、无覆盖率门禁。
- **CI 名存实亡**：`.github/workflows/ci.yml` 只对 V1 遗留代码做语法检查，**完全不跑 V2 typecheck 与 74 个测试**。

### 1.4 版本脉络
- **V2**（05-12→05-20）功能闭环建设，18 页 + 110+ API。
- **V3**（05-26→06-01）页面/交互重构（antd/Recharts/dnd-kit/RHF+Zod/sonner），Stepper-First/Drawer-Default/URL-State。残留：`v3-layout-visibility-polish` 未合回、responsive/a11y 未收口。
- **Phase 4–9**：外部对接 P1–P5、日常效率、AI Agent 底座、前瞻管理、生产化。Phase 9「全站财税链路条 F1–F9」进行中。
- **V4**（06-22 起）生产验收，纵向业务切片 + 工作流运行时。仅 V4-0 完成、V4-1A 进行中，V4-1B~V4-9 多在 worktree 未合回。

---

## 2. 本地 vs GitHub 差异（收敛上云清单）

| 类别 | 明细 | 动作 |
|---|---|---|
| main 分支 | 本地 = origin/main（`7a007d2`，V4 baseline） | 无需动作 |
| 仅本地未推送分支（17 个） | 整条 v4 产线（workflow-runtime/expense-purchase/workbench-usability/integration-final/production-acceptance-design）+ P1/P2 + 6 条 v3 改造 | **逐条评审 → 推送 → 走 PR → 合回 main** |
| 当前分支 | `codex/p3-reconciliation-engine` 领先 97 提交，2 个未提交改动（`api.ts`/`BankingPage.tsx`） | 提交或 stash，推送 |
| 未合并 PR | PR #1「Phase 9 完成 + Phase 10 方案」 | 评审后合并（文档已过时于 v4，合并时同步刷新） |
| broken ref | `refs/heads/main 2`（损坏引用） | `git update-ref -d` 清理 |
| prunable worktree | `/private/tmp/v4-workflow-runtime-verify` | `git worktree prune` |

> **风险**：v4 的大量真实功能只存在于本地磁盘，无云端备份、无 PR 评审、无 CI（且 CI 也没用）。这是当前**最高优先的工程风险**，Stage A 必须先解决。

---

## 3. 开源对标与前沿（升级依据）

### 3.1 同栈参考与域模型教科书
- **Bigcapital**（Node/TS + React + Knex，AGPL）：**与本项目栈最契合的现代 SaaS 会计**，直接对照其分录/科目/试算平衡/财报生成器实现。
- **Frappe Books**（TS + Vue，AGPL）：TS 双分录内核 + 本地化税制插件化。
- **ERPNext 会计模块**（GPL）：**企业级凭证-科目-总账-维度-税模板-财报**的最佳教科书。
- **Firefly III**（AGPL）：一流 REST/OpenAPI + **强规则引擎**（借鉴规则驱动自动记账）。
- **Akaunting**（已 fork，GPL）：模块化/插件市场 + multi-company + i18n 骨架，作产品形态参照。

### 3.2 复式记账内核最佳实践（落地 PostgreSQL）
- 模型：`accounts`(type/parent/normal_balance/tenant) → `journal_entries`(posted 不可改) → `postings`(leg)。
- 铁律：**金额用整数最小单位 `bigint`（禁 float）**；**已过账 append-only，冲销走红字**；借贷平衡用约束/触发器强制；余额用**物化视图/快照 + 增量**；导入带 `idempotency_key`。
- 校验层：借鉴 **beancount 平衡断言 + 插件校验管线**做独立不变量层。
- 存储演进：吞吐成瓶颈时评估 **TigerBeetle**（核心账本）+ Postgres（业务/报表）双库；可编程账本参考 **Formance Ledger**。

### 3.3 中国财税合规前沿（2025–2026 现实结论，关键约束）
- **必须按"层"拆分对接策略**（这是路线图的硬约束）：
  - **开票/查验层 = 真有可用 API**。数电票（全电发票）自 **2024-12-01 全国推广**，为默认形态。走**诺诺（最开发者友好：公开文档 + 真实沙箱 `sandbox.nuonuocs.cn` + Java/PHP/.NET/Node SDK）/ 百望**。此层可做到生产级。
  - **报税层（增值税/企所税/个税/社保公积金）= 无官方开放自助 API**。市面「报税 API」实质是 **RPA / 模拟登录电子税务局**（或聚合器封装），存在 UI 变更、验证码、账号锁定等稳定性风险与合规模糊性，**必须显式定价这一风险**，不要在文案里宣称"直连税局申报"。个税侧最产品化（扣缴端封装），增值税/企所税基本靠 RPA。
  - **乐企（税局 system-to-system 直连）对 SME 不可及**：门槛约「年营收 ≥5000万 且 近12月开票+收票 ≥5万份 或 开票额 ≥50亿」。SME 只能走**前端业务系统自动开票**或**乐企联用试点**。
  - **官方电子税务局接口是申请制、审核周期长**（有《电子税务局第三方安全接入指南》），非注册即用。
- **金税四期「以数治税」** 打通 税务+工商+社保+银行 数据，自动比对票/税/资金/社保一致性 → **"票税一致性 + 审计留痕"是核心卖点与产品楔子**（发票 ↔ 增值税 ↔ 企所税 ↔ 个税 ↔ 社保基数 的自动勾稽/预警）。
- **研发费用加计扣除辅助账**：需按项目建**「2021 版」辅助账**（自行设计须含 2021 版全部数据项且逻辑关系一致），区分费用化/资本化、研发与生产费用严格分账。开源空白 + 合规刚需 → **可自动从「打标项目」的费用数据生成合规等价辅助账**，明确差异化点。

### 3.4 AI 前沿工程要点
- **分级自动化**：规则引擎兜底 + LLM 建议 + **人工最终确认**；自动记账借鉴 Firefly III 规则。
- OCR：数电票结构化直连；纸票/影像用 **PaddleOCR 自托管**降本。
- 财务问答：只读、带 schema 约束、结果可核对的工具调用 Agent；**金额/借贷平衡等硬校验绝不交给 LLM**。
- 异常检测：规则（重复付款/周末大额/断号发票）+ 轻量 ML（PyOD 思路），产品化金税四期比对逻辑。
- 治理：结构化输出、只读工具、关键动作留痕、评测集 + 质量门禁 + 成本治理。

### 3.5 架构选型（TS + Postgres）
| 关注点 | 建议 |
|---|---|
| 多租户 | 共享 schema + `tenant_id` + **Postgres RLS** 强隔离兜底；大客户升级 schema/db 隔离 |
| 审计 | append-only 事件表 + hash 链防篡改；`pgAudit` 备选 |
| 权限 | RBAC + 数据范围；前后端共用 **CASL**；复杂关系预留 OpenFGA |
| 报表 | 科目映射配置 + 物化视图自建；交互分析接 **Cube**；导出 ExcelJS/无头浏览器 |
| 任务/工作流 | **pg-boss（省 Redis）/ BullMQ**；跨天多步申报流用 **Temporal**；审批显式状态机 |
| 金额 | 整数最小单位为主，比率/汇率用 `NUMERIC`，前端 dinero.js |

---

## 4. V5 升级蓝图（分阶段）

> 承接既有 Phase 10–14，重排为 5 个 Stage，把「V4 收敛」前置为 Stage A，并用开源前沿刷新每阶段技术选型。

### Stage A — 收敛上云与清创（1–1.5 周，P0 阻断）
**目标**：消除「本地远超云端」风险，建立可信主干与真实 CI。
- A1 v4 切片收口：逐条评审 17 个仅本地分支，推送 + PR + 合回 main（工作流运行时 → 采购报销 → 差旅 → 合同收入依赖序）。
- A2 合并 PR #1 并刷新文档至 v4 真实状态；清理 broken ref、prunable worktree、三代遗留代码（`backend/`、`src/`、`index.html`、重复 migrations）。
- A3 **CI 重建**：跑 `typecheck:v2` + 74 测试 + `verify`；PR 门禁化。
- A4 **明文密码修复（CRITICAL）**：`middleware/auth.ts` 改 argon2/bcrypt + 迁移历史口令 + 登录失败锁定。

### Stage B — 生产就绪硬底座（2–3 周，P0）
**目标**：从「演示可用」到「生产可部署」。
- B1 安全加固：CSRF token、CSP、`express-rate-limit` 等价的限流、Zod 统一入参校验（当前仅 ~30% 端点）、安全头（HSTS/X-Frame/Referrer）、审计日志脱敏。
- B2 账务内核加固（吸收 beancount/ERPNext）：**自动结转损益 + 期末结账凭证生成**，去掉资产负债表兜底配平；余额改**物化视图/快照 + 增量**；引入 `idempotency_key`；科目表 CRUD 维护。
- B3 测试底座：Playwright E2E 覆盖 5 条核心流（登录→事项→凭证→过账→报表）；后端 DB 集成测试；覆盖率门禁（≥60% 起步）。
- B4 架构规整：`app.ts` 1270 行 → 领域路由注册模块化（主入口 <200 行）；统一 error 中间件；结构化日志（pino + requestId）；`apps/web/src/lib/api.ts` 按域拆分。
- B5 前端工程化：路由 `React.lazy` 懒加载；状态管理引入（Zustand/Jotai）；TanStack Query + 缓存；表单 RHF + Zod 统一；大页拆分（AssistantPage 1021 / SettingsPage 665 / PayrollPage 627）。

### Stage C — 多租户 SaaS 化（2 周，P1）
- C1 **共享 schema + `tenant_id` + Postgres RLS** 数据隔离。
- C2 权限精细化：CASL 前后端共用；字段级权限（如工资金额仅财务可见）；数据范围（公司/部门/成本中心）。
- C3 可配置审批流（凭证/合同/工资三级审批状态机）+ 自定义角色 + 多部门/子公司组织架构。

### Stage D — 外部集成与 AI 治理（2–3 周，P1，可与 C 部分并行）
- D1 数电票 + 持牌第三方（**分层对接，见 §3.3**）：开票/查验/进销项归集走诺诺沙箱→生产（此层可真连）；**报税侧只做「申报表生成 + 辅助填报 + 可选 RPA 适配器（隔离为独立可插拔模块、标注稳定性风险）」，不承诺税局直连申报**；乐企对 SME 不可及，定位前端自动开票/联用；银行 API 真连需 CA。
- D2 票税一致性引擎（金税四期卖点）：进销项/税负比对预警 + hash 链审计流。
- D3 任务/工作流：pg-boss/BullMQ 承接定时报税/对账/OCR；申报长流程评估 Temporal。
- D4 OCR：PaddleOCR 自托管 + 数电票结构化直连。
- D5 AI 治理：分级自动化落地（规则兜底 + LLM 建议 + 人工确认）；评测集 + 质量门禁 + 成本治理；财务问答 Agent 只读 + schema 约束。
- D6 开放能力：REST API + API Key；Webhook（凭证过账/风险触发/合同到期）；Excel 批量导入；企业微信/钉钉审批与推送。

### Stage E — 数据智能与移动体验（3 周，P2）
- E1 自定义报表（拖拽字段，接 Cube）+ 多期间同比环比 + 预算管理。
- E2 现金流预测增强（历史 12 月回归）；AI 自动记账（事项→分录）；AI 税务风险预警。
- E3 PWA 离线查看/审批；响应式深化（Drawer→BottomSheet）；暗色模式；i18n 框架（react-intl 中/英）；快捷键体系扩展。

### 里程碑
| 里程碑 | 验收标准 |
|---|---|
| **M0 主干可信** | 17 分支收敛 + CI 跑 V2 全绿 + 明文密码修复 |
| **M1 生产就绪** | 安全扫描 0 CRITICAL + E2E 5 条绿 + 覆盖率 ≥60% + 账务结转正确（无兜底配平） |
| **M2 多租户** | 3 家企业独立使用 + RLS 隔离验证 |
| **M3 集成打通** | ≥1 家持牌开票 API 真连 + 票税一致性预警 + 企微通知 |
| **M4 智能财税** | AI 自动记账准确率 ≥80% + 自定义报表可用 |
| **M5 移动办公** | PWA 安装 + 移动端审批完整 |

---

## 5. 多 Agent 并行开发计划（可直接分派）

> 沿用项目既有协作模型：每车道独立 `git worktree` + `codex/*` 分支，从**最新 main** 切出；业务分支优先**领域目录新增文件**，通过小注册接口接入；**高冲突共享文件只能由集成负责人改**。

### 5.1 高冲突共享文件（并行期禁止业务分支直接改）
`apps/api/src/app.ts`、`apps/web/src/App.tsx`、`AppLayout.tsx`、`apps/web/src/global.css`、`apps/web/src/lib/api.ts`、`package.json`、`.github/workflows/ci.yml`、`packages/domain-model/src/index.ts`、各 `progress-board.md`。改这些走「集成窗口」由集成负责人合并。

### 5.2 依赖顺序（波次）
```
波次 0（串行，阻断）：Stage A 收敛上云 + CI 重建 + 明文密码
波次 1（并行）：B4 架构规整 · B2 账务内核 · B3 测试底座 · B1 安全加固
波次 2（并行，依赖 B4/B2）：C 多租户 · D1/D2 外部集成 · D5 AI 治理
波次 3（并行）：E 数据智能 · E3 移动/i18n
```
> 硬约束：**账务内核（B2）、税务规则、权限（C2）三类高风险改动禁止直接推主线**，必须走 PR + SME 评审。B4 架构规整应尽量早合，以减少后续所有分支对 `app.ts`/`api.ts` 的冲突。

### 5.3 车道分派表
| 车道 | 分支 | 范围（可改目录） | 不可改 | 完成定义 |
|---|---|---|---|---|
| L0 集成/清创 | `codex/v5-integration-cleanup` | 全局（唯一可改共享文件者） | — | 17 分支合回、CI 跑 V2 全绿、遗留代码清理、broken ref/worktree 清理 |
| L1 安全加固 | `codex/v5-security-hardening` | `apps/api/src/middleware/*`、新增 `security/*` | 业务 modules | 明文密码→argon2、CSRF/CSP/限流/安全头、Zod 覆盖率 100% 端点、安全扫描 0 CRITICAL |
| L2 账务内核 | `codex/v5-ledger-core` | `apps/api/src/modules/{vouchers,ledger,reports}/*`、新增 migrations | 其他 modules | 自动结转损益 + 期末结账凭证、去兜底配平、物化余额、`idempotency_key`、集成测试绿 |
| L3 架构规整 | `codex/v5-arch-refactor` | 由集成负责人协调改 `app.ts`/`api.ts` | 并行期锁 | `app.ts`<200 行模块化路由、error 中间件、pino 日志、api.ts 拆分 |
| L4 测试底座 | `codex/v5-test-foundation` | `apps/*/**/*.test.*`、新增 `e2e/*`、`ci.yml`（经 L0） | 业务逻辑 | Playwright 5 流、DB 集成测试、覆盖率门禁 ≥60% |
| L5 多租户 | `codex/v5-multitenant-rls` | 新增 migrations（RLS）、`modules/access/*`、`auth/*` | 账务算法 | tenant_id + RLS 隔离、CASL、字段级权限、审批流状态机 |
| L6 外部集成 | `codex/v5-integration-connectors` | `modules/{invoices,tax-integration,banking}/*`、新增 `connectors/*` | 账务核心 | 诺诺/百望 API 真连（沙箱）、票税一致性预警、pg-boss 任务、PaddleOCR |
| L7 AI 治理 | `codex/v5-ai-governance` | `modules/assistant/*`、新增 `ai/evals/*` | 账务/税务规则 | 分级自动化、评测集 + 质量门禁、只读 schema 约束 Agent、成本治理 |
| L8 数据智能 | `codex/v5-data-intelligence` | 新增 `modules/analytics/*`、前端 `pages/reports/*` | 账务写入 | 自定义报表（Cube）、同比环比、预算、现金流预测 |
| L9 移动/体验 | `codex/v5-mobile-i18n` | 前端 `pages/**`（响应式）、新增 `i18n/*`、PWA 配置 | 后端 | PWA、BottomSheet、暗色、react-intl 中/英 |

### 5.4 每车道验收门禁（8 项，写入 `artifacts/v5/<lane>/`）
1. `typecheck:v2` 通过　2. 该车道新增/相关单测通过　3. 相关集成/E2E 通过　4. 无新增 CRITICAL 安全项　5. 不触碰禁改共享文件（或经集成窗口）　6. PR 描述含范围/影响目录/验证/风险/回滚　7. 高风险域经 SME 评审　8. 进度板回写 + 验收证据落 `artifacts/`。

### 5.5 启动命令模板（每车道独立 worktree）
```bash
# 在财税主仓库执行；从最新 main 切出，避免历史分支累积
cd /Users/lionel/Documents/Codex/2026-04-24-https-github-com-lsgoodlionel-finance-taxation
git fetch origin
git worktree add ../ft-v5-<lane> -b codex/v5-<lane> origin/main
# 进入后：npm install && npm run typecheck:v2 && npm test
```

---

## 6. 立即启动的 3 件事
1. **Stage A 收敛上云**：把 17 个仅本地分支评审推送、合回 main，重建能跑 V2 的 CI（当前风险最高）。
2. **明文密码修复**：`apps/api/src/middleware/auth.ts` 改 argon2 + 历史口令迁移（上线阻断）。
3. **账务结转补齐**：结转损益 + 期末结账凭证，消除资产负债表兜底配平（财务正确性根基）。

---

## 7. 执行进展（更新 2026-07-11）

> 本节记录蓝图落地的真实状态，供接力与验收追溯。基线较 §0 已推进：A1/A3 收口发现已在 main 完成，本轮补齐 A4/A2。

### Stage A — 收敛上云与清创

| 项 | 状态 | 落地 / 证据 |
|---|---|---|
| A1 v4 切片收口 | ✅ 完成 | 17→ main 领先 origin **20** 提交（含本轮 A4/A2）；见 `docs/integration-report-2026-07-11.md` |
| A2 清创 | ✅ 完成 | `fe5b947`：删 V1 三代遗留（`backend/`·`src/`·`index.html`）+ 死占位（`apps/api/migrations/`、`tools/check-json.mjs`）；移除失效 `check:prototype/backend-js/data`；`verify` 重定义为真实 V2 门禁（typecheck:v2 + test:unit + check:progress）。核实 apps/tools 无源码引用；迁移 runner 指向根 `migrations/`。共删 39 文件 / -6779 行 |
| A3 CI 重建 | 🟡 大体完成 | CI 已跑 typecheck:v2 + api/web/v4 测试 + check:progress + v4-acceptance。**已知缺口**：`test:api` 的 glob `src/**/*.test.ts` 在 sh 下退化为单层，仅收集 4/62 测试文件——独立任务修复中（拆分 DB 集成测试后递归收集） |
| A4 明文密码（CRITICAL） | ✅ 完成 + 安全评审闭环 | `b3c2a04`：Node scrypt（OWASP 基线 N=2^17）替换明文比对；登录失败锁定（原子自增防竞态，423）；惰性升级历史明文；时序对齐防枚举；migration `034_login_lockout.sql`。安全评审无 CRITICAL，HIGH 已修，IP 级限流归 B1 |
| 收敛上云（push） | ⏸️ 待手动 | 外向发布分类器拦截，需人工在交互终端 `git push origin main`。这是达成 **M0 主干可信** 的最后一步 |

**M0 主干可信** 就绪度：17+ 分支收敛 ✅ · 明文密码修复 ✅ · CI 跑 V2（🟡 待补全测试收集）· 仅剩推送上云 ⏸️。

### Stage B — 生产就绪硬底座（进行中）

| 项 | 状态 | 落地 / 证据 |
|---|---|---|
| B4 架构规整 | ✅ 完成（已合 main） | 手写 1600+ 行 if 分发链 → 声明式路由表。新增 `router/router.ts`（路由核心 + 9 单测）、`router/dispatch.ts`（auth/permission 统一施加）、`observability/logger.ts`（零依赖结构化日志 + requestId）、`routes/registry.ts`（全部 ~190 路由声明 + handlers）。app.ts **1624→52 行**（主入口 <200 达标）；统一错误中间件（顶层 try/catch 兜底 500 + 结构化日志，覆盖全部路由）。分 11 提交增量迁移，每批 typecheck + verify + buildApp 冒烟全绿，零行为变更 |
| B1 安全加固 | ⏳ 下一项 | Zod 统一入参校验 + 安全头（HSTS/X-Frame/Referrer/CSP）+ 限流（补 A4 评审 H3 的 IP 级）+ CSRF |
| B2 账务内核 | ⏳ 待做（高风险） | 结转损益 + 期末结账凭证 + 去兜底配平 + 物化余额 + idempotency_key。需 DB 集成测试 + PR/SME 评审 |
| B3 测试底座 | ⏳ 待做 | Playwright 5 流 + DB 集成测试 + 覆盖率门禁 ≥60%（与后台 CI 测试收集任务交叠）|
| B5 前端工程化 | ⏳ 待做 | React.lazy 懒加载 + 状态管理 + TanStack Query + 大页拆分 |

---

## 附录 · 关键文件索引
- 路由分发：`apps/api/src/app.ts`　认证/明文密码：`apps/api/src/middleware/auth.ts`
- 账务内核：`apps/api/src/modules/vouchers/routes.ts`　报表：`apps/api/src/modules/reports/summary.ts`
- 领域模型：`packages/domain-model/src/index.ts`　CI：`.github/workflows/ci.yml`
- 既有规划：`docs/upgrade-plan-phase10.md`（PR #1）、`docs/v3-upgrade-spec.md`、`docs/v4-execution-index.md`、`docs/v4-progress-board.md`、`docs/v2-collaboration-operating-model.md`
