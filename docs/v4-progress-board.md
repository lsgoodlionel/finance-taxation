# V4 进度板

目标：真实业务验收与生产可靠性（从"演示可用"推进到"生产可部署"）

基线：`origin/main@91e906c`（Phase 0–9 全部完成）
更新时间：2026-07-11 · **V4-1A 工作流运行时内核 + V4 生产门禁工具链已并入 `main`**

| 工作流 | 分支 | 状态 | 验收范围 |
|--------|------|------|----------|
| V4-0 基线与 E2E | `codex/v4-baseline-and-e2e` | `completed` | CI、测试数据、三条 baseline E2E、设计审计 |
| V4-1A 工作流运行时 | `codex/v4-workflow-runtime-continued` | `in_progress`（**内核 + 032 迁移已并入 main**） | 状态机、授权、幂等、补偿、运行态透出 |
| V4-1B 采购报销 | `codex/v4-expense-purchase-slice-continued` | `in_progress`（实现在分支，**待合并 main**） | 标准/异常路径生产门禁 |
| V4-2 差旅报销 | `codex/v4-expense-purchase-slice-continued` | `in_progress`（实现在分支，**待合并 main**） | 标准/异常路径生产门禁 |
| V4-3 合同收入 | `codex/v4-contract-revenue-slice` | `pending` | 合同至申报闭环 |
| V4-4 任务与连接器 | `codex/v4-job-and-connectors` | `pending` | 重试、沙箱、文件交换 |
| V4-5 安全与运维 | `codex/v4-security-operations` | `pending` | 私有云生产认证 |

> V4-1A 内核已在 main：`apps/api/src/modules/workflows/`（runtime/authorization/commands/persistence）+ `migrations/032_workflow_runtime.sql` + `WorkflowRuntimeCard`。
> V4 生产门禁工具链已在 main：`tools/v4/`（production-gates / ops-source-recorders / record-ops-source）+ `docs/v4/runbooks/` + `artifacts/v4/baseline/`。
> V4-1B/V4-2 采购/差旅报销的实现（见下方 2026-06-26 记录）仍在 `codex/v4-expense-purchase-slice-continued` 分支，尚未合并 main。
> 全面收敛与前沿升级蓝图见 `docs/v5-upgrade-blueprint-and-parallel-plan.md`。

## 2026-06-26 更新

- `codex/v4-expense-purchase-slice-continued`
  - 已补测试环境 deterministic assistant fallback，覆盖对话创建事项、OCR fallback 与 SSE 输出。
  - 已修复 assistant 标题抽取，把“准备报销/申请报销”等操作短语从事项标题中剥离，避免 E2E 与真实事项命名漂移。
  - 已修复助手创建事项时部门硬编码为 `财务部` 的问题，改为沿用当前登录人的 `departmentName`。
  - 已补 `/api/access/me` 返回 `departmentName`，供前端创建事项和后续流程联动消费。
  - 已补费用事项的 `增值税` 复核映射，和既有 `企业所得税` 一起进入自动分析链。
  - 已调整单据权限口径：用户可查看“本部门单据 + 自己可访问事项下的单据”，解决 `invoice_bundle` 无法在本人报销链路中查看和自动挂附件的问题。
  - 已放宽 E2E 多角色登录夹具对 `/assistant` 带查询参数场景的判定。
  - 已新增 `purchase_expense` 异常规则层，覆盖：
    - 缺票报销：`invoice_bundle` 缺失时单据转 `awaiting_upload`、抑制进项税、凭证仅保留待补票草稿。
    - 重复报销：阻止生成凭证草稿，并落 `DUPLICATE_REIMBURSEMENT` 风险。
    - 高价值误分类：自动切换到固定资产资料/凭证口径，并落 `EXPENSE_OVERSTATEMENT` 风险。
  - 已新增采购异常聚合验收 `tests/e2e/scenarios/purchase-expense.exceptions.spec.ts`，串联 `analyze -> risk-check -> documents/tax/vouchers`。
  - 已补采购异常任务链分化：
    - 缺票场景会生成“补票 / 税务限制复核 / 冻结正式过账”三步任务。
    - 重复场景会生成“历史报销核对 / 关闭或并单 / 税务抵扣留痕”三步任务。
    - 误分类场景会生成“改走固定资产审批 / 补台账验收 / 调整凭证口径”三步任务。
  - 已补经营事项详情中的采购异常摘要卡，在事项详情页直接提示“缺票 / 重复 / 固定资产改口径”的当前处理含义和下一步动作。
  - 已补任务中心采购异常横幅：识别“缺票 / 重复 / 固资改口径”任务集，并在任务页给出当前处理建议。
  - 已补单据中心采购异常提示：在缺票票据包、重复报销冻结单据、固定资产改口径资料单据上直接显示处理提示。
  - 已通过验证：
    - `node --import /Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/tsx/dist/loader.mjs --test apps/api/src/modules/assistant/fallback.test.ts`
    - `node --import /Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/tsx/dist/loader.mjs --test apps/api/src/modules/events/purchase-expense-rules.test.ts apps/api/src/modules/risk/engine.test.ts`
    - `node --import /Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/tsx/dist/loader.mjs --test apps/api/src/modules/events/task-chain.test.ts apps/api/src/modules/events/purchase-expense-rules.test.ts apps/api/src/modules/risk/engine.test.ts`
    - `node --import /Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/tsx/dist/loader.mjs --test apps/web/src/pages/tasks/purchase-task-guidance.test.mjs apps/web/src/pages/documents/purchase-document-guidance.test.mjs`
    - `/Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`
    - `/Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
    - `V4_BASE_URL=http://127.0.0.1:55174 V4_API_URL=http://127.0.0.1:33101 npx playwright test tests/e2e/scenarios/purchase-expense.baseline.spec.ts --project=desktop-chromium`
    - `V4_BASE_URL=http://127.0.0.1:55174 V4_API_URL=http://127.0.0.1:33101 npx playwright test tests/e2e/scenarios/purchase-expense.baseline.spec.ts tests/e2e/scenarios/purchase-expense.exceptions.spec.ts --project=desktop-chromium`
  - 已开始 `V4-2 差旅报销` 切片，当前完成：
    - 已新增 `travel_expense` 规则层，覆盖标准差旅、缺住宿票、重复差旅报销、跨期错月四类场景。
    - 已把差旅事项从通用 `expense` 映射切到专属 `buildTravelExpenseBundle`，生成 `travel_request / expense_claim / transport_invoice / hotel_invoice` 四类单据链。
    - 已补差旅专属任务链：
      - 缺住宿票场景生成“补住宿票 / 暂估与税前扣除限制 / 冻结住宿部分过账”三步任务。
      - 重复报销场景生成“核对重复差旅 / 保留主链 / 复核进项留痕”三步任务。
      - 跨期场景生成“拆分归属月份 / 复核税务期间 / 最终授权”三步任务。
    - 已补差旅风险规则：
      - `UNSUPPORTED_TRAVEL_COST`
      - `DUPLICATE_REIMBURSEMENT`
      - `CUTOFF_MISSTATEMENT`
    - 已补事项页 / 任务页 / 单据页差旅异常提示，直接暴露缺住宿票、重复报销、跨期归属的当前处理含义。
    - 已把差旅 baseline E2E 从“记录缺口”改成真实断言，并新增 `tests/e2e/scenarios/travel-expense.exceptions.spec.ts`。
    - 已修复 Docker/生产构建下前端 API 地址回退错误：
      - 原问题是 `VITE_API_BASE_URL=` 被设计为走 nginx `/api` 代理，但代码使用 `|| "http://127.0.0.1:3100"`，导致空字符串被错误回退到宿主 `3100`。
      - 现已改为“仅在变量未定义时才回退默认地址”，显式空字符串会保留相对 `/api` 行为。
  - 已通过验证：
    - `node --import /Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/tsx/dist/loader.mjs --test apps/api/src/modules/events/travel-expense-rules.test.ts apps/api/src/modules/events/task-chain.test.ts apps/api/src/modules/risk/engine.test.ts apps/web/src/pages/events/travel-exception-summary.test.mjs apps/web/src/pages/tasks/travel-task-guidance.test.mjs apps/web/src/pages/documents/travel-document-guidance.test.mjs`
    - `node --import /Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/tsx/dist/loader.mjs --test apps/api/src/modules/events/purchase-expense-rules.test.ts apps/api/src/modules/events/travel-expense-rules.test.ts apps/api/src/modules/events/task-chain.test.ts apps/api/src/modules/risk/engine.test.ts apps/web/src/pages/tasks/purchase-task-guidance.test.mjs apps/web/src/pages/tasks/travel-task-guidance.test.mjs apps/web/src/pages/documents/purchase-document-guidance.test.mjs apps/web/src/pages/documents/travel-document-guidance.test.mjs apps/web/src/pages/events/purchase-exception-summary.test.mjs apps/web/src/pages/events/travel-exception-summary.test.mjs`
    - `/Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`
    - `/Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
    - `V4_TEST_DATABASE_URL=postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test node --import /Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/tsx/dist/loader.mjs tools/v4/reset-test-db.ts`
    - `V4_TEST_DATABASE_URL=postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test node --import /Users/lionel/Documents/Codex/finance-taxation-v4-workflow-runtime/node_modules/tsx/dist/loader.mjs tools/v4/seed-acceptance-data.ts`
    - `V4_BASE_URL=http://127.0.0.1:55173 V4_API_URL=http://127.0.0.1:33100 npx playwright test tests/e2e/scenarios/travel-expense.baseline.spec.ts tests/e2e/scenarios/travel-expense.exceptions.spec.ts --project=desktop-chromium`
    - `V4_BASE_URL=http://127.0.0.1:55173 V4_API_URL=http://127.0.0.1:33100 npx playwright test tests/e2e/scenarios/purchase-expense.baseline.spec.ts tests/e2e/scenarios/purchase-expense.exceptions.spec.ts --project=desktop-chromium`
  - 已推进 `V4-1A / V4-3` 收口：
    - 已新增前端 runtime 摘要层：
      - `任务中心`、`税务中心`、`凭证中心`、`工资管理`、`工资代发与社保` 五页统一显示“运行态 + 授权态 + 关键计数”。
      - 运行态按等待/处理中/成功/失败归并现有业务状态；授权态按“当前无需授权 / 等待授权 / 当前可推进”展示。
      - 当前实现基于既有任务、批次、凭证、工资与角色数据推导，未改动原有业务动作和接口契约。
    - 已补 runtime 摘要首轮浏览器 smoke：
      - 新增 `tests/e2e/smoke/runtime-summary-pages.spec.ts`，覆盖上述 5 个页面。
      - 已确认 5/5 页面能在浏览器中看到 runtime 面板标题与“运行态 / 授权态”标签。
      - 已发现并修复工资页误把 `Payroll policy not configured` 报成“后端连接失败”的问题。
      - 已把税务页 runtime 摘要从“工作台摘要内部”提升到税务日历之后、统计摘要之前，增强首屏可见性。
      - 已把 smoke 断言升级为“页面真实请求后端 `/api/runtime/*` 接口并收到 200”，不再只检查面板可见。
      - 已修复工资页在未选中期间时仍停留本地 fallback 的问题，现会按 `selectedPeriod -> 最新期间 -> customPeriod` 顺序请求 runtime 接口。
      - 审查记录已落地：`docs/v4/audits/baseline/runtime-summary-pages-2026-06-29.md`
    - 已新增 `contract_revenue` 规则层，覆盖标准收入、缺验收、重复合同、跨期订阅递延确认四类场景。
    - 已把合同收入事项接入自动生成链：单据、任务、凭证建议、风险勾稽统一由专属规则层派生。
    - 已补合同收入异常提示：
      - 事项页显示“缺验收 / 重复确认 / 合同负债递延”的流程摘要。
      - 任务页显示合同收入异常处理建议。
      - 单据页显示服务合同、验收单、开票计划等资料提示。
    - 已新增 `tests/e2e/scenarios/contract-revenue.exceptions.spec.ts`，覆盖：
      - `系统实施服务缺少验收单`
      - `重复导入年度财税咨询合同`
      - `跨期订阅服务一次性确认收入`
    - 已修复工作流运行时权限口径：
      - `/api/events/:id/risk-check` 从单一 `risk.manage` 放宽为 `risk.manage | tax.manage | events.create` 任一即可执行。
      - 保持风险关闭等真正管理动作仍需 `risk.manage`，未扩大税务专员的全局风险管理权限。
    - 已通过验证：
      - `./node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`
      - `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
      - `node --import ./node_modules/tsx/dist/loader.mjs --test apps/api/src/middleware/auth.test.ts apps/api/src/modules/events/contract-revenue-rules.test.ts apps/api/src/modules/events/task-chain.test.ts apps/api/src/modules/risk/engine.test.ts`
      - `node --import ./node_modules/tsx/dist/loader.mjs --test apps/web/src/features/runtime/workflow-runtime.test.mjs`
      - `V4_BASE_URL=http://127.0.0.1:55173 V4_API_URL=http://127.0.0.1:33100 npx playwright test tests/e2e/smoke/runtime-summary-pages.spec.ts --project=desktop-chromium`
      - `V4_BASE_URL=http://127.0.0.1:55173 V4_API_URL=http://127.0.0.1:33100 npx playwright test tests/e2e/scenarios/contract-revenue.exceptions.spec.ts --project=desktop-chromium`
      - `V4_BASE_URL=http://127.0.0.1:55173 V4_API_URL=http://127.0.0.1:33100 npx playwright test tests/e2e/scenarios/purchase-expense.baseline.spec.ts tests/e2e/scenarios/purchase-expense.exceptions.spec.ts tests/e2e/scenarios/travel-expense.baseline.spec.ts tests/e2e/scenarios/travel-expense.exceptions.spec.ts tests/e2e/scenarios/contract-revenue.baseline.spec.ts tests/e2e/scenarios/contract-revenue.exceptions.spec.ts --project=desktop-chromium`
    - 已继续推进 `V4-1A` 后端化与数据库验证：
      - 已新增 workflow DB 集成测试 `tools/v4/workflow-runtime-db.test.ts`，覆盖：
        - `export_jobs / export_archive_entries` 写入、读取、失败后重试回开；
        - `payroll_transfer_batches / payroll_transfer_lines` 写入、状态推进，以及代发完成后补偿生成 `business_events`。
        - `/api/runtime/tasks`
        - `/api/runtime/tax`
        - `/api/runtime/vouchers`
        - `/api/runtime/payroll`
        - `/api/runtime/payroll-transfer`
          的 route/db 合约断言也已写入同一测试文件。
      - 已新增后端 runtime summary 模块：
        - `apps/api/src/modules/runtime/summary.ts`
        - `apps/api/src/modules/runtime/routes.ts`
      - 已新增 runtime API：
        - `GET /api/runtime/tasks`
        - `GET /api/runtime/tax`
        - `GET /api/runtime/vouchers`
        - `GET /api/runtime/payroll`
        - `GET /api/runtime/payroll-transfer`
      - 已将前端五页改为“后端 runtime API + 本地 fallback”双保险消费模式，避免接口失败时首屏状态区消失。
      - 已补充工资模块可复用查询 helper：
        - `listCompanyPayrollRecords`
        - `listCompanyPayrollReviewLedgers`
      - 当前已通过验证：
      - `./node_modules/.bin/tsx --test apps/api/src/modules/runtime/summary.test.ts`
      - `./node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`
      - `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
      - `V4_BASE_URL=http://127.0.0.1:55173 V4_API_URL=http://127.0.0.1:33100 npx playwright test tests/e2e/smoke/runtime-summary-pages.spec.ts --project=desktop-chromium`
      - 已通过一次 DB 集成实跑验证：
        - `node --import tsx --test tools/v4/workflow-runtime-db.test.ts`
      - 已再次通过包含 runtime route/db 合约的实跑验证：
        - `node --import tsx --test tools/v4/workflow-runtime-db.test.ts`
    - 已启动 `V4-4` 首批真实重试/补偿动作：
      - 已为 `export_jobs` 增加运行时字段：`retry_count / last_error / last_attempt_at / next_retry_at / completed_at`。
      - 导出中心“最近导出记录”现可直接显示失败原因、重试次数和下次重试时间；任务失败后重开会真实累加重试计数并清理失败元数据。
      - 已为 `payroll_transfer_batches` 增加补偿字段：`compensation_status / compensation_event_id / compensated_at`，并补 `retry_count / last_error / next_retry_at`。
      - 工资代发在 `disburse` 时会先记录补偿进行中，再在经营事项落库成功后闭环为 `completed`；若联动失败，会把批次标成 `failed` 并记录下次建议重试时间。
      - 已新增 `/api/payroll/transfer/batches/:id/compensate`，用于对“已代发但下游经营事项缺失”的批次执行真实补偿。
      - 工资代发页现会在详情区显示补偿状态、失败原因和“补偿联动事项”入口。
      - 已修稳测试 compose 启动链：`apps/api/src/db/migrate.ts` 增加启动期数据库瞬时连接失败的定向重试，`docker compose -p finance-taxation-v4-test -f docker-compose.test.yml up -d --build db api web` 已稳定通过健康检查。
      - 当前已通过验证：
        - `./node_modules/.bin/tsx --test apps/api/src/db/startup.test.ts apps/api/src/modules/runtime/summary.test.ts apps/api/src/modules/exports/history.test.ts`
        - `./node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`
        - `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
        - `node --import ./node_modules/tsx/dist/loader.mjs --test apps/web/src/pages/export/export-panels.test.tsx`
        - `node --import tsx --test tools/v4/workflow-runtime-db.test.ts`
  - 已完成 `V4-4` 第二批 runtime 失败原因 / 快速修复入口收口：
      - 任务中心 runtime 摘要在存在 `blocked` 任务时会直接显示阻塞任务标题、说明和“重开阻塞任务”入口。
      - 税务中心 runtime 摘要在“无有效纳税人口径”时显示 warning 提示；在 `review_required` 批次场景可返回批次复核问题与“重新复核批次”入口。
      - 凭证中心 runtime 摘要在空分录、借贷不平、科目缺失时会直接显示错误原因与“重新校验凭证”入口。
      - 前端 `WorkflowRuntimePanel` 已支持统一渲染 `issue + actions`，并接入任务、税务、凭证三页的真实动作复用：
        - 任务页调用既有 `updateTaskStatus`
        - 税务页调用既有 `reviewTaxFilingBatch`
        - 凭证页调用既有 `validateVoucher`
      - 已补 route/db 合同测试，覆盖 blocked task 重开、tax batch 重新复核、voucher 校验问题返回。
      - 已补 smoke 浏览器验证：
        - `tasks / vouchers` 覆盖 runtime issue + repair action 渲染
        - `tax / payroll-transfer` 先保留 summary 展示 smoke，repair action mock 留待对应页面时序稳定后补回
      - 当前已通过验证：
        - `./node_modules/.bin/tsx --test apps/api/src/modules/runtime/summary.test.ts`
        - `./node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`
        - `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
      - `node --import tsx --test tools/v4/workflow-runtime-db.test.ts`
      - `npx playwright test tests/e2e/smoke/runtime-summary-pages.spec.ts`
    - 已补 `V4-0` 验收工具与门禁链第二批：
      - 已新增 `tools/v4/generate-acceptance-report.ts` 与 `tools/v4/generate-acceptance-report.test.ts`。
      - 已新增 `tools/v4/submit-failures-to-feedback.ts` 与 `tools/v4/submit-failures-to-feedback.test.ts`，默认 dry-run，并对已打开/已提交/外部依赖阻塞场景去重跳过。
      - 已新增 `tools/v4/check-plan-artifacts.mjs`，当前按 core-only 规则校验 baseline 报告、证据路径、失败截图/trace 和业务对象 ID。
      - 已新增：
        - `docs/v4/acceptance-evidence-schema.md`
        - `docs/v4/runbooks/local-acceptance.md`
        - `docs/v4/runbooks/ci-acceptance.md`
      - 已把共享门禁对齐到 V4：
        - `package.json` 已切换 `check:progress -> docs/v4-progress-board.md`
        - 已补 `test:db / v4:feedback:submit / verify:v4`
        - `.github/workflows/ci.yml` 已切到 monorepo + V4 acceptance 流水线
        - `README.md`、`docs/v4-execution-index.md` 已同步当前可执行命令
      - 当前已通过验证：
        - `./node_modules/.bin/tsx --test tools/v4/generate-acceptance-report.test.ts`
        - `./node_modules/.bin/tsx --test tools/v4/submit-failures-to-feedback.test.ts`
        - `node tools/v4/typecheck.mjs`
        - `npm run v4:report`
        - `node tools/v4/check-plan-artifacts.mjs`
        - `npm run verify:v4`

## 当前残留

- `2026-07-01` 已继续收口 runtime repair smoke：
  - 已修复 `v4:test:setup` 环境缺口：`package.json` 中 `v4:test:db:reset` / `v4:test:seed` 现在内置默认 `V4_TEST_DATABASE_URL`，本地不再因为缺变量直接中断。
  - 已新增三条独立 smoke：
    - `tests/e2e/smoke/tax-runtime-repair.spec.ts`
    - `tests/e2e/smoke/payroll-runtime-repair.spec.ts`
    - `tests/e2e/smoke/payroll-transfer-runtime-repair.spec.ts`
  - 已确认三条独立 repair smoke 在当前集成分支本地通过：
    - `npx playwright test tests/e2e/smoke/payroll-runtime-repair.spec.ts tests/e2e/smoke/tax-runtime-repair.spec.ts tests/e2e/smoke/payroll-transfer-runtime-repair.spec.ts --project=desktop-chromium --workers=1`
  - 已完成工资代发页 repair 入口接线：
    - `PayrollTransferPage` 已绑定 `WorkflowRuntimePanel onAction / busyActionKey`
    - `workflow-runtime.ts` 已补工资代发 fallback repair summary
    - 对应独立 smoke 已在当前集成分支复跑通过
  - 已完成工资页 repair 入口接线：
    - `PayrollPage` 已绑定 `WorkflowRuntimePanel onAction / busyActionKey`
    - 对应独立 smoke 已改为自包含 mock，不再依赖真实登录，并已在当前集成分支复跑通过
- 已修复前端 runtime hook 在 fallback 更新时重复触发远端请求的问题：
  - `useWorkflowRuntimeSummary` 已改为按 `scope + params signature` 去重 fetch，并在 fallback 更新时仅同步本地摘要，不再形成 `/api/runtime/payroll` 热循环。
- `runtime-summary-pages.spec.ts` 已将 `/tasks`、`/tax`、`/vouchers`、`/payroll/transfer` 四页统一纳入通用 repair entry smoke，当前不再依赖税务/工资代发独立 smoke 才能覆盖入口可见性。
- 已将 `test:load / test:backup-restore / test:connectors / test:ai-evals` 从占位提示升级为机器校验脚本：
  - 新增 `tools/v4/production-gates.ts` 与 `tools/v4/production-gates.test.ts`
  - 现统一读取 `artifacts/v4/baseline/ops/*.json` 证据并按 V4 阈值判定：
    - `load`: `pageP95Ms <= 2000`、`apiP95Ms <= 500`、`errorRate <= 5%`
    - `backup-restore`: `RPO <= 24h`、`RTO <= 4h`
    - `connectors`: 所有连接器必须 `passed`
    - `ai-evals`: `suggestionAcceptanceRate >= 85%`、`documentRecallRate >= 95%`、`highRiskAutoExecutionCount = 0`
  - `README`、`docs/v4/runbooks/*.md`、`docs/v4/acceptance-evidence-schema.md` 已同步入口、字段和阈值
- 已新增 `tools/v4/generate-production-gates.ts` 与 `tools/v4/generate-production-gates.test.ts`
  - `npm run v4:ops` 现可自动生成 `artifacts/v4/baseline/ops/*.json`
  - `load` 从 Playwright 结果和可选 API 健康探针生成
  - `backup-restore / connectors / ai-evals` 优先读取 `artifacts/v4/baseline/ops-sources/*.json` 原始证据；缺失时生成显式失败占位证据，不伪造通过
- 已新增 `tools/v4/ops-source-recorders.ts`、`tools/v4/init-ops-sources.ts` 及对应测试
  - `npm run v4:ops:init-sources` 现可生成 `backup-restore / connectors / ai-evals` 三份标准模板
  - 便于后续把恢复演练、连接器认证和 AI 评测结果按统一字段回填到 `artifacts/v4/baseline/ops-sources/*.json`
- `2026-07-02` 已继续收口 `v4:ops` 生成链：
  - 已将 `package.json` 中的 `v4:ops` 入口切换为 `bash tools/v4/run-production-gates-generation.sh`，避免直接依赖不稳定的 `tsx` CLI 入口。
  - 已把 `tools/v4/run-production-gates-generation.mjs` 改为支持 `--health-probe-latencies <csv>`，可在受限环境下显式传入健康探针延迟样本。
  - 已新增 shell 采样包装器 `tools/v4/run-production-gates-generation.sh`，负责采集本地健康探针样本并交给 Node 证据生成器。
  - 已确认在显式传入 `--health-probe-latencies 12,10,9` 时，`artifacts/v4/baseline/ops/load.json` 可稳定写出 `apiP95Ms: 12` 与 `source: playwright-and-health-probe`。
  - 当前 Codex 沙箱内的 `npm run v4:ops` 仍受回环网络限制，默认采样会退化为空样本；非沙箱环境需要再做一次最终本机验证。
- `2026-07-03` 已继续收口 `V4-4` 的工资代发修复链：
  - 已把后端 runtime 摘要 `apps/api/src/modules/runtime/summary.ts` 补齐工资代发“已代发但补偿失败”状态机，不再误判为 `succeeded`。
  - 当前补偿失败批次会返回：
    - `executionState: failed`
    - `authorizationLabel: 你可执行修复`
    - `issue.title: 代发补偿失败`
    - `actions[0].key: compensate-transfer-batch`
  - 已补单元测试 `apps/api/src/modules/runtime/summary.test.ts`，锁定上述状态与修复动作。
  - 已扩写 `tools/v4/workflow-runtime-db.test.ts`，把工资代发补偿修复纳入 runtime repair DB 合同测试；该测试在当前 Codex 沙箱中仍受本地 PostgreSQL 回环限制，需在非沙箱环境复跑。
- `2026-07-03` 已补 `V4-5` 的真实来源导入方式：
  - 已新增 `tools/v4/record-ops-source.ts` 与 `tools/v4/record-ops-source.test.ts`。
  - 已新增 `npm run v4:ops:record -- <backup-restore|connectors|ai-evals> --input <json-file>`，可将外部 JSON 直接回填到 `artifacts/v4/baseline/ops-sources/*.json`。
  - 现已具备“初始化模板 -> 导入真实来源 -> 生成标准化证据 -> 执行四条 production gates”的完整命令链。
- `2026-07-04` 已补仓库内可直接导入的来源样例：
  - 已新增 `docs/v4/examples/ops-source-samples/` 目录，内含：
    - `backup-drill.json`
    - `connector-certification.json`
    - `ai-evals.json`
  - 已补测试，确认这三份样例可直接通过 `recordOpsSource` 导入到标准 `ops-sources/*.json` 位置。
  - 现本地与 CI 都可在没有外部文件准备的情况下，直接演练 `v4:ops:record -> v4:ops -> production gates` 命令链。
- `2026-07-06` 已完成一次仓库内样例证据链闭环验证：
  - 已使用三份仓库内样例成功执行：
    - `record-ops-source.ts backup-restore`
    - `record-ops-source.ts connectors`
    - `record-ops-source.ts ai-evals`
  - 已通过显式 `--health-probe-latencies 12,10,9` 重新生成 `artifacts/v4/baseline/ops/*.json`。
  - 四条 production gates 已全部通过：
    - `load`
    - `backup-restore`
    - `connectors`
    - `ai-evals`
- `2026-07-06` 已完成非沙箱环境下的最终本机健康探针验证：
  - 已启动 `finance-taxation-v4-test` docker stack，使 `http://127.0.0.1:33100/api/health` 可达。
  - `curl -s http://127.0.0.1:33100/api/health` 已返回 `ok: true`。
  - 非沙箱 `npm run v4:ops` 已成功采集真实探针样本 `[4,2,1,6,3]`。
  - 最终 `artifacts/v4/baseline/ops/load.json` 已写出：
    - `apiP95Ms: 6`
    - `source: playwright-and-health-probe`
  - 随后四条 production gates 已再次通过：
    - `load`
    - `backup-restore`
    - `connectors`
    - `ai-evals`

## 下一批未完成重点

- V4-4：
  - 将 `tasks / tax / vouchers / payroll-transfer` 的 runtime repair 动作继续补齐真实后端与浏览器证据，统一到同一套回归入口。
  - 将导出任务、工资代发补偿与审计日志的跨对象联动再补一轮 UI/DB 验证，确认失败重试、重复点击与补偿复用都可追溯。
- V4-5：
  - 补备份恢复、连接器认证、AI 评测三类真实来源文件，而不只保留模板与失败占位。
  - 继续补私有云发布门禁所需的安全、监控、对象存储和密钥管理落地证据。
