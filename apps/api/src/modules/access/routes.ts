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
  /** 与前端 AppLayout 侧栏分组一致的分组元数据。 */
  groupKey: string;
  groupLabel: string;
}

const GROUP_ENTRY = { groupKey: "g-entry", groupLabel: "业务入口" } as const;
const GROUP_MGMT = { groupKey: "g-mgmt", groupLabel: "经营管理" } as const;
/**
 * V13：费控组。**位置即语义**——排在「经营管理」之后、「财务运营」之前，
 * 与真实业务时序一致：先有业务与合同，再有费用控制，最后才是账务核算。
 */
const GROUP_EXPENSE = { groupKey: "g-expense", groupLabel: "费用与支付" } as const;
const GROUP_FINANCE = { groupKey: "g-finance", groupLabel: "财务运营" } as const;
const GROUP_TAX = { groupKey: "g-tax", groupLabel: "税务人力" } as const;
const GROUP_RISK = { groupKey: "g-risk", groupLabel: "研发风控" } as const;
const GROUP_TOOLS = { groupKey: "g-tools", groupLabel: "AI 与工具" } as const;
const GROUP_SYS = { groupKey: "g-sys", groupLabel: "系统" } as const;

/**
 * V7 J2：导航全集，与前端 AppLayout 的 7 组 17 项一一对应。
 * permissionKey 只复用 permissionCatalog 中已有的键：
 * - /inbox、/assistant 属于人人可用入口，绑定全角色都持有的 tasks.view
 * - /bills、/export-center 归口单据权限 documents.view
 * 末尾另保留 /tasks、/documents 两个旧路由项：前端路由层已重定向到新页面，
 * 但流程卡片等深链仍用本接口的 route 集合做权限判断，删掉会误伤旧深链。
 */
const ALL_MENU_ITEMS: readonly MenuItem[] = [
  // V7 K1/K2 引导模式专属入口：老板工作台 + 记一笔（同样人人可用）
  { key: "home", label: "今天", route: "/home", permissionKey: "tasks.view", ...GROUP_ENTRY },
  { key: "quick-entry", label: "记一笔", route: "/quick-entry", permissionKey: "tasks.view", ...GROUP_ENTRY },
  { key: "inbox", label: "我的一天", route: "/inbox", permissionKey: "tasks.view", ...GROUP_ENTRY },
  { key: "assistant", label: "AI 财税助手", route: "/assistant", permissionKey: "tasks.view", ...GROUP_ENTRY },
  { key: "events", label: "经营事项总线", route: "/events", permissionKey: "events.view", ...GROUP_ENTRY },
  { key: "dashboard", label: "董事长驾驶舱", route: "/dashboard/chairman", permissionKey: "dashboard.view", ...GROUP_ENTRY },
  { key: "contracts", label: "合同与往来", route: "/contracts", permissionKey: "contracts.view", ...GROUP_MGMT },
  { key: "payroll", label: "工资管理", route: "/payroll", permissionKey: "payroll.view", ...GROUP_MGMT },
  // V13-A：预算中心。费用标准不在这里——它是**配置**而非日常操作，
  // 归入系统中心（与科目表、往来单位一致），否则低频配置项会稀释高频入口。
  { key: "budget", label: "预算中心", route: "/budget", permissionKey: "budget.view", ...GROUP_EXPENSE },
  // 我的审批用 workflow.view——那个权限键在目录里躺了很久没人用，
  // 它本就是给审批流预留的。放在费控组而非入口组：审批对象绝大多数是费控单据。
  // 「我的一天」仍聚合全部待办（含审批），两者是聚合视图与专项工作台的分工。
  { key: "approvals", label: "我的审批", route: "/approvals", permissionKey: "workflow.view", ...GROUP_EXPENSE },
  // 申请与报销用 expense.view：能看就能进页面，能不能提单由页面内的
  // 写接口（expense.submit）再判一次。只读角色进得来但提不了单——
  // 这正是「审计要看得到别人的单据」与「只读角色不该提单」的分界。
  { key: "requests", label: "申请与借款", route: "/requests", permissionKey: "expense.view", ...GROUP_EXPENSE },
  { key: "reimbursements", label: "报销中心", route: "/reimbursements", permissionKey: "expense.view", ...GROUP_EXPENSE },
  // 付款中心归 contracts.view：应付列表的来源是合同付款计划。
  // 真正把钱付出去要 banking.manage（出纳本职），那道门在接口上。
  { key: "payments", label: "付款中心", route: "/payments", permissionKey: "contracts.view", ...GROUP_EXPENSE },
  { key: "bills", label: "票据中心", route: "/bills", permissionKey: "documents.view", ...GROUP_FINANCE },
  { key: "vouchers", label: "凭证中心", route: "/vouchers", permissionKey: "ledger.view", ...GROUP_FINANCE },
  { key: "ledger", label: "总账中心", route: "/ledger", permissionKey: "ledger.view", ...GROUP_FINANCE },
  { key: "asset-center", label: "资产与往来", route: "/asset-center", permissionKey: "ledger.view", ...GROUP_FINANCE },
  // V14-C 成本结转。归 ledger.view 与凭证、总账同一档——它的产物就是一张凭证。
  { key: "cost-carryover", label: "成本结转", route: "/cost-carryover", permissionKey: "ledger.view", ...GROUP_FINANCE },
  { key: "reports", label: "财务报表", route: "/reports", permissionKey: "ledger.view", ...GROUP_FINANCE },
  { key: "export-center", label: "导出与归档", route: "/export-center", permissionKey: "documents.view", ...GROUP_FINANCE },
  { key: "tax", label: "税务中心", route: "/tax", permissionKey: "tax.view", ...GROUP_TAX },
  { key: "rnd", label: "研发辅助账", route: "/rnd", permissionKey: "rnd.view", ...GROUP_RISK },
  { key: "risk", label: "风险勾稽", route: "/risk", permissionKey: "risk.view", ...GROUP_RISK },
  { key: "audit", label: "审计日志", route: "/audit", permissionKey: "audit.view", ...GROUP_RISK },
  { key: "knowledge", label: "制度库", route: "/knowledge", permissionKey: "knowledge.view", ...GROUP_TOOLS },
  { key: "settings", label: "系统中心", route: "/settings", permissionKey: "settings.manage", ...GROUP_SYS },
  // 余额调节表不进侧栏（它是月结流程里的一步，由向导跳转进入），
  // 但深链权限判断要认得它，故列在这里。
  { key: "bank-reconciliation", label: "银行余额调节表", route: "/banking/reconciliation", permissionKey: "ledger.view", ...GROUP_FINANCE },
  // 旧路由兼容项（路由层已重定向，仅供深链权限判断）
  { key: "tasks", label: "任务中心", route: "/tasks", permissionKey: "tasks.view", ...GROUP_ENTRY },
  { key: "documents", label: "单据中心", route: "/documents", permissionKey: "documents.view", ...GROUP_FINANCE }
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
