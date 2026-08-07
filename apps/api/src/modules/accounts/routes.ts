import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import {
  createCompanyAccount,
  findCompanyAccount,
  listCompanyAccounts,
  renameCompanyAccount,
  setAccountActive
} from "./account-store.js";
import { CHART_OF_ACCOUNTS } from "./chart-of-accounts.js";
import type { AccountCategory } from "./chart-of-accounts.js";

// 科目主数据已抽到 chart-of-accounts.ts（报表模块需要复用其 category 字段，
// 不应为此依赖 HTTP 路由）。此处原样再导出，保持既有 import 路径不变。
export {
  CHART_OF_ACCOUNTS,
  findChartAccount
} from "./chart-of-accounts.js";
export type {
  AccountCategory,
  AccountDirection,
  ChartAccount
} from "./chart-of-accounts.js";

/**
 * 科目列表 —— 数据源已从 TS 常量切到 `accounts` 表（迁移 049），按公司隔离。
 * 此前所有租户看到的是同一份写死的 63 条。
 */
export async function listAccounts(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listCompanyAccounts(req.auth!.companyId, {
    category: (url.searchParams.get("category") as AccountCategory | null) ?? undefined,
    search: url.searchParams.get("q") ?? undefined,
    leafOnly: url.searchParams.get("leafOnly") === "true",
    // 科目管理页要能看到停用的科目才能重新启用；记账时的选择器不传这个参数。
    includeInactive: url.searchParams.get("includeInactive") === "true"
  });
  return json(res, 200, { items, total: items.length });
}

export async function getAccountByCode(req: ApiRequest, res: ServerResponse, code: string) {
  const account = await findCompanyAccount(req.auth!.companyId, code);
  if (!account) {
    return json(res, 404, { error: "Account not found" });
  }
  return json(res, 200, account);
}

/** 新建自定义科目。编码与科目性质一旦建立就不可改——它们会写进历史分录。 */
export async function createAccount(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as {
    code?: string;
    name?: string;
    category?: AccountCategory;
    accountType?: string;
    direction?: "debit" | "credit";
    parentCode?: string | null;
  };
  if (!body.code || !body.name || !body.category || !body.direction) {
    return json(res, 400, { error: "code、name、category、direction 都是必填项" });
  }
  const result = await createCompanyAccount({
    companyId: req.auth!.companyId,
    code: body.code,
    name: body.name,
    category: body.category,
    // 不传时按 category 给一个通用语义，用户后续可在科目管理页细化
    accountType: body.accountType || body.category,
    direction: body.direction,
    parentCode: body.parentCode ?? null
  });
  if (!result.ok) {
    return json(res, 400, { error: result.message, code: result.code });
  }
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "create",
    resourceType: "account",
    resourceId: body.code,
    resourceLabel: body.name
  });
  return json(res, 201, result.account);
}

/**
 * 改名或停用/启用。
 *
 * **不提供删除**：科目一旦被分录引用过，删掉会让历史账无法解读。停用足以达到
 * 「不再使用」的目的，且保留历史可读性。
 */
export async function updateAccount(req: ApiRequest, res: ServerResponse, code: string) {
  const body = (req.body || {}) as { name?: string; isActive?: boolean };
  let result: Awaited<ReturnType<typeof renameCompanyAccount>> | null = null;

  if (typeof body.name === "string" && body.name.length > 0) {
    result = await renameCompanyAccount(req.auth!.companyId, code, body.name);
    if (!result.ok) return json(res, 400, { error: result.message, code: result.code });
  }
  if (typeof body.isActive === "boolean") {
    result = await setAccountActive(req.auth!.companyId, code, body.isActive);
    if (!result.ok) return json(res, 400, { error: result.message, code: result.code });
  }
  if (!result) {
    return json(res, 400, { error: "没有要更新的字段（可改 name 或 isActive）" });
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "update",
    resourceType: "account",
    resourceId: code,
    resourceLabel: result.account.name,
    changes: { after: { name: body.name, isActive: body.isActive } }
  });
  return json(res, 200, result.account);
}
