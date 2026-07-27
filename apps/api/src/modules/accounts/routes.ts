import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
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

export function listAccounts(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const category = url.searchParams.get("category") as AccountCategory | null;
  const q = url.searchParams.get("q")?.toLowerCase() ?? "";
  const leafOnly = url.searchParams.get("leafOnly") === "true";

  let items = CHART_OF_ACCOUNTS;
  if (category) {
    items = items.filter((item) => item.category === category);
  }
  if (q) {
    items = items.filter(
      (item) => item.code.includes(q) || item.name.toLowerCase().includes(q)
    );
  }
  if (leafOnly) {
    items = items.filter((item) => item.isLeaf);
  }
  return json(res, 200, { items, total: items.length });
}

export function getAccountByCode(req: ApiRequest, res: ServerResponse, code: string) {
  const account = CHART_OF_ACCOUNTS.find((item) => item.code === code);
  if (!account) {
    return json(res, 404, { error: "Account not found" });
  }
  return json(res, 200, account);
}
