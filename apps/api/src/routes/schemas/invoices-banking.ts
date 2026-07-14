/**
 * F9：请求体校验 schema —— 发票 / 银行 / 单据归档路由（负责范围见下）。
 *
 * 覆盖：
 *   POST  /api/invoices
 *   PATCH /api/invoices/:id
 *   POST  /api/banking/accounts
 *   PATCH /api/banking/statements/:id/match
 *   PUT   /api/banking/reconciliation/rules
 *   PUT   /api/documents/:id
 *
 * 省略（handler 不消费 body，或字段超出 FieldSpec 能力，或按任务说明明确排除）：
 *   POST /api/invoices/:id/verify                        —— 不读 req.body，验真数据取自 DB 中的发票记录
 *   POST /api/invoices/:id/voucher                        —— 不读 req.body，凭证草稿由 DB 记录生成
 *   POST /api/banking/reconciliation/run                  —— 按任务说明明确排除；且 statementIds 为数组，FieldSpec 不支持
 *   POST /api/banking/reconciliation/candidates/:id/confirm —— 不读 req.body（candidateId 取自 URL，reviewer 取自 auth）
 *   POST /api/banking/reconciliation/candidates/:id/reject  —— 同上，不读 req.body
 *   POST /api/banking/sync-statements                     —— 按任务说明明确排除
 *   POST /api/documents/:id/archive                       —— 不读 req.body，仅按 URL 中的 documentId 置为 archived
 *
 * 未纳入的可选/嵌套字段（保留但不校验，交由 handler 现有的 `?? 默认值` 兜底逻辑处理）：
 *   PUT /api/banking/reconciliation/rules 的 keywordWeights —— Record<string, number>，FieldSpec 不支持对象类型
 */

import type { ObjectSchema } from "../../utils/validate.js";

export const invoicesBankingBodySchemas: Record<string, ObjectSchema> = {
  // createInvoice：invoiceNo / invoiceDate / sellerName 缺失时 handler 直接 400（apps/api/src/modules/invoices/invoice.routes.ts:69-71）
  "POST /api/invoices": {
    invoiceNo: { type: "string", required: true, min: 1, max: 32 },
    invoiceDate: { type: "string", required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
    sellerName: { type: "string", required: true, min: 1, max: 200 },
    direction: { type: "string", enum: ["input", "output"] },
    invoiceType: { type: "string", max: 50 },
    invoiceCode: { type: "string", max: 20 },
    sellerTaxNo: { type: "string", max: 30 },
    buyerName: { type: "string", max: 200 },
    buyerTaxNo: { type: "string", max: 30 },
    amount: { type: "number", min: 0 },
    taxAmount: { type: "number", min: 0 },
    totalAmount: { type: "number", min: 0 },
    taxRate: { type: "number", min: 0, max: 1 },
    businessEventId: { type: "string", max: 64 },
    documentId: { type: "string", max: 64 },
    source: { type: "string", max: 30 },
    notes: { type: "string", max: 2000 },
  },

  // updateInvoice：全部字段可选，handler 用 `?? null` 兜底（invoice.routes.ts:99-104）
  "PATCH /api/invoices/:id": {
    notes: { type: "string", max: 2000 },
    businessEventId: { type: "string", max: 64 },
    documentId: { type: "string", max: 64 },
    voucherId: { type: "string", max: 64 },
  },

  // createBankAccount：bankName / accountNo / accountName 缺失时 handler 直接 400（bank.routes.ts:35-37）
  "POST /api/banking/accounts": {
    bankName: { type: "string", required: true, min: 1, max: 200 },
    accountNo: { type: "string", required: true, min: 1, max: 64 },
    accountName: { type: "string", required: true, min: 1, max: 200 },
    bankCode: { type: "string", max: 32 },
    currency: { type: "string", max: 10 },
    isPrimary: { type: "boolean" },
    isPayroll: { type: "boolean" },
    notes: { type: "string", max: 2000 },
  },

  // matchStatement：全部字段可选，handler 用 `?? "manual"` / `?? null` 兜底（bank.routes.ts:123-127）
  // matchStatus 枚举取自 migrations/020_p1_integration.sql:78 的列注释 unmatched|auto|manual|excluded
  "PATCH /api/banking/statements/:id/match": {
    voucherId: { type: "string", max: 64 },
    eventId: { type: "string", max: 64 },
    matchStatus: { type: "string", enum: ["unmatched", "auto", "manual", "excluded"] },
  },

  // upsertReconRules：全部字段可选，仅在存在时才拼接更新语句（reconciliation.ts:402-444）
  // keywordWeights 为对象类型，FieldSpec 不支持，未纳入
  "PUT /api/banking/reconciliation/rules": {
    amountTolerance: { type: "number", min: 0 },
    dateWindowDays: { type: "number", int: true, min: 0 },
    autoConfirmThreshold: { type: "number", int: true, min: 0, max: 100 },
    unmatchedEventDays: { type: "number", int: true, min: 0 },
  },

  // updateDocument：全部字段可选，缺失时回退到既有值（documents/routes.ts:212-233）
  // status 枚举取自 packages/domain-model/src/index.ts 的 GeneratedDocumentStatus
  "PUT /api/documents/:id": {
    status: { type: "string", enum: ["draft", "awaiting_upload", "ready", "archived"] },
    title: { type: "string", min: 1, max: 300 },
    ownerDepartment: { type: "string", min: 1, max: 100 },
  },
};
