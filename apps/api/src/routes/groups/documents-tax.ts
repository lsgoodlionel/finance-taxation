/**
 * 路由表分组：单据 / 税务 / 凭证。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import {
  createTaxpayerProfile,
  listTaxpayerProfiles
} from "../../modules/tax/taxpayer-profile.routes.js";
import { createVoucherFromTemplate } from "../../modules/vouchers/voucher-from-template.js";
import { closingBundleHandler } from "../shared-handlers.js";
import { archiveDocument, attachDocumentFile, downloadAttachment, getDocumentDetail, listDocumentAttachments, listDocuments, updateDocument, uploadDocumentFile } from "../../modules/documents/routes.js";
import { getTaxRuntimeSummaryRoute, getVoucherRuntimeSummaryRoute } from "../../modules/runtime/routes.js";
import { archiveTaxFilingBatch, createTaxFilingBatch, getCorporateIncomeTaxPreparation, getIndividualIncomeTaxMaterials, getStampAndSurtaxSummary, getTaxFilingBatchDetail, getTaxItemDetail, getTaxRuleProfile, getTaxWorkingPaperPrintable, getVatWorkingPaper, listTaxFilingBatches, listTaxItems, reviewTaxFilingBatch, submitTaxFilingBatch, updateTaxItem, validateTaxFilingBatch } from "../../modules/tax/routes.js";
import { createVatSettlementVoucher, previewVatSettlement } from "../../modules/tax/vat-settlement.routes.js";
import { approveVoucher, getVoucherDetail, getVoucherTemplates, listVoucherPostingRecords, listVouchers, postVoucher, reverseVoucher, updateVoucher, validateVoucher } from "../../modules/vouchers/routes.js";

export const documentsTaxRoutes: RouteDef[] = [
  // documents (specific sub-paths before the /:id catch-all)
  { method: "GET", path: "/api/documents", auth: true, permission: "documents.view", handler: listDocuments },
  {
    method: "POST",
    path: "/api/documents/:id/upload",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => uploadDocumentFile(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/documents/:id/attach",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => attachDocumentFile(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/documents/:id/archive",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => archiveDocument(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/documents/:id/attachments",
    auth: true,
    permission: "documents.view",
    handler: (req, res, p) => listDocumentAttachments(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/attachments/:id/download",
    auth: true,
    permission: "documents.view",
    handler: (req, res, p) => downloadAttachment(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/documents/:id",
    auth: true,
    permission: "documents.view",
    handler: (req, res, p) => getDocumentDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/documents/:id",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => updateDocument(req, res, p.id!)
  },

  // tax
  { method: "GET", path: "/api/tax-items", auth: true, permission: "tax.view", handler: listTaxItems },
  { method: "GET", path: "/api/runtime/tax", auth: true, permission: "tax.view", handler: getTaxRuntimeSummaryRoute },
  { method: "GET", path: "/api/tax-filing-batches", auth: true, permission: "tax.view", handler: listTaxFilingBatches },
  { method: "POST", path: "/api/tax-filing-batches", auth: true, permission: "tax.manage", handler: createTaxFilingBatch },
  { method: "GET", path: "/api/taxpayer-profiles", auth: true, permission: "tax.view", handler: listTaxpayerProfiles },
  { method: "POST", path: "/api/taxpayer-profiles", auth: true, permission: "tax.manage", handler: createTaxpayerProfile },
  { method: "GET", path: "/api/tax/vat-working-paper", auth: true, permission: "tax.view", handler: getVatWorkingPaper },
  { method: "GET", path: "/api/tax/vat-settlement", auth: true, permission: "tax.view", handler: previewVatSettlement },
  { method: "POST", path: "/api/tax/vat-settlement", auth: true, permission: "tax.manage", handler: createVatSettlementVoucher },
  { method: "GET", path: "/api/tax/rules", auth: true, permission: "tax.view", handler: getTaxRuleProfile },
  { method: "GET", path: "/api/tax/individual-income-tax-materials", auth: true, permission: "tax.view", handler: getIndividualIncomeTaxMaterials },
  { method: "GET", path: "/api/tax/stamp-and-surtax-summary", auth: true, permission: "tax.view", handler: getStampAndSurtaxSummary },
  { method: "GET", path: "/api/tax/corporate-income-tax-preparation", auth: true, permission: "tax.view", handler: getCorporateIncomeTaxPreparation },
  { method: "GET", path: "/api/tax/printable", auth: true, permission: "tax.view", handler: getTaxWorkingPaperPrintable },
  {
    method: "POST",
    path: "/api/tax-filing-batches/:id/validate",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => validateTaxFilingBatch(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/tax-filing-batches/:id/review",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => reviewTaxFilingBatch(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/tax-filing-batches/:id/submit",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => submitTaxFilingBatch(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/tax-filing-batches/:id/archive",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => archiveTaxFilingBatch(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/tax-filing-batches/:id",
    auth: true,
    permission: "tax.view",
    handler: (req, res, p) => getTaxFilingBatchDetail(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/tax-items/:id",
    auth: true,
    permission: "tax.view",
    handler: (req, res, p) => getTaxItemDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/tax-items/:id",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => updateTaxItem(req, res, p.id!)
  },

  // vouchers (templates + specific sub-paths before the /:id catch-all)
  { method: "GET", path: "/api/vouchers", auth: true, permission: "ledger.view", handler: listVouchers },
  { method: "POST", path: "/api/vouchers", auth: true, permission: "ledger.post", handler: createVoucherFromTemplate },
  { method: "GET", path: "/api/runtime/vouchers", auth: true, permission: "ledger.view", handler: getVoucherRuntimeSummaryRoute },
  { method: "GET", path: "/api/packages/closing-bundle", auth: true, permission: "dashboard.view", handler: closingBundleHandler },
  { method: "GET", path: "/api/vouchers/templates", auth: true, permission: "ledger.view", handler: getVoucherTemplates },
  {
    method: "POST",
    path: "/api/vouchers/:id/post",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => postVoucher(req, res, p.id!)
  },
  // 红冲是已过账凭证唯一合法的更正出口（analyze 的硬删路径已被堵成 409）。
  // 生成的是 draft 凭证，仍需人工审核 + 过账，故与记账同级而非更高。
  {
    method: "POST",
    path: "/api/vouchers/:id/reverse",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => reverseVoucher(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/vouchers/:id/approve",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => approveVoucher(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/vouchers/:id/validate",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => validateVoucher(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/vouchers/:id/posting-records",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => listVoucherPostingRecords(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/vouchers/:id",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => getVoucherDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/vouchers/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => updateVoucher(req, res, p.id!)
  },
];
