/**
 * 发票匹配建议的 HTTP 接线（V14-D）。
 *
 * - `POST /api/invoices/suggest`  给一笔报销明细找候选发票
 *
 * **用 POST 是因为入参是对象**（金额 + 日期 + 关键词 + 排除单据），
 * 塞进查询串既难读又有长度上限。语义上它与 GET 无异——纯查询，
 * 不落库、不改任何单据。权限白名单第 1 类。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { suggestInvoices } from "./match-store.js";

/** 返回条数上限。够翻一屏，又不至于把「建议」变成「又一个发票列表」。 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function suggestInvoicesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const amountCents = Number(body.amountCents);
  const expenseOn = typeof body.expenseOn === "string" ? body.expenseOn : "";

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    json(res, 400, { error: "amountCents 必须是正整数分" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseOn)) {
    json(res, 400, { error: "expenseOn 必须是 YYYY-MM-DD" });
    return;
  }

  const rawLimit = Number(body.limit);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  const result = await suggestInvoices({
    companyId: req.auth!.companyId,
    amountCents,
    expenseOn,
    // 空串归一成 null：空串会让关键词匹配恒真，等于这一项没有区分度。
    keyword: typeof body.keyword === "string" && body.keyword.trim() !== "" ? body.keyword : null,
    excludeReimbursementId:
      typeof body.reimbursementId === "string" && body.reimbursementId !== ""
        ? body.reimbursementId
        : null,
    limit
  });

  json(res, 200, result);
}
