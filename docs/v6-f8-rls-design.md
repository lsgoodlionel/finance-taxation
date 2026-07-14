# F8 多租户 RLS 生产铺开 · 设计方案（供 SME 评审）

> 日期：2026-07-14 ｜ 阶段：V6 Stage F ｜ 状态：**设计待评审，未实施**
> 关联：`docs/v6-upgrade-blueprint-and-parallel-plan.md` §Stage F · F8/F9
> 定位：这是 V6 全项目**风险最高**的改动（触及每一次 DB 访问的连接模型 + 权限模型）。按协作约束，账务/权限类高风险改动**必须先评审再动手**，本文即为评审输入，不含生产代码变更。

---

## 1. 目标与动机

V5 的 C1 已交付 `withTenantContext`（`apps/api/src/db/tenant.ts`）与端到端 RLS 隔离**机制验证**，但**生产铺开度 ≈ 0**：

- `withTenantContext` 除定义处外**零业务调用点**（已 grep 证实）。
- `migrations/` 中**无任何 `ENABLE ROW LEVEL SECURITY`**——真实业务表未启用 RLS。
- 隔离目前**完全依赖应用层**每条 SQL 手写 `company_id = $1`。一旦某个 handler 漏写（206 路由、数百处 `query()`），即跨租户越权。

**F8 目标**：把租户隔离下沉到数据库，作为**纵深防御兜底**——即使应用层漏了 `company_id` 过滤，Postgres RLS 也拒绝跨租户读写。验收对齐里程碑 **M2 多租户**：≥5 张核心表启用 RLS + 全路由租户上下文 + 非超级用户运行时守卫。

---

## 2. 核心难点（为什么不能简单套用 withTenantContext）

现状连接模型（`apps/api/src/db/client.ts`）：

- 全代码库调用模块级 `query()`/`queryOne()` → 每次 `getPool().query()` **从连接池取任意连接、执行单条语句、自动提交、无事务、无租户上下文**。
- `withTenantContext` 则要求：**独占一个 `PoolClient` + 开事务 + `set_config('app.current_company', cid, true)`**（事务级设置，提交/回滚自动清除，不跨连接泄漏）。

矛盾：RLS 策略 `using (company_id = current_setting('app.current_company', true))` 只有在**携带该设置的连接**上执行才生效。但 handler 调的是全局 `query()`，拿的是没有设置的普通池连接。

**两条死路**：
- ❌ 逐 handler 改写为接收 tenant client：206 路由、数百处 `query()`，工作量巨大且极易漏改（漏一处即隔离失效，比现状更危险）。
- ❌ 会话级 `SET`（非事务级）：池连接复用会把设置泄漏给下一个租户的请求，灾难性。

**另一个隐藏致命坑**：应用当前以 `finance_taxation` 连接，该角色**极可能是业务表的属主（owner）**。**Postgres 中表属主默认 BYPASSRLS**——即使建了策略，属主连接也完全绕过。不换角色，RLS 形同虚设且「测试通过、生产裸奔」。

---

## 3. 选定架构：AsyncLocalStorage 租户连接 + dispatch 统一注入 + 非属主 app 角色

### 3.1 机制总览

```
requireAuth 通过后 → dispatch 在调用 handler 前：
  withTenantRequest(companyId, async () => {
     // 该请求内所有 query()/queryOne() 透明改用同一条 tenant 连接（已 BEGIN + set_config）
     await route.handler(req, res, params)
  })
```

用 `node:async_hooks` 的 **AsyncLocalStorage (ALS)** 保存「当前请求的 tenant `PoolClient`」。改造 `query()`/`queryOne()`：

```ts
// db/client.ts（改造后示意）
const tenantStore = new AsyncLocalStorage<{ client: PoolClient }>();

export async function query<T>(sql, params): Promise<T[]> {
  const ctx = tenantStore.getStore();
  const runner = ctx?.client ?? getPool();   // 有租户上下文用 tenant 连接，否则退回池
  return (await runner.query<T>(sql, params)).rows;
}
```

**关键收益**：**零 handler 改动**。所有既有 `query('... where company_id=$1', [cid])` 照常工作；RLS 在其下自动兜底。dispatch 一处接入即覆盖全部 206 路由。

### 3.2 dispatch 接入点

在 `apps/api/src/router/dispatch.ts` 的 `requireAuth` 之后、`route.handler` 之前，用 `withTenantRequest` 包裹（对**豁免路由**除外，见 §5.1）。`withTenantRequest` 负责 connect + BEGIN + set_config + 运行 + COMMIT/ROLLBACK + release，并把 client 放进 ALS。

### 3.3 非属主 app 角色（不可省略）

新增独立运行时角色，**不拥有表、无 BYPASSRLS、无 SUPERUSER**：

```sql
create role finance_app login password '...';
grant select, insert, update, delete on all tables in schema public to finance_app;
grant usage, select on all sequences in schema public to finance_app;
alter default privileges in schema public grant select, insert, update, delete on tables to finance_app;
-- 迁移/建表仍由 owner(finance_taxation) 执行；运行时 DATABASE_URL 换成 finance_app
```

RLS 对 owner 不生效、对普通角色生效——所以**生产 DATABASE_URL 必须指向 `finance_app`**，迁移用 owner。这是「测试能证明隔离」的前提。

---

## 4. 策略模式与表清单

### 4.1 标准策略（每张租户表）

```sql
alter table <t> enable row level security;
alter table <t> force row level security;   -- 连属主也强制（双保险）
create policy <t>_tenant_isolation on <t>
  using      (company_id = current_setting('app.current_company', true))
  with check (company_id = current_setting('app.current_company', true));
```

`using` 管读/更新/删除可见性，`with check` 防止写入/改成别的租户。`current_setting(..., true)` 的第二参 `true` = missing_ok：无上下文时返回 NULL，策略比较为 NULL → **fails-closed（什么都读不到）**，符合安全默认。

### 4.2 表三分类（共 32 张含 company_id）

| 类别 | 处理 | 表 |
|---|---|---|
| **A 租户业务表（启用 RLS）** | 套 §4.1 标准策略 | business_events, tasks, task_checklist_items, documents 相关(generated_documents, document_attachment_records, event_document_mappings), vouchers 相关(ledger_entries, ledger_posting_batches, ledger_posting_batch_entries, event_voucher_drafts), accounting_periods, period_closings, reports(report_snapshots), tax(tax_items? tax_filing_batches, tax_filing_batch_items/reviews/archives, tax_declaration_submissions), rnd_projects/rnd_cost_lines/rnd_time_entries, risk_findings/risk_closure_records, contracts/contract_object_links, counterparties, employees, payroll_policy/payroll_records/payroll_tax_review_ledgers/payroll_transfer_batches/payroll_transfer_lines, invoices, bank_accounts/bank_statements, reconciliation_candidates/reconciliation_rules, business_event_activities/business_event_relations, event_tax_mappings, company_knowledge_items, feedback, ai_analysis_results/ai_task_runs, export_jobs/export_archive_entries, api_credentials, webhook_endpoints, scheduled_jobs, integration_configs, ai_configs, company_subscriptions, subscription_payments, departments |
| **B 全局/共享表（不启用或放行）** | 无 company_id 或跨租户共享，保持现状 | subscription_plans（套餐目录）、roles/role_permissions（若为全局角色目录）、schema_migrations |
| **C 系统/鉴权表（特殊）** | 见 §5 边界 | companies（租户主表本身，用 id 而非 company_id）、sessions（登录期查询发生在 set 上下文之前）、users |

> M2 起步只需 A 类里的**核心 5 张**先落地验证（business_events / ledger_entries / vouchers 或其等价 / tasks / invoices），其余分批灰度。

---

## 5. 边界条件与对策（评审重点）

### 5.1 SSE / 大文件流式端点必须豁免请求级事务

以下端点会长时间持有响应流，若包进请求事务会**长事务占用连接 + 连接池耗尽**：

- `modules/assistant/routes.ts`（AI 秘书 SSE）
- `modules/documents/routes.ts`（附件下载流）
- `modules/payroll/transfer.routes.ts`（可能大响应）
- `modules/pdf/routes.ts`（HTML/PDF 导出流）
- `modules/tax-integration/declaration-export.routes.ts`（申报文件导出）

**对策**：`RouteDef` 增加可选 `streaming?: true` 或 `tenantScope?: false` 标记；dispatch 对标记端点**不包 withTenantRequest**，这些端点内部若需租户查询，显式用短事务 `withTenantContext` 各自包裹取数段（取完数据再开始 streaming）。评审确认这 5 个端点是否都能「先取数、后流式」。

### 5.2 异步/请求外写入（关键：会 fails-closed 失败）

以下写入发生在**请求 ALS 上下文之外**，届时 `query()` 退回普通池连接、无 `app.current_company`，若目标表启用了 RLS 且用非属主角色 → `with check` 为 NULL → **插入被拒**：

1. **审计 `writeAudit`（fire-and-forget）** + **F2 hash-chain 的 per-company 串行队列**——在响应返回后才 flush。
2. **F5 调度 runner `processDueJobs`**——后台 setInterval，无请求上下文，跨公司扫描/写审计。

**对策（三选一，评审定）**：
- (a) 这些写入路径显式用 `withTenantContext(companyId, ...)` 包裹（writeAudit 已持有 companyId；scheduler 按 job.company_id 包裹）。**推荐**——最干净，与 ALS 架构一致。
- (b) audit_logs / scheduled_jobs 用**系统上下文**：runner 用一个可跨租户的 `finance_system` 角色（BYPASSRLS）或策略放行系统写入。
- (c) 这两类表归入 B 类不启用 RLS（弱化，但审计表本就全局可查存疑）。

> 这是**最容易在实施时踩雷**的点：F2/F5 刚接线完，若 F8 给 audit_logs/scheduled_jobs 启 RLS 而不改写入路径，审计链与调度会静默失败（writeAudit 吞异常，更隐蔽）。

### 5.3 登录/鉴权查询发生在上下文建立之前

`requireAuth` 要先查 sessions/users 才知道 companyId——此时还没有租户上下文。故 **sessions/users/companies 不能启用 RLS**（或策略放行无上下文读），否则鸡生蛋。归 C 类保持现状。

### 5.4 集成测试以属主/superuser 运行会「假绿」

现有 DB 集成测试若用 owner 连接，RLS 不生效，测试会误报隔离通过。**验证必须用 `finance_app` 非属主角色**跑，且新增「漏写 company_id 仍被 RLS 拦截」的负向用例。

### 5.5 事务语义变化

请求级事务化后，一个请求内多条写入变**原子**（任一失败全回滚）。多数场景是改进，但需：
- 设 `statement_timeout` / `idle_in_transaction_session_timeout` 防长事务挂死连接。
- 审阅是否有 handler 依赖「前半成功即落库」的旧非原子行为（应该没有，但需确认凭证过账等多步写入）。

---

## 6. 灰度上线与验证

**分阶段（shadow → enforce）**：
1. **P1 地基**：建 `finance_app` 角色 + ALS 改造 `query()` + dispatch 注入（此时**不建任何策略**）——行为等价现状，先验证「全站在租户事务下仍 100% 正常」（回归全部单测/E2E + 手工冒烟）。
2. **P2 核心 5 表 enforce**：给 5 张核心表启 RLS + 策略；用 `finance_app` 跑集成测试（正向隔离 + 负向漏 filter 仍拦截 + fails-closed）。
3. **P3 §5.2 异步写入改造**：writeAudit/hash-chain/scheduler 包 withTenantContext；audit_logs/scheduled_jobs 启 RLS。
4. **P4 全量铺开**：A 类其余表分批启用，每批跑隔离测试。

**回滚**：策略与角色切换均可逆——`alter table <t> disable row level security;` + DATABASE_URL 切回 owner 即恢复现状；ALS 改造本身行为兼容（无上下文自动退回池），可独立保留。

---

## 7. 风险登记与待 SME 决策项

| # | 风险/问题 | 待决 |
|---|---|---|
| R1 | ALS 改造触及**每一次 DB 访问** | 是否接受「query() 透明切连接」这一核心机制？有无更保守替代？ |
| R2 | §5.2 异步写入 fails-closed | 选 (a)/(b)/(c) 哪种？audit_logs 是否该跨租户可查（合规/审计视角）？ |
| R3 | 请求级事务化改变原子性 | 凭证过账/结转等多步写入是否有依赖非原子的隐含假设？ |
| R4 | SSE 5 端点豁免 | 逐个确认「先取数后流式」可行；豁免期间这些端点隔离仍靠应用层 company_id |
| R5 | 非属主角色权限矩阵 | GRANT 粒度、sequence 权限、future default privileges 是否完备 |
| R6 | 性能 | 每请求 connect+BEGIN+set_config+COMMIT 的开销；连接池 max=10 是否需上调 |
| R7 | tax_items 等表是否含 company_id | §4.2 A 类清单需逐表核实（部分表列名/归属需再确认）|

---

## 8. 工作量与任务拆分（评审通过后）

| 任务 | 范围 | 预估 |
|---|---|---|
| T1 ALS 地基 + query 改造 + dispatch 注入 + streaming 豁免标记 | db/client.ts, db/tenant.ts, router/dispatch.ts, router/router.ts(RouteDef) | 1–1.5 天 |
| T2 finance_app 角色 + 权限迁移 | 新 migration + 部署脚本 + DATABASE_URL 文档 | 0.5 天 |
| T3 核心 5 表策略 migration + 隔离集成测试（正向/负向/fails-closed，用 finance_app） | migrations + tests | 1 天 |
| T4 §5.2 异步写入改造（audit/hash-chain/scheduler 包 tenant 上下文） | services/audit.ts, modules/jobs/* | 0.5–1 天 |
| T5 A 类其余表分批策略 + 回归 | migrations（分批）| 1–1.5 天 |
| **合计** | | **约 4.5–5.5 天**，其中 T1/T4 为最高风险 |

> 建议：T1 单独出 PR 先合（行为兼容、收益是「请求原子化 + 为 RLS 铺路」），T3 起每批策略独立 PR + SME 复核，任一批异常可只回滚该批。

---

## 附录 · 关键证据
- 连接模型：`apps/api/src/db/client.ts`（全局 query 无事务）· `apps/api/src/db/tenant.ts`（withTenantContext 事务级 set_config）
- 32 张表含 company_id（grep 实测）；SSE 端点 5 个（assistant/documents/payroll-transfer/pdf/declaration-export）
- 连接角色：`apps/api/.env.example` → `finance_taxation`（疑为表属主，需换非属主运行时角色）
- 分发层注入点：`apps/api/src/router/dispatch.ts:30`（requireAuth 之后）
