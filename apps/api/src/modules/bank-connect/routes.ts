/**
 * 银企直连的 HTTP 接线（V14-A）。
 *
 * - `GET    /api/bank-connect/configs`              配置列表（证书密码不回显）
 * - `PUT    /api/bank-connect/configs`              新建或更新
 * - `DELETE /api/bank-connect/configs/:id`          删除
 * - `POST   /api/bank-connect/configs/:id/test`     连通性测试（不动资金）
 * - `GET    /api/bank-connect/configs/:id/balance`  余额查询
 * - `GET    /api/bank-connect/instructions`         付款指令列表
 * - `POST   /api/bank-connect/instructions`         把一张付款单发往银行
 * - `POST   /api/bank-connect/instructions/:id/refresh`  查最新状态并回写
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { listRegisteredProviders } from "./adapter.js";
import { BANK_CONNECT_PROVIDERS } from "./providers.js";
import {
  deleteBankConnectConfig,
  listBankConnectConfigs,
  listInstructions,
  queryConfigBalance,
  refreshInstructionStatus,
  submitInstruction,
  testBankConnectConfig,
  upsertBankConnectConfig,
  type BankConnectFailureCode
} from "./store.js";

const STATUS_BY_FAILURE: Record<BankConnectFailureCode, number> = {
  BANK_CONFIG_NOT_FOUND: 404,
  BANK_CONFIG_DISABLED: 409,
  // 501 而不是 400：「这家银行还没实现」是服务端的能力缺口，不是请求错。
  BANK_PROVIDER_NOT_IMPLEMENTED: 501,
  BANK_PAYMENT_NOT_FOUND: 404,
  BANK_PAYMENT_NOT_SUBMITTED: 409,
  BANK_PAYEE_INCOMPLETE: 400,
  BANK_INSTRUCTION_NOT_FOUND: 404
};

function failJson(
  res: ServerResponse,
  failure: { code: BankConnectFailureCode; message: string }
): void {
  json(res, STATUS_BY_FAILURE[failure.code], { error: failure.message, code: failure.code });
}

export async function listBankConnectConfigsRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const items = await listBankConnectConfigs(req.auth!.companyId);
  json(res, 200, {
    items,
    // 前台的银行下拉从这里取，同时标出哪几家已经有适配器实现。
    providers: BANK_CONNECT_PROVIDERS,
    implemented: listRegisteredProviders()
  });
}

export async function upsertBankConnectConfigRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const payerAccount = typeof body.payerAccount === "string" ? body.payerAccount.trim() : "";

  if (provider === "" || payerAccount === "") {
    json(res, 400, { error: "provider 与 payerAccount 不能为空" });
    return;
  }

  const signAlgorithm = body.signAlgorithm === "SM2" ? "SM2" : "RSA";

  const result = await upsertBankConnectConfig({
    companyId: req.auth!.companyId,
    id: typeof body.id === "string" && body.id !== "" ? body.id : null,
    provider,
    displayName: typeof body.displayName === "string" ? body.displayName : provider,
    payerAccount,
    customerNo: typeof body.customerNo === "string" ? body.customerNo : "",
    endpoint: typeof body.endpoint === "string" ? body.endpoint : "",
    signAlgorithm,
    certRef: typeof body.certRef === "string" ? body.certRef : "",
    // **不传就是不改**。编辑页不回显密码，若把 undefined 当空串处理，
    // 用户改个备注就会把证书密码清掉。
    certPassword: typeof body.certPassword === "string" ? body.certPassword : null,
    certFingerprint: typeof body.certFingerprint === "string" ? body.certFingerprint : null,
    certExpiresOn: typeof body.certExpiresOn === "string" ? body.certExpiresOn : null,
    enabled: body.enabled === true,
    note: typeof body.note === "string" ? body.note : null
  });

  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "bank_connect.config.save",
    resourceType: "bank_connect_config",
    resourceId: result.value.id,
    resourceLabel: `${result.value.displayName} ${result.value.payerAccount}`,
    // **不记录任何凭据内容**——审计日志本身也是会被读的。
    changes: { provider: result.value.provider, enabled: result.value.enabled }
  });

  json(res, 200, { config: result.value });
}

export async function deleteBankConnectConfigRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const result = await deleteBankConnectConfig(req.auth!.companyId, id);
  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "bank_connect.config.delete",
    resourceType: "bank_connect_config",
    resourceId: id,
    resourceLabel: "删除银企配置",
    changes: {}
  });
  json(res, 200, { id });
}

export async function testBankConnectConfigRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const result = await testBankConnectConfig(req.auth!.companyId, id);
  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }
  json(res, 200, result.value);
}

export async function bankConnectBalanceRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const result = await queryConfigBalance(req.auth!.companyId, id);
  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }
  json(res, 200, result.value);
}

export async function listInstructionsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listInstructions(req.auth!.companyId, {
    paymentId: url.searchParams.get("paymentId") ?? undefined
  });
  json(res, 200, { items, total: items.length });
}

export async function submitInstructionRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
  const configId = typeof body.configId === "string" ? body.configId : "";

  if (paymentId === "" || configId === "") {
    json(res, 400, { error: "paymentId 与 configId 不能为空" });
    return;
  }

  const result = await submitInstruction({
    companyId: req.auth!.companyId,
    paymentId,
    configId,
    userId: req.auth!.userId
  });

  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "bank_connect.instruction.submit",
    resourceType: "bank_transfer_instruction",
    resourceId: result.value.id,
    resourceLabel: `${result.value.paymentNo} → ${result.value.payeeName}`,
    changes: {
      clientRef: result.value.clientRef,
      amountCents: result.value.amountCents,
      status: result.value.status
    }
  });

  json(res, 201, { instruction: result.value });
}

export async function refreshInstructionRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const result = await refreshInstructionStatus(req.auth!.companyId, id);
  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }
  json(res, 200, { instruction: result.value });
}
