/**
 * 路由表分组：申请单 / 借款 / 报销 / 验收 / 发票池 / 生产成本 / 银企直连 / 合同付款 / 审批流 / 费控地基。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { refresh } from "../../middleware/auth.js";
import { createAcceptanceRoute, listAcceptancesRoute, scheduleThreeWayRoute, transitionAcceptanceRoute } from "../../modules/acceptances/routes.js";
import { createAdvanceRoute, getAdvanceRoute, listAdvancesRoute, payAdvanceRoute, transitionAdvanceRoute } from "../../modules/advances/routes.js";
import { actOnApprovalRoute, addParticipantRoute, createFlowRoute, getApprovalDetailRoute, listFlowsRoute, listPendingRoute, listWatchedRoute, markWatchedReadRoute, submitApprovalRoute } from "../../modules/approval/routes.js";
import { createAssetRoute, disposeAssetRoute, getTaxDepreciationRoute, listAssetsRoute, previewDepreciationRoute, runDepreciationRoute } from "../../modules/assets/routes.js";
import { bankConnectBalanceRoute, deleteBankConnectConfigRoute, listBankConnectConfigsRoute, listInstructionsRoute, refreshInstructionRoute, submitInstructionRoute, testBankConnectConfigRoute, upsertBankConnectConfigRoute } from "../../modules/bank-connect/routes.js";
import { closeReconciliationRoute, getBalanceReconciliationRoute, listReconciliationSessionsRoute } from "../../modules/banking/reconciliation-session.routes.js";
import { checkBudgetRoute, createBudgetRoute, deleteBudgetRoute, listBudgetsRoute, updateBudgetRoute } from "../../modules/budget/routes.js";
import { getCostCenterReportRoute } from "../../modules/cost-center/routes.js";
import { carryOverRunRoute, listProductsRoute, listRunsRoute, previewRunRoute, upsertProductRoute, upsertRunRoute } from "../../modules/cost/routes.js";
import { createRevaluationVoucherRoute, listExchangeRatesRoute, previewRevaluationRoute, upsertExchangeRateRoute } from "../../modules/currency/routes.js";
import { checkExpenseStandardRoute, createExpenseStandardRoute, expireExpenseStandardRoute, listExpenseStandardsRoute } from "../../modules/expense-standards/routes.js";
import { suggestInvoicesRoute } from "../../modules/invoices/match-routes.js";
import { cancelScheduleRoute, confirmPaymentRoute, createPaymentRoute, createScheduleRoute, exportPaymentsRoute, listDuePaymentsRoute, listPaymentsRoute, listSchedulesRoute, submitPaymentRoute } from "../../modules/payments/routes.js";
import { createRecurringRoute, generateRecurringRoute, listRecurringRoute, updateRecurringStatusRoute } from "../../modules/recurring/routes.js";
import { auditReimbursementRoute, createReimbursementRoute, getReimbursementRoute, invoiceReimbursementUsageRoute, listReimbursementsRoute, transitionReimbursementRoute } from "../../modules/reimbursements/routes.js";
import { expenseAnalysisRoute } from "../../modules/reports/expense-analysis-routes.js";
import { createRequestRoute, getRequestRoute, listRequestsRoute, precheckRequestRoute, transitionRequestRoute, updateRequestRoute } from "../../modules/requests/routes.js";
import { deleteSettlementRoute, getAgingRoute, getOpenItemsRoute, listSettlementsRoute, settleRoute } from "../../modules/settlement/routes.js";
import { createTaxRateRoute, expireTaxRateRoute, listTaxRatesRoute } from "../../modules/tax/tax-rate.routes.js";
import { getLedgerVatWorkingPaper } from "../../modules/tax/vat-ledger-paper.routes.js";

export const expenseControlRoutes: RouteDef[] = [
  // ── V13-B 申请单 ───────────────────────────────────────────────────
  //
  // 读用 expense.view，写用 expense.submit——两者必须分开：只读角色与审计
  // 要看得到费用标准和别人的单据，但不该能提单。这不是洁癖，是权限护栏
  // 真的抓到了「role-viewer 能建申请单」。
  //
  // 归属收敛在 handler：requesterUserId 固定取 req.auth.userId，提交人永远
  // 是自己；submit/cancel 另在 store 里判「只有发起人能做」。
  { method: "GET", path: "/api/requests", auth: true, permission: "expense.view", handler: listRequestsRoute },
  { method: "POST", path: "/api/requests", auth: true, permission: "expense.submit", handler: createRequestRoute },
  {
    method: "GET",
    path: "/api/requests/:id",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => getRequestRoute(req, res, p.id!)
  },
  {
    method: "PATCH",
    path: "/api/requests/:id",
    auth: true,
    permission: "expense.submit",
    handler: (req, res, p) => updateRequestRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/requests/:id/precheck",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => precheckRequestRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/requests/:id/transition",
    auth: true,
    permission: "expense.submit",
    handler: (req, res, p) => transitionRequestRoute(req, res, p.id!)
  },


  // ── V13-B 借款单 / 备用金 ────────────────────────────────────────
  //
  // 付款挂 banking.manage 而不是 expense.submit：付款是出纳的本职，
  // 与导流水、做对账同一档。借款人自己不能给自己付款——这是最基本的
  // 不相容职务分离。
  { method: "GET", path: "/api/advances", auth: true, permission: "expense.view", handler: listAdvancesRoute },
  { method: "POST", path: "/api/advances", auth: true, permission: "expense.submit", handler: createAdvanceRoute },
  {
    method: "GET",
    path: "/api/advances/:id",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => getAdvanceRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/advances/:id/transition",
    auth: true,
    permission: "expense.submit",
    handler: (req, res, p) => transitionAdvanceRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/advances/:id/pay",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => payAdvanceRoute(req, res, p.id!)
  },


  // ── V13-B 报销单 ───────────────────────────────────────────────────
  { method: "GET", path: "/api/reimbursements", auth: true, permission: "expense.view", handler: listReimbursementsRoute },
  { method: "POST", path: "/api/reimbursements", auth: true, permission: "expense.submit", handler: createReimbursementRoute },
  {
    method: "GET",
    path: "/api/reimbursements/:id",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => getReimbursementRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/reimbursements/:id/transition",
    auth: true,
    permission: "expense.submit",
    handler: (req, res, p) => transitionReimbursementRoute(req, res, p.id!)
  },
  // V13-D：业财合规审核。挂 expense.view 而非 submit——审批人要能看到
  // 审核结果，而他未必有提单权限。POST 当查询用（纯计算不落库），
  // 已按规矩登记进 registry-permissions 的白名单。
  {
    method: "POST",
    path: "/api/reimbursements/:id/audit",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => auditReimbursementRoute(req, res, p.id!)
  },
  // B5：票据中心的「转报销单」按钮要在点之前就知道这张票报没报过——
  // 挂上去再被拒是最差的顺序。
  {
    method: "GET",
    path: "/api/invoices/:id/reimbursement-usage",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => invoiceReimbursementUsageRoute(req, res, p.id!)
  },


  // V13-D6：费用分析。归 expense.view——它读的是报销数据，
  // 与「谁能看别人的报销单」同一层能力。
  { method: "GET", path: "/api/reports/expense-analysis", auth: true, permission: "expense.view", handler: expenseAnalysisRoute },

  // ── V13 残留 7：验收单与三单匹配 ────────────────────────────────
  //
  // 归 contracts.*：验收是合同履行的一环，与付款计划同一授权域。
  // 建验收单要 manage——验收是「另一个人确认东西真的到了」，
  // 不该是任何能看合同的人都能做的事。
  { method: "GET", path: "/api/acceptances", auth: true, permission: "contracts.view", handler: listAcceptancesRoute },
  { method: "POST", path: "/api/acceptances", auth: true, permission: "contracts.manage", handler: createAcceptanceRoute },
  {
    method: "POST",
    path: "/api/acceptances/:id/transition",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => transitionAcceptanceRoute(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/schedules/:id/three-way",
    auth: true,
    permission: "contracts.view",
    handler: (req, res, p) => scheduleThreeWayRoute(req, res, p.id!)
  },

  // ── V14-D 发票池匹配建议 ───────────────────────────────────────────
  //
  // **只给建议，不自动挂载。** 分数只用于排序，没有「高于 X 就自动选中」——
  // 设阈值自动选等于自动挂载，绕回 V13 判断的原点。
  //
  // POST 当查询用：入参是对象（金额 + 日期 + 关键词 + 排除单据），塞进查询串
  // 既难读又有长度上限。纯查询，不落库、不改任何单据。
  { method: "POST", path: "/api/invoices/suggest", auth: true, permission: "expense.view", handler: suggestInvoicesRoute },

  // ── V14-C 生产成本与完工结转 ───────────────────────────────────────
  //
  // **归 ledger.* 而不是新开一档权限。** 成本结转的产物是一张凭证，
  // 与折旧、期末调汇、增值税结转同一性质——谁能做那些，谁就能做这个。
  // 读用 ledger.view（成本数据是看账的人要看的），结转用 ledger.post
  // （它生成凭证）。产品档案跟着走同一档：只有会做结转的人才需要维护它。
  { method: "GET", path: "/api/products", auth: true, permission: "ledger.view", handler: listProductsRoute },
  { method: "PUT", path: "/api/products", auth: true, permission: "ledger.post", handler: upsertProductRoute },
  { method: "GET", path: "/api/production-runs", auth: true, permission: "ledger.view", handler: listRunsRoute },
  { method: "PUT", path: "/api/production-runs", auth: true, permission: "ledger.post", handler: upsertRunRoute },
  {
    method: "GET",
    path: "/api/production-runs/:id/preview",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => previewRunRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/production-runs/:id/carry-over",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => carryOverRunRoute(req, res, p.id!)
  },

  // ── V14-A 银企直连 ────────────────────────────────────────────────────
  //
  // **配置归 settings.manage，指令归 banking.manage。**
  // 这条分界与「谁能改合同条款 vs 谁能把钱付出去」同一逻辑：配银行证书是
  // 系统管理员的事（一次性、涉及密钥），发付款指令是出纳的日常。
  // 合在一起等于让每个出纳都能改证书路径，那是把付款能力交出去。
  { method: "GET", path: "/api/bank-connect/configs", auth: true, permission: "settings.manage", handler: listBankConnectConfigsRoute },
  { method: "PUT", path: "/api/bank-connect/configs", auth: true, permission: "settings.manage", handler: upsertBankConnectConfigRoute },
  {
    method: "DELETE",
    path: "/api/bank-connect/configs/:id",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => deleteBankConnectConfigRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/bank-connect/configs/:id/test",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => testBankConnectConfigRoute(req, res, p.id!)
  },
  {
    // 余额与指令列表归 banking.manage 而不是 settings.manage——配证书和查余额
    // 是两拨人。**读也用 manage 而不是 contracts.view**：这些数据里有收款方
    // 银行账号，比付款单本身更敏感，不该是任何能看合同的人都能翻的。
    method: "GET",
    path: "/api/bank-connect/configs/:id/balance",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => bankConnectBalanceRoute(req, res, p.id!)
  },
  { method: "GET", path: "/api/bank-connect/instructions", auth: true, permission: "banking.manage", handler: listInstructionsRoute },
  { method: "POST", path: "/api/bank-connect/instructions", auth: true, permission: "banking.manage", handler: submitInstructionRoute },
  {
    method: "POST",
    path: "/api/bank-connect/instructions/:id/refresh",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => refreshInstructionRoute(req, res, p.id!)
  },

  // ── V13-C 合同付款计划与付款单 ─────────────────────────────────────
  //
  // 付款计划的读写归 contracts.*（它是合同条款的一部分）；
  // 实际付款归 banking.manage（出纳本职，与导流水、做对账同一档）。
  // 这条分界让「谁能改合同条款」与「谁能把钱付出去」是两个人。
  {
    method: "GET",
    path: "/api/contracts/:id/schedules",
    auth: true,
    permission: "contracts.view",
    handler: (req, res, p) => listSchedulesRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/contracts/:id/schedules",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => createScheduleRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/schedules/:id/cancel",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => cancelScheduleRoute(req, res, p.id!)
  },
  { method: "GET", path: "/api/payments/due", auth: true, permission: "contracts.view", handler: listDuePaymentsRoute },
  { method: "GET", path: "/api/payments", auth: true, permission: "contracts.view", handler: listPaymentsRoute },
  { method: "POST", path: "/api/payments", auth: true, permission: "banking.manage", handler: createPaymentRoute },
  {
    // 提交待发：草稿 → 已提交。导出银行 CSV 与银企直连都只接受 submitted，
    // 而此前这个状态全库没有任何路径能产生，两条路因此都是死的。
    method: "POST",
    path: "/api/payments/:id/submit",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => submitPaymentRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/payments/:id/confirm",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => confirmPaymentRoute(req, res, p.id!)
  },
  { method: "POST", path: "/api/payments/export", auth: true, permission: "banking.manage", handler: exportPaymentsRoute },

  // ── V13-A 审批流（终于用上了 workflow.* 权限键）─────────────────────
  //
  // 这两个键在 permissionCatalog 里躺了很久却没有任何路由使用——它们是历史上
  // 给审批流预留的位置。`workflow.view` 覆盖「看流程 + 处理我的待办」，
  // `workflow.manage` 只管改流程定义：改审批链等于改谁能放行多大的钱。
  { method: "GET", path: "/api/approval/flows", auth: true, permission: "workflow.view", handler: listFlowsRoute },
  { method: "POST", path: "/api/approval/flows", auth: true, permission: "workflow.manage", handler: createFlowRoute },
  { method: "GET", path: "/api/approval/pending", auth: true, permission: "workflow.view", handler: listPendingRoute },
  // 抄送给我的（V13 残留 4）。归属收敛在 handler：userId 固定取 req.auth，
  // 只可能看到抄送给自己的。
  { method: "GET", path: "/api/approval/watched", auth: true, permission: "workflow.view", handler: listWatchedRoute },
  {
    method: "POST",
    path: "/api/approval/watched/:id/read",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => markWatchedReadRoute(req, res, p.id!)
  },
  { method: "POST", path: "/api/approval/instances", auth: true, permission: "workflow.view", handler: submitApprovalRoute },
  {
    method: "POST",
    path: "/api/approval/instances/:id/act",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => actOnApprovalRoute(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/approval/instances/:id",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => getApprovalDetailRoute(req, res, p.id!)
  },
  {
    // V14-B 动态加签。权限门是 workflow.view，真正的判权收敛在
    // `addParticipant`——只有当前步骤的参与人能加签。收敛点有自己的测试
    // （approval.integration.test.ts 的加签用例），符合权限白名单第 3 类。
    method: "POST",
    path: "/api/approval/instances/:id/participants",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => addParticipantRoute(req, res, p.id!)
  },

  // ── V13-A 费控地基：预算与费用标准 ──────────────────────────────────
  //
  // 预算读写分权：`budget.view` 给到部门经理与审计（要看得到执行情况），
  // `budget.manage` 只给财务与管理层。
  { method: "GET", path: "/api/budgets", auth: true, permission: "budget.view", handler: listBudgetsRoute },
  { method: "POST", path: "/api/budgets", auth: true, permission: "budget.manage", handler: createBudgetRoute },
  {
    method: "PATCH",
    path: "/api/budgets/:id",
    auth: true,
    permission: "budget.manage",
    handler: (req, res, p) => updateBudgetRoute(req, res, p.id!)
  },
  {
    method: "DELETE",
    path: "/api/budgets/:id",
    auth: true,
    permission: "budget.manage",
    handler: (req, res, p) => deleteBudgetRoute(req, res, p.id!)
  },
  // 预检挂 budget.view 而不是 manage：提单的人要能看到自己这笔会不会超预算，
  // 但不该因此获得改预算的权限。
  { method: "POST", path: "/api/budgets/check", auth: true, permission: "budget.view", handler: checkBudgetRoute },

  { method: "GET", path: "/api/expense-standards", auth: true, permission: "expense.view", handler: listExpenseStandardsRoute },
  { method: "POST", path: "/api/expense-standards", auth: true, permission: "expense.manage", handler: createExpenseStandardRoute },
  {
    method: "PATCH",
    path: "/api/expense-standards/:id",
    auth: true,
    permission: "expense.manage",
    handler: (req, res, p) => expireExpenseStandardRoute(req, res, p.id!)
  },
  { method: "POST", path: "/api/expense-standards/check", auth: true, permission: "expense.view", handler: checkExpenseStandardRoute },

  { method: "GET", path: "/api/reports/cost-centers", auth: true, permission: "ledger.view", handler: getCostCenterReportRoute },

  // 税率主数据（V12-D2）
  //
  // 查税率归 tax.view；改税率归 tax.manage —— 税率错了整期申报都错，
  // 与录税目不是一个量级的动作。系统内置税率不可运行期修改（沿革由迁移维护），
  // 这里能改的只有公司自定义的那部分。
  { method: "GET", path: "/api/tax/rates", auth: true, permission: "tax.view", handler: listTaxRatesRoute },
  // 账簿口径的增值税底稿：与账簿同源，附带与税目口径的差额
  { method: "GET", path: "/api/tax/vat-working-paper/ledger", auth: true, permission: "tax.view", handler: getLedgerVatWorkingPaper },
  { method: "POST", path: "/api/tax/rates", auth: true, permission: "tax.manage", handler: createTaxRateRoute },
  {
    method: "POST",
    path: "/api/tax/rates/:id/expire",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => expireTaxRateRoute(req, res, p.id!)
  },

  // 定期凭证（V12-C4）
  //
  // 生成的是草稿，不进总账，因此归 ledger.post 而非更高的权限：它省的是
  // 重复劳动，过账仍要走正常审批。
  { method: "GET", path: "/api/recurring-vouchers", auth: true, permission: "ledger.view", handler: listRecurringRoute },
  { method: "POST", path: "/api/recurring-vouchers", auth: true, permission: "ledger.post", handler: createRecurringRoute },
  { method: "POST", path: "/api/recurring-vouchers/generate", auth: true, permission: "ledger.post", handler: generateRecurringRoute },
  {
    method: "PATCH",
    path: "/api/recurring-vouchers/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => updateRecurringStatusRoute(req, res, p.id!)
  },

  // 银行余额调节表与对账封存（V12-C3）
  //
  // 封存归 banking.manage：它是对账动作的收口，与导入流水、确认匹配同一类
  // 职责；查调节表归 ledger.view，出纳之外的人（会计、审计）也要能看。
  { method: "GET", path: "/api/banking/reconciliation/balance", auth: true, permission: "ledger.view", handler: getBalanceReconciliationRoute },
  { method: "GET", path: "/api/banking/reconciliation/sessions", auth: true, permission: "ledger.view", handler: listReconciliationSessionsRoute },
  { method: "POST", path: "/api/banking/reconciliation/close", auth: true, permission: "banking.manage", handler: closeReconciliationRoute },

  // 往来账龄与核销（V12-C2）
  //
  // 核销不产生凭证、不改任何科目余额，只声明"这笔收款抵的是那笔欠款"，
  // 因此归 ledger.post 而非独立权限：它仍是记账人员的日常动作，
  // 而查账龄表的人（如销售、管理层）只要 ledger.view。
  { method: "GET", path: "/api/settlement/aging", auth: true, permission: "ledger.view", handler: getAgingRoute },
  { method: "GET", path: "/api/settlement/open-items", auth: true, permission: "ledger.view", handler: getOpenItemsRoute },
  { method: "POST", path: "/api/settlement/settle", auth: true, permission: "ledger.post", handler: settleRoute },
  // V15：查某笔分录上的核销记录。`listSettlements` 早就写好了只是没接路由——
  // 于是撤销接口存在、但前台拿不到要撤哪一条的 id，核销错了改不了。
  { method: "GET", path: "/api/settlement/settlements", auth: true, permission: "ledger.view", handler: listSettlementsRoute },
  {
    method: "DELETE",
    path: "/api/settlement/settlements/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => deleteSettlementRoute(req, res, p.id!)
  },

  // 多币种（V12-D5）。
  //
  // 汇率维护归 ledger.post 而不是单开权限：汇率直接决定折算金额与调汇损益，
  // 改一个数字等于改一笔账，与记账是同一级别的动作。查询归 ledger.view。
  //
  // 调汇生成的是 draft 凭证（与折旧、红冲、增值税结转一致），所以它要的是
  // ledger.post 而非 ledger.approve —— 复核过账仍走凭证自己的审批路径。
  { method: "GET", path: "/api/currency/rates", auth: true, permission: "ledger.view", handler: listExchangeRatesRoute },
  { method: "PUT", path: "/api/currency/rates", auth: true, permission: "ledger.post", handler: upsertExchangeRateRoute },
  { method: "GET", path: "/api/currency/revaluation", auth: true, permission: "ledger.view", handler: previewRevaluationRoute },
  { method: "POST", path: "/api/currency/revaluation", auth: true, permission: "ledger.post", handler: createRevaluationVoucherRoute },

  // 固定资产（V12-C1）
  //
  // 权限沿用 ledger.*：建卡、计提、处置产出的都是凭证，是记账动作；查台账与
  // 预览折旧是查阅动作。不新造 asset.* 权限——权限点越多越难说清谁能干什么，
  // 而这里的动作与"记账/查账"的边界完全重合。
  //
  // 折旧的 GET 路径必须排在 `/api/assets/:id/dispose` 之前登记？不必：两者
  // 方法与形状都不同（GET vs POST，且 depreciation 段不含第二级），不会互相遮蔽。
  { method: "GET", path: "/api/assets", auth: true, permission: "ledger.view", handler: listAssetsRoute },
  { method: "POST", path: "/api/assets", auth: true, permission: "ledger.post", handler: createAssetRoute },
  { method: "GET", path: "/api/assets/depreciation", auth: true, permission: "ledger.view", handler: previewDepreciationRoute },
  // 折旧纳税调整明细表（A105080）：归 tax.view，看它的是做汇算的人
  { method: "GET", path: "/api/assets/tax-depreciation", auth: true, permission: "tax.view", handler: getTaxDepreciationRoute },
  { method: "POST", path: "/api/assets/depreciation", auth: true, permission: "ledger.post", handler: runDepreciationRoute },
  {
    method: "POST",
    path: "/api/assets/:id/dispose",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => disposeAssetRoute(req, res, p.id!)
  },
];
