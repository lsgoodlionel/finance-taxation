# V5 阶段性开发总结与移交（2026-07-12）

> 用途：记录本阶段 V5 升级的全部开发成果、当前状态、环境与后续移交要点，供接力开发与升级参考。
> 基准文档：`docs/v5-upgrade-blueprint-and-parallel-plan.md`（含里程碑评分卡与外部依赖清单）。

---

## 一、本阶段完成的开发（全部已合入 `main`）

### Stage A — 收敛清创
- **A2 清创**：删除 V1 三代遗留（`backend/`、`src/`、`index.html`），移除失效 check 脚本。
- **A4 明文密码修复（CRITICAL）**：`middleware/password.ts` Node scrypt（OWASP N=2^17），登录失败锁定、惰性升级历史明文、时序防枚举；migration `034`。

### Stage B — 生产就绪硬底座
- **B4 架构规整**：`app.ts` 1624→约 90 行，声明式路由表 `routes/registry.ts`（约 203 路由）+ `router/`（匹配/调度）+ `observability/logger.ts` 结构化日志 + 统一错误中间件 + 顶层错误边界（防单请求崩进程）。
- **B1 安全加固**：`security/headers.ts`（HSTS/CSP/X-Frame…）、`security/rate-limit.ts`（全局+登录端点双桶）、`security/redact.ts`（审计脱敏）、`utils/validate.ts`（零依赖入参校验，接入 login）。
- **B2 账务内核**：`modules/ledger/closing.ts`（结转损益纯核心）+ `close-period.ts`（持久化）+ `POST /api/ledger/periods/:id/close-income` + migration `035` + **真实 PG 集成测试**（结转后营收/费用归零、本年利润 3131 承接、凭证自平、幂等）。
- **B5 前端工程化**：27 页 `React.lazy` 懒加载 + `RouteFallback` + vite `manualChunks`（主包 1189→89kB）。

### Stage C — 多租户
- **C1**：`db/tenant.ts` `withTenantContext`（事务级 `set_config` + RLS）+ RLS 隔离/拒写/fails-closed 端到端 DB 证明。

### Stage D — 外部集成与 AI 治理
- **D1 开票连接器**：`tax-integration/invoicing/`（`InvoiceProvider` 接口 + `MockInvoiceProvider` + 工厂，**诺诺凭证预留槽**）。
- **D2 票税一致性 + 审计链**：`consistency.ts`（销/进项/票账三比对分级）+ `security/hash-chain.ts`（篡改可证）。
- **D3 调度**：`modules/jobs/schedule.ts`（指数退避 + 重试计划 + 到点选择）。
- **D4 数电票解析**：`invoices/einvoice-parse.ts`（结构化 → 规范化 + 价税校验）。
- **D5 AI 治理**：`ai-agents/governance.ts`（分级自动化，硬校验绝不交 LLM）。
- **D6 开放能力**：`security/api-credentials.ts`（API Key + Webhook HMAC）。

### Stage E — 数据智能与移动
- **E1/E2**：`modules/analytics/`（同比环比 + 预算差异 + 现金流线性回归预测），并**接入 HTTP**（`/api/analytics/cash-forecast`、`/revenue-comparison`，真实 ledger 数据验证）。
- **E3 PWA**：`manifest.webmanifest` + `sw.js`（/api 不缓存）+ 图标 + 注册，应用**可安装 + 离线外壳**。

### 工程修复（本地任务 + PR #2 合入）
- 测试收集 glob 递归修复 + DB 集成测试分离（`*.integration.test.ts`）。
- workflow `blocked→draft` 转换修复；`analyzeEvent` 状态映射崩溃修复；一批 CI/E2E 竞态修复。

---

## 二、当前状态（可验证）

| 维度 | 状态 |
|---|---|
| 分支收敛 | ✅ 全部车道 + origin 修复已合入 `main`（领先 origin 37、落后 0，可快进推送） |
| typecheck:v2 | ✅ 绿 |
| API 单测 | ✅ 320/320 绿 |
| DB 集成（B2/C1） | ✅ 真实 Postgres 验证绿 |
| 全栈 docker（db+api+web） | ✅ 构建运行，登录/health 端到端正常（部署模拟达成） |
| E2E 基础设施 | ✅ Playwright→浏览器→栈 登录冒烟绿；scenario 业务流待容器重建后复跑（analyze 修复已合入代码） |
| 本地 LLM | ✅ Ollama `gemma4` 可用，AI 层 provider 回退 Ollama |

**里程碑**：M0–M4 partial（核心已交付+多项已 DB/栈验证）、M5 partial（PWA 可安装）。完整达成的差距见蓝图「里程碑完成度评分卡」与「外部依赖清单」。

---

## 三、环境与运行

```bash
npm install
npm run typecheck:v2            # 类型检查
npm run test:api               # API 单测
npm run v4:test:stack:start    # 起全栈 docker (db+api+web)
npm run v4:test:db:reset && npm run v4:test:seed   # 建表+种子
V4_BASE_URL=http://127.0.0.1:55173 npx playwright test   # E2E
npm run v4:test:stack:stop     # 停栈
```
- api 容器经 `host.docker.internal:11434` 可达本机 Ollama。
- 默认种子账号 `chairman / 123456`（登录时 scrypt 惰性升级）。

---

## 四、后续移交要点

1. **外部凭证类**（阻塞 M3/部分 M4）：诺诺/百望开票 API、企微/钉钉、银行 CA、发票查验通道——详见蓝图外部依赖清单，代码已预留接口槽。
2. **CI 流水线**：origin 已有 e2e/覆盖率相关工作；补 `.github/workflows` 门禁化 typecheck + 单测 + DB 集成 + E2E + 覆盖率 ≥60%。
3. **C1 生产铺开**：建非超级用户 app 角色 + 全业务表 RLS 迁移 + 全域 `withTenantContext` 接入。
4. **纯核心继续接线**：consistency/governance/hash-chain/api-credentials → HTTP 端点 + 持久层（analytics 已接）。
5. **M5 前端**：移动审批 UI、BottomSheet、暗色模式；PWA 图标补真实 PNG。
6. **生产 secrets**：替换种子口令、真实 JWT_SECRET/DATABASE_URL、TLS 域名。
