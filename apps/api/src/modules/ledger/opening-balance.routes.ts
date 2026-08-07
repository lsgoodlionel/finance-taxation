/**
 * 期初建账的 HTTP 接线（V12-B4）。
 *
 * - `GET    /api/ledger/opening-balances` 查看已录入的期初余额
 * - `POST   /api/ledger/opening-balances` 录入（校验不通过一律 400，不落库）
 * - `DELETE /api/ledger/opening-balances` 撤销重录
 *
 * 校验失败的响应里带 `code`，让前端能针对「借贷不平」定位到差额、针对「损益类
 * 科目」高亮到具体行 —— 只回一句话的错误在建账这种一次录几十行的场景里没法用。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import {
  deleteOpeningBalances,
  findOpeningBalances,
  postOpeningBalances,
  type OpeningBalanceLineInput
} from "./opening-balance.js";

interface OpeningBalanceBody {
  openingDate?: unknown;
  lines?: unknown;
}

/** 边界处的入参整形。金额一律转成字符串交给下游，避免浮点在 numeric(18,2) 上抖动。 */
function parseLines(raw: unknown): OpeningBalanceLineInput[] | null {
  if (!Array.isArray(raw)) return null;
  const lines: OpeningBalanceLineInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const line = item as Record<string, unknown>;
    const accountCode = typeof line.accountCode === "string" ? line.accountCode.trim() : "";
    if (!accountCode) return null;
    const debit = line.debit;
    const credit = line.credit;
    if (debit != null && typeof debit !== "string" && typeof debit !== "number") return null;
    if (credit != null && typeof credit !== "string" && typeof credit !== "number") return null;
    lines.push({
      accountCode,
      debit: debit == null ? "0" : String(debit),
      credit: credit == null ? "0" : String(credit),
      summary: typeof line.summary === "string" ? line.summary : null
    });
  }
  return lines;
}

export async function getOpeningBalancesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const summary = await withTransaction((client) =>
    findOpeningBalances(client, req.auth!.companyId)
  );
  json(res, 200, { openingBalances: summary });
}

export async function createOpeningBalancesRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const body = (req.body ?? {}) as OpeningBalanceBody;
  const openingDate = typeof body.openingDate === "string" ? body.openingDate.trim() : "";
  if (!openingDate) {
    json(res, 400, { error: "openingDate 必填，格式 YYYY-MM-DD（建账基准日）", code: "OPENING_DATE_INVALID" });
    return;
  }
  const lines = parseLines(body.lines);
  if (!lines) {
    json(res, 400, {
      error: "lines 必须是数组，每项含 accountCode 与 debit/credit 金额",
      code: "OPENING_BALANCE_INVALID_LINES"
    });
    return;
  }

  const result = await withTransaction((client) =>
    postOpeningBalances(client, {
      companyId: req.auth!.companyId,
      openingDate,
      lines,
      now: new Date().toISOString(),
      createdBy: req.auth!.userId
    })
  );

  if (!result.ok) {
    // 校验不通过时事务已回滚（postOpeningBalances 在写入前返回，事务里没有脏写）。
    json(res, 400, { error: result.failure.message, ...result.failure });
    return;
  }
  json(res, 201, result.summary);
}

export async function deleteOpeningBalancesRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const result = await withTransaction((client) =>
    deleteOpeningBalances(client, req.auth!.companyId)
  );
  if (!result.ok) {
    json(res, result.code === "OPENING_BALANCE_NOT_FOUND" ? 404 : 400, {
      error: result.message,
      code: result.code
    });
    return;
  }
  json(res, 200, { deleted: true, voucherId: result.voucherId });
}
