/**
 * AI 治理 HTTP 路由（D5 分级自动化决策门）。
 * POST /api/ai/automation/decide     裁定某次 AI/规则产出的自动化级别
 * GET  /api/ai/automation/thresholds 查询默认阈值配置
 *
 * 注意：本门只裁定「auto / suggest / manual」自动化级别，金额校验、
 * 借贷平衡等硬约束绝不会交给 LLM 处理——那些校验始终在业务层强制执行。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { decideAutomation, DEFAULT_THRESHOLDS } from "./governance.js";

interface AutomationDecisionBody {
  ruleConfidence?: unknown;
  isFinancialMutation?: unknown;
  amountCents?: unknown;
  thresholds?: unknown;
}

function validateDecisionBody(body: AutomationDecisionBody): string | null {
  const { ruleConfidence, isFinancialMutation, amountCents } = body;
  if (typeof ruleConfidence !== "number" || !Number.isFinite(ruleConfidence) || ruleConfidence < 0 || ruleConfidence > 1) {
    return "ruleConfidence 必须为 0-1 之间的有限数字";
  }
  if (typeof isFinancialMutation !== "boolean") {
    return "isFinancialMutation 必须为布尔值";
  }
  if (amountCents !== undefined && (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents < 0)) {
    return "amountCents 必须为非负数字";
  }
  return null;
}

export async function automationDecisionRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as AutomationDecisionBody;
  const validationError = validateDecisionBody(body);
  if (validationError) { json(res, 400, { error: validationError }); return; }

  const decision = decideAutomation({
    ruleConfidence: body.ruleConfidence as number,
    isFinancialMutation: body.isFinancialMutation as boolean,
    amountCents: body.amountCents as number | undefined,
    thresholds: body.thresholds as Partial<typeof DEFAULT_THRESHOLDS> | undefined
  });

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "ai.automation.decided",
    resourceType: "company",
    changes: { level: decision.level }
  });

  json(res, 200, { level: decision.level, reason: decision.reason });
}

export async function automationThresholdsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  json(res, 200, DEFAULT_THRESHOLDS);
}
