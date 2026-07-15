import { createElement, type ReactNode } from "react";
import {
  AlertOutlined, AuditOutlined, BarChartOutlined, BookOutlined, CalculatorOutlined,
  DashboardOutlined, ExperimentOutlined, ExportOutlined, FileSearchOutlined, FileTextOutlined,
  InboxOutlined, LineChartOutlined, ProfileOutlined, RobotOutlined, SettingOutlined,
  TeamOutlined, UnorderedListOutlined,
} from "@ant-design/icons";

/** 导航叶子项：key 即路由路径。 */
export interface NavLeaf {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
}

/** 导航项：分组（带 children）或扁平叶子。 */
export interface NavEntry extends NavLeaf {
  type?: "group";
  children?: NavLeaf[];
}

/** pro 模式：完整 7 组 17 项导航（与后端 /api/access/menu 的 group 元数据一致）。 */
export const proNavItems: readonly NavEntry[] = [
  {
    key: "g-entry",
    label: "业务入口",
    type: "group",
    children: [
      { key: "/inbox", icon: createElement(InboxOutlined), label: "我的一天" },
      { key: "/assistant", icon: createElement(RobotOutlined), label: "AI 财税助手" },
      { key: "/events", icon: createElement(UnorderedListOutlined), label: "经营事项总线" },
      { key: "/dashboard/chairman", icon: createElement(DashboardOutlined), label: "董事长驾驶舱" },
    ],
  },
  {
    key: "g-mgmt",
    label: "经营管理",
    type: "group",
    children: [
      { key: "/contracts", icon: createElement(FileTextOutlined), label: "合同与往来" },
      { key: "/payroll", icon: createElement(TeamOutlined), label: "工资管理" },
    ],
  },
  {
    key: "g-finance",
    label: "财务运营",
    type: "group",
    children: [
      { key: "/bills", icon: createElement(ProfileOutlined), label: "票据中心" },
      { key: "/vouchers", icon: createElement(AuditOutlined), label: "凭证中心" },
      { key: "/ledger", icon: createElement(BarChartOutlined), label: "总账中心" },
      { key: "/reports", icon: createElement(LineChartOutlined), label: "财务报表" },
      { key: "/export-center", icon: createElement(ExportOutlined), label: "导出与归档" },
    ],
  },
  {
    key: "g-tax",
    label: "税务人力",
    type: "group",
    children: [
      { key: "/tax", icon: createElement(CalculatorOutlined), label: "税务中心" },
    ],
  },
  {
    key: "g-risk",
    label: "研发风控",
    type: "group",
    children: [
      { key: "/rnd", icon: createElement(ExperimentOutlined), label: "研发辅助账" },
      { key: "/risk", icon: createElement(AlertOutlined), label: "风险勾稽" },
      { key: "/audit", icon: createElement(FileSearchOutlined), label: "审计日志" },
    ],
  },
  {
    key: "g-tools",
    label: "AI 与工具",
    type: "group",
    children: [
      { key: "/knowledge", icon: createElement(BookOutlined), label: "制度库" },
    ],
  },
  {
    key: "g-sys",
    label: "系统",
    type: "group",
    children: [
      { key: "/settings", icon: createElement(SettingOutlined), label: "系统中心" },
    ],
  },
];

/** guided 模式：面向老板的白话极简导航（扁平、≤6 项），同样经权限过滤。 */
export const guidedNavItems: readonly NavEntry[] = [
  { key: "/dashboard/chairman", icon: createElement(DashboardOutlined), label: "今日概览" },
  { key: "/assistant", icon: createElement(RobotOutlined), label: "问 AI" },
  { key: "/events", icon: createElement(UnorderedListOutlined), label: "我的事项" },
  { key: "/inbox", icon: createElement(InboxOutlined), label: "审批与待办" },
  { key: "/reports", icon: createElement(LineChartOutlined), label: "经营报告" },
];

/**
 * 按后端返回的可见路由集合过滤导航（保持原顺序，不修改入参）：
 * - allowedRoutes 为 null 表示菜单接口失败后的降级放行：显示全部，
 *   避免把用户锁在空导航里（页面级权限仍由后端接口兜底）
 * - 分组的 children 逐项过滤，过滤后为空的分组整组丢弃
 * - 扁平项（无 children）按自身 key 判断
 */
export function filterNavByAllowedRoutes<T extends NavEntry>(
  items: readonly T[],
  allowedRoutes: ReadonlySet<string> | null
): T[] {
  if (allowedRoutes === null) return [...items];
  const visible: T[] = [];
  for (const item of items) {
    if (!item.children) {
      if (allowedRoutes.has(item.key)) visible.push(item);
      continue;
    }
    const children = item.children.filter((child) => allowedRoutes.has(child.key));
    if (children.length > 0) visible.push({ ...item, children });
  }
  return visible;
}

/** 根据当前路由从导航树推导面包屑 [分组, 页面]（取最长前缀匹配）。 */
export function buildBreadcrumb(
  items: readonly NavEntry[],
  pathname: string
): { group: string; page: string } | null {
  let best: { group: string; page: string; len: number } | null = null;
  for (const group of items) {
    for (const child of group.children ?? []) {
      const key = child.key;
      const isMatch = pathname === key || pathname.startsWith(`${key}/`);
      if (isMatch && (!best || key.length > best.len)) {
        best = {
          group: typeof group.label === "string" ? group.label : group.key,
          page: typeof child.label === "string" ? child.label : key,
          len: key.length,
        };
      }
    }
  }
  return best ? { group: best.group, page: best.page } : null;
}
