import type { ServerResponse } from "node:http";
import type { PermissionKey } from "@finance-taxation/domain-model";
import { json } from "../../utils/http.js";
import { hasPermission } from "../../middleware/auth.js";
import type { ApiRequest } from "../../types.js";

interface MenuItem {
  key: string;
  label: string;
  route: string;
  permissionKey: PermissionKey;
}

const ALL_MENU_ITEMS: MenuItem[] = [
  { key: "dashboard",  label: "董事长驾驶舱", route: "/dashboard/chairman", permissionKey: "dashboard.view" },
  { key: "events",     label: "经营事项总线", route: "/events",             permissionKey: "events.view" },
  { key: "contracts",  label: "合同管理",     route: "/contracts",          permissionKey: "contracts.view" },
  { key: "tasks",      label: "任务中心",     route: "/tasks",              permissionKey: "tasks.view" },
  { key: "documents",  label: "单据中心",     route: "/documents",          permissionKey: "documents.view" },
  { key: "vouchers",   label: "凭证中心",     route: "/vouchers",           permissionKey: "ledger.view" },
  { key: "ledger",     label: "总账中心",     route: "/ledger",             permissionKey: "ledger.view" },
  { key: "reports",    label: "财务报表",     route: "/reports",            permissionKey: "ledger.view" },
  { key: "tax",        label: "税务中心",     route: "/tax",                permissionKey: "tax.view" },
  { key: "rnd",        label: "研发辅助账",   route: "/rnd",                permissionKey: "rnd.view" },
  { key: "risk",       label: "风险勾稽",     route: "/risk",               permissionKey: "risk.view" }
];

export function getMenu(req: ApiRequest, res: ServerResponse) {
  const roleCodes = req.auth?.roleCodes ?? [];
  const visibleItems = ALL_MENU_ITEMS.filter((item) =>
    hasPermission(roleCodes, item.permissionKey)
  );
  return json(res, 200, {
    companyId: req.auth?.companyId,
    roleCodes,
    items: visibleItems
  });
}
