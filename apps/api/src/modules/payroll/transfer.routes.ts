/**
 * P3 工资代发 HTTP 路由
 * POST /api/payroll/transfer/batches               生成代发批次（body: period, bankAccountId?）
 * GET  /api/payroll/transfer/batches               批次列表
 * GET  /api/payroll/transfer/batches/:id           批次详情（含明细行）
 * POST /api/payroll/transfer/batches/:id/approve   审批
 * GET  /api/payroll/transfer/batches/:id/file?format=generic|cmb  下载代发文件
 * POST /api/payroll/transfer/batches/:id/disburse  标记已代发（body: bankTransferRef?）
 * POST /api/payroll/transfer/batches/:id/compensate  补偿工资代发下游经营事项
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import {
  buildBatchFromPayroll,
  listBatches,
  getBatchWithLines,
  approveBatch,
  compensateDisbursedBatch,
  generateBatchFile,
  markDisbursed,
} from "./transfer.js";
import type { TransferFileFormat } from "./transfer-file.js";

export async function buildBatchRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as { period?: string; bankAccountId?: string };
  if (!body.period || !/^\d{4}-\d{2}$/.test(body.period)) {
    json(res, 400, { error: "period 为必填项，格式 YYYY-MM" }); return;
  }
  try {
    const result = await buildBatchFromPayroll(req.auth!.companyId, body.period, {
      bankAccountId: body.bankAccountId,
    });
    json(res, 201, { ok: true, ...result });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : "生成代发批次失败" });
  }
}

export async function listBatchesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const items = await listBatches(req.auth!.companyId);
  json(res, 200, { items, total: items.length });
}

export async function getBatchRoute(req: ApiRequest, res: ServerResponse, batchId: string): Promise<void> {
  const data = await getBatchWithLines(req.auth!.companyId, batchId);
  if (!data) { json(res, 404, { error: "代发批次不存在" }); return; }
  json(res, 200, data);
}

export async function approveBatchRoute(req: ApiRequest, res: ServerResponse, batchId: string): Promise<void> {
  try {
    await approveBatch(req.auth!.companyId, batchId, req.auth!.userId);
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : "审批失败" });
  }
}

export async function downloadBatchFileRoute(req: ApiRequest, res: ServerResponse, batchId: string): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const formatParam = url.searchParams.get("format") ?? "generic";
  const format: TransferFileFormat = formatParam === "cmb" ? "cmb" : "generic";
  try {
    const file = await generateBatchFile(req.auth!.companyId, batchId, format);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(file.content);
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : "导出代发文件失败" });
  }
}

export async function disburseBatchRoute(req: ApiRequest, res: ServerResponse, batchId: string): Promise<void> {
  const body = (req.body ?? {}) as { bankTransferRef?: string };
  try {
    const result = await markDisbursed(req.auth!.companyId, batchId, req.auth!.userId, body.bankTransferRef);
    json(res, 200, { ok: true, ...result });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : "标记代发失败" });
  }
}

export async function compensateBatchRoute(req: ApiRequest, res: ServerResponse, batchId: string): Promise<void> {
  try {
    const result = await compensateDisbursedBatch(req.auth!.companyId, batchId, req.auth!.userId);
    json(res, 200, { ok: true, ...result });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : "执行补偿失败" });
  }
}
