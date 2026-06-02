/**
 * P4 社保联动 HTTP 路由
 * POST /api/payroll/periods/:period/social-security-closure
 *   工资关账 → 自动生成社保申报事项/任务 + 三险一金凭证草稿
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { generateSocialSecurityClosure } from "./social-security-closure.js";

export async function socialSecurityClosureRoute(
  req: ApiRequest,
  res: ServerResponse,
  period: string,
): Promise<void> {
  try {
    const result = await generateSocialSecurityClosure(req.auth!.companyId, period, req.auth!.userId);
    json(res, 201, { ok: true, ...result });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : "社保关账失败" });
  }
}
