/**
 * P3 工资代发 HTTP 路由
 * POST /api/payroll/transfer/batches               生成代发批次（body: period, bankAccountId?）
 * GET  /api/payroll/transfer/batches               批次列表
 * GET  /api/payroll/transfer/batches/:id           批次详情（含明细行）
 * POST /api/payroll/transfer/batches/:id/approve   审批
 * GET  /api/payroll/transfer/batches/:id/file?format=generic|cmb  下载代发文件
 * POST /api/payroll/transfer/batches/:id/disburse  标记已代发（body: bankTransferRef?）
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { queryOne, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { validateWorkflowAuthorization } from "../workflows/authorization.js";
import { buildWorkflowCommandExecution, buildWorkflowRun, markWorkflowCommandStatus } from "../workflows/commands.js";
import {
  ensureWorkflowRun,
  findSuccessfulWorkflowCommandExecution,
  insertWorkflowCommandExecution,
  insertWorkflowTransition,
  updateWorkflowCommandExecution,
  updateWorkflowRunState
} from "../workflows/persistence.js";
import {
  buildWorkflowTransitionRecord,
  mapPayrollTransferBatchStatusToWorkflowState,
  validateWorkflowTransition
} from "../workflows/runtime.js";
import {
  buildBatchFromPayroll,
  listBatches,
  getBatchWithLines,
  approveBatch,
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
  const body = (req.body ?? {}) as {
    bankTransferRef?: string;
    authorizerUserId?: string;
    authorizerName?: string;
  };
  try {
    const existing = await queryOne<{ id: string; payroll_period: string; status: string; updated_at: string | Date }>(
      "SELECT id, payroll_period, status, updated_at FROM payroll_transfer_batches WHERE id=$1 AND company_id=$2",
      [batchId, req.auth!.companyId],
    );
    if (!existing) {
      json(res, 404, { error: "代发批次不存在" }); return;
    }
    const authorizerUserId = body.authorizerUserId ?? req.auth!.userId;
    const authorizerName = body.authorizerName ?? req.auth!.username;
    const authCheck = validateWorkflowAuthorization({
      action: "payroll.disburse",
      executorUserId: req.auth!.userId,
      authorizerUserId
    });
    if (!authCheck.ok) {
      json(res, 400, { error: authCheck.message, code: authCheck.errorCode }); return;
    }
    const previousState = mapPayrollTransferBatchStatusToWorkflowState(existing.status);
    const nextState = mapPayrollTransferBatchStatusToWorkflowState("disbursed");
    const transitionValidation = validateWorkflowTransition(previousState, nextState);
    if (!transitionValidation.ok) {
      json(res, 400, { error: transitionValidation.message, code: transitionValidation.errorCode }); return;
    }
    const result = await markDisbursed(req.auth!.companyId, batchId, req.auth!.userId, body.bankTransferRef);
    const objectVersion = new Date(existing.updated_at).toISOString();
    await withTransaction(async (client) => {
      const reusable = await findSuccessfulWorkflowCommandExecution(req.auth!.companyId, {
        commandType: "payroll.disburse",
        resourceType: "payroll",
        resourceId: batchId,
        idempotencyKey: `payroll-disburse:${batchId}:${objectVersion}`,
        objectVersion
      });
      if (!reusable) {
        const run = await ensureWorkflowRun(
          client,
          buildWorkflowRun({
            companyId: req.auth!.companyId,
            workflowKey: "payroll.transfer.lifecycle",
            resourceType: "payroll",
            resourceId: batchId,
            resourceLabel: existing.payroll_period,
            currentState: previousState,
            initiatorUserId: req.auth!.userId,
            initiatorName: req.auth!.username,
            authorizerUserId,
            authorizerName
          })
        );
        const transition = buildWorkflowTransitionRecord({
          companyId: req.auth!.companyId,
          workflowRunId: run.id,
          resourceType: "payroll",
          resourceId: batchId,
          previousState,
          nextState,
          actorUserId: req.auth!.userId,
          actorName: req.auth!.username,
          basis: "payroll.disburse",
          ruleVersion: "v4-1a"
        });
        const command = buildWorkflowCommandExecution({
          companyId: req.auth!.companyId,
          workflowRunId: run.id,
          commandType: "payroll.disburse",
          resourceType: "payroll",
          resourceId: batchId,
          idempotencyKey: `payroll-disburse:${batchId}:${objectVersion}`,
          objectVersion,
          inputSnapshot: { batchId, bankTransferRef: body.bankTransferRef ?? null },
          initiatorUserId: req.auth!.userId,
          initiatorName: req.auth!.username,
          executorUserId: req.auth!.userId,
          executorName: req.auth!.username,
          authorizerUserId,
          authorizerName
        });
        const running = markWorkflowCommandStatus(command, "running", { progress: "disbursing_payroll" });
        await insertWorkflowTransition(client, transition);
        await insertWorkflowCommandExecution(client, running);
        await updateWorkflowCommandExecution(
          client,
          markWorkflowCommandStatus(running, "succeeded", {
            progress: "disbursed",
            resultSnapshot: { eventId: result.eventId, bankTransferRef: body.bankTransferRef ?? null }
          })
        );
        await updateWorkflowRunState(client, run.id, nextState, null, new Date().toISOString());
      }
    });
    json(res, 200, { ok: true, ...result });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : "标记代发失败" });
  }
}
