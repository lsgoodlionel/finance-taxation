/**
 * 路由表分组：全局搜索 / AI Agents / 往来单位 / 计费 / 杂项 / 发票 / 平台能力。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { anomalyScanRoute } from "../../modules/ai-agents/anomaly/anomaly.routes.js";
import { approveCloseDraft, generateCloseDrafts, listCloseDrafts, rejectCloseDraft } from "../../modules/ai-agents/close/close-drafts.routes.js";
import { automationDecisionRoute, automationThresholdsRoute } from "../../modules/ai-agents/governance.routes.js";
import { acceptAiResult, assessEventCompleteness, auditReview, getAiResults, suggestAccounting } from "../../modules/ai-agents/routes.js";
import { budgetVarianceRoute, cashForecastRoute, revenueComparisonRoute } from "../../modules/analytics/routes.js";
import { getArchivePackage } from "../../modules/archive/package.routes.js";
import { ocr } from "../../modules/assistant/routes.js";
import { confirmPayment, getSubscription, listPayments, listPlans, subscribePlan } from "../../modules/billing/routes.js";
import { createCounterparty, listCounterparties, updateCounterparty } from "../../modules/counterparties/routes.js";
import { consolidateFeedbackRoute, decideProposal, listFeedback, listProposals, submitFeedback } from "../../modules/feedback/routes.js";
import { getCashForecast } from "../../modules/forecast/routes.js";
import { getInbox } from "../../modules/inbox/inbox.routes.js";
import { parseAndStoreEInvoice } from "../../modules/invoices/einvoice.routes.js";
import { createInvoice, deleteInvoice, generateInvoiceVoucher, listInvoices, ocrInvoice, updateInvoice, verifyInvoice } from "../../modules/invoices/invoice.routes.js";
import { enqueueJob, listJobs } from "../../modules/jobs/routes.js";
import { closePlanRoute } from "../../modules/ledger/close-plan.routes.js";
import { listNotificationDeliveries } from "../../modules/notifications/routes.js";
import { createApiKey, listApiKeys, registerWebhook, revokeApiKey } from "../../modules/open-api/credentials.routes.js";
import { globalSearch } from "../../modules/search/search.routes.js";
import { getSetupStatus } from "../../modules/setup/setup.routes.js";
import { taxConsistencyRoute } from "../../modules/tax-integration/consistency.routes.js";
import { getTaxDeadlines } from "../../modules/tax/deadlines.routes.js";
import { verifyAuditChain } from "../../services/audit.js";

export const platformRoutes: RouteDef[] = [
  // global search —— 命令面板的全局入口，所有角色都持有 dashboard.view。
  // 注意：它跨事项/合同/发票/凭证/员工/单据聚合，handler 目前不按调用者权限逐类过滤，
  // 只按 company_id 隔离；收紧到单一 *.view 会让命令面板对部分角色整体失效，
  // 逐类过滤应作为后续项在 handler 内做，而不是靠这里的权限键。
  { method: "GET", path: "/api/search", auth: true, permission: "dashboard.view", handler: globalSearch },

  // ai agents (P6)
  // suggest 产出分录建议（记账职责）；assess 面向事项负责人；review 输出全公司风险
  // 勾稽（与审计查阅同人群）；accept 会把 AI 结果标记为采纳，属账务决策。
  { method: "POST", path: "/api/ai/accounting/suggest", auth: true, permission: "ledger.post", handler: suggestAccounting },
  { method: "POST", path: "/api/ai/completeness/assess", auth: true, permission: "events.create", handler: assessEventCompleteness },
  { method: "POST", path: "/api/ai/audit/review", auth: true, permission: "audit.view", handler: auditReview },
  // 一个读接口同时吐三类产物：事项级分录建议、事项完整度评估，以及 audit agent
  // 的全公司勾稽发现（风险等级、未匹配流水、草稿凭证数）。按最敏感的那一类定门槛。
  { method: "GET", path: "/api/ai/results", auth: true, permission: "audit.view", handler: getAiResults },
  {
    method: "POST",
    path: "/api/ai/results/:id/accept",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => acceptAiResult(req, res, p.id!)
  },

  // counterparties (P7) —— 往来单位是合同/发票的主体主数据，按合同管理权守护。
  { method: "GET", path: "/api/counterparties", auth: true, permission: "contracts.view", handler: listCounterparties },
  { method: "POST", path: "/api/counterparties", auth: true, permission: "contracts.manage", handler: createCounterparty },
  {
    method: "PATCH",
    path: "/api/counterparties/:id",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => updateCounterparty(req, res, p.id!)
  },

  // billing (P8) —— 订阅变更与付款确认属公司治理决策，收归 settings.manage。
  // 读接口同口径：订阅档位、配额用量与付款流水（金额/支付方式/流水号）只服务
  // 「系统中心 → 订阅计费」这一个页面，而该页的菜单键本身就是 settings.manage。
  { method: "GET", path: "/api/billing/plans", auth: true, permission: "settings.manage", handler: listPlans },
  { method: "GET", path: "/api/billing/subscription", auth: true, permission: "settings.manage", handler: getSubscription },
  { method: "POST", path: "/api/billing/subscribe", auth: true, permission: "settings.manage", handler: subscribePlan },
  { method: "GET", path: "/api/billing/payments", auth: true, permission: "settings.manage", handler: listPayments },
  {
    method: "POST",
    path: "/api/billing/payments/:id/confirm",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => confirmPayment(req, res, p.id!)
  },

  // misc single-endpoint domains
  { method: "GET", path: "/api/tax/deadlines", auth: true, permission: "tax.view", handler: getTaxDeadlines },
  // 提交是自助的，读列表不是：listFeedback 返回全公司所有人的反馈（含 user_name +
  // 正文），不按调用者收敛，且只服务「系统中心 → 反馈与升级」这一个页面。
  { method: "GET", path: "/api/feedback", auth: true, permission: "settings.manage", handler: listFeedback },
  // 自助提交：任何登录用户都应能反馈问题；收敛为提案则与 /api/proposals/:id/decide 同级。
  { method: "POST", path: "/api/feedback", auth: true, permission: "dashboard.view", handler: submitFeedback },
  { method: "POST", path: "/api/feedback/consolidate", auth: true, permission: "settings.manage", handler: consolidateFeedbackRoute },
  // 升级提案的读写同页同权：列表已含决策人与决策意见。
  { method: "GET", path: "/api/proposals", auth: true, permission: "settings.manage", handler: listProposals },
  {
    method: "POST",
    path: "/api/proposals/:id/decide",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => decideProposal(req, res, p.id!)
  },
  // 财税资料包＝归档产物清单，与 /api/exports/* 同属取证面，故同为 audit.view。
  { method: "GET", path: "/api/archive/package", auth: true, permission: "audit.view", handler: getArchivePackage },
  // 与 /api/analytics/cash-forecast 同源同口径，权限键保持一致。
  { method: "GET", path: "/api/forecast/cash", auth: true, permission: "dashboard.view", handler: getCashForecast },
  { method: "GET", path: "/api/setup/status", auth: true, permission: "dashboard.view", handler: getSetupStatus },
  // 收件箱与月结向导都是跨模块的**计数**聚合，不返回明细；权限键对齐各自页面的
  // 菜单键（/inbox → tasks.view，月结清单归口总账）。
  { method: "GET", path: "/api/inbox", auth: true, permission: "tasks.view", handler: getInbox },

  // invoices (P1) — ocr + sub-paths before the /:id catch-all
  // 发票录入/识别/验真与既有的 /api/invoices/parse 对齐到 documents.manage；
  // 删除是销毁税务凭据，按记账权（ledger.post）守护，不与录入同级。
  { method: "GET", path: "/api/invoices", auth: true, permission: "documents.view", handler: listInvoices },
  { method: "POST", path: "/api/invoices", auth: true, permission: "documents.manage", handler: createInvoice },
  { method: "POST", path: "/api/invoices/ocr", auth: true, permission: "documents.manage", handler: ocrInvoice },
  // 数电票结构化解析入库（须在 /api/invoices/:id catch-all 之前注册）
  { method: "POST", path: "/api/invoices/parse", auth: true, permission: "documents.manage", handler: parseAndStoreEInvoice },
  {
    method: "POST",
    path: "/api/invoices/:id/verify",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => verifyInvoice(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/invoices/:id/voucher",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => generateInvoiceVoucher(req, res, p.id!)
  },
  {
    method: "PATCH",
    path: "/api/invoices/:id",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => updateInvoice(req, res, p.id!)
  },
  {
    method: "DELETE",
    path: "/api/invoices/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => deleteInvoice(req, res, p.id!)
  },

  // 数据智能（E1/E2）
  { method: "GET", path: "/api/analytics/cash-forecast", auth: true, permission: "dashboard.view", handler: cashForecastRoute },
  { method: "GET", path: "/api/analytics/revenue-comparison", auth: true, permission: "dashboard.view", handler: revenueComparisonRoute },
  { method: "GET", path: "/api/analytics/budget-variance", auth: true, permission: "dashboard.view", handler: budgetVarianceRoute },

  // H4-w2 异常检测扫描（规则型纯核心接线，只读）
  { method: "GET", path: "/api/anomaly/scan", auth: true, permission: "risk.view", handler: anomalyScanRoute },

  // H2-w2 月结编排（只读）
  { method: "GET", path: "/api/ledger/close-plan", auth: true, permission: "ledger.view", handler: closePlanRoute },

  // H1-w2 草稿队列 draft-then-approve（generate/list/approve/reject；静态路径在 :id 之前）
  { method: "POST", path: "/api/close/drafts/generate", auth: true, permission: "ledger.post", handler: generateCloseDrafts },
  { method: "GET", path: "/api/close/drafts", auth: true, permission: "ledger.view", handler: listCloseDrafts },
  { method: "POST", path: "/api/close/drafts/:id/approve", auth: true, permission: "ledger.post", handler: (req, res, p) => approveCloseDraft(req, res, p.id!) },
  { method: "POST", path: "/api/close/drafts/:id/reject", auth: true, permission: "ledger.post", handler: (req, res, p) => rejectCloseDraft(req, res, p.id!) },

  // V6 Stage F 接线：票税一致性 / 审计 hash 链校验 / AI 分级决策门 / 开放能力
  { method: "GET", path: "/api/tax-integration/consistency", auth: true, permission: "tax.view", handler: taxConsistencyRoute },
  { method: "GET", path: "/api/audit/verify-chain", auth: true, permission: "audit.view", handler: verifyAuditChain },
  { method: "POST", path: "/api/ai/automation/decide", auth: true, permission: "dashboard.view", handler: automationDecisionRoute,
    bodySchema: { ruleConfidence: { type: "number", required: true, min: 0, max: 1 }, isFinancialMutation: { type: "boolean", required: true }, amountCents: { type: "number", int: true, min: 0 } } },
  { method: "GET", path: "/api/ai/automation/thresholds", auth: true, permission: "dashboard.view", handler: automationThresholdsRoute },
  { method: "POST", path: "/api/settings/api-keys", auth: true, permission: "settings.manage", handler: createApiKey },
  { method: "GET", path: "/api/settings/api-keys", auth: true, permission: "settings.manage", handler: listApiKeys },
  { method: "POST", path: "/api/settings/api-keys/:id/revoke", auth: true, permission: "settings.manage", handler: revokeApiKey },
  { method: "POST", path: "/api/settings/webhooks", auth: true, permission: "settings.manage", handler: registerWebhook,
    bodySchema: { event_type: { type: "string", required: true, min: 1 }, target_url: { type: "string", required: true, min: 1 } } },

  // F5 调度任务队列（可观测 + 手动入队）
  { method: "GET", path: "/api/jobs", auth: true, permission: "workflow.view", handler: listJobs },
  { method: "POST", path: "/api/jobs", auth: true, permission: "workflow.manage", handler: enqueueJob,
    bodySchema: { kind: { type: "string", required: true, min: 1 } } },

  // K5 通知投递可观测：即发即忘的通知失败不进业务响应，这里给出渠道状态与最近投递记录
  { method: "GET", path: "/api/notifications/deliveries", auth: true, permission: "settings.manage",
    handler: listNotificationDeliveries }
];
