/**
 * 页面指南的总入口（V15）。
 *
 * 按域拆成四个文件：内容写细到字段级之后，一个文件会超过 800 行
 * （项目的文件大小约定），而且改某一组时不用在上千行里翻。
 *
 * 拆分方式跟着**导航分组**走，不是跟着技术模块——找指南的人是按
 * 「我在哪一组页面」找的。
 */

import { ENTRY_GUIDES } from "./entry";
import { EXPENSE_GUIDES } from "./expense";
import { FINANCE_GUIDES } from "./finance";
import { RISK_SYS_GUIDES } from "./risk-sys";
import { SECONDARY_GUIDES } from "./secondary";
import type { PageGuide } from "./types";

export type { GuideField, GuidePitfall, PageGuide } from "./types";

export const PAGE_GUIDES: readonly PageGuide[] = [
  ...ENTRY_GUIDES,
  ...EXPENSE_GUIDES,
  ...FINANCE_GUIDES,
  ...RISK_SYS_GUIDES,
  // 导航到不了但深链与页内跳转能到的——用户到得了就该有指南
  ...SECONDARY_GUIDES
];

const BY_ROUTE = new Map(PAGE_GUIDES.map((guide) => [guide.route, guide]));

/**
 * 按路径找指南。
 *
 * 取**最长前缀匹配**：`/dashboard/chairman` 要匹配到它自己而不是 `/dashboard`。
 */
export function findPageGuide(pathname: string): PageGuide | null {
  const exact = BY_ROUTE.get(pathname);
  if (exact) return exact;

  let best: PageGuide | null = null;
  for (const guide of PAGE_GUIDES) {
    if (pathname.startsWith(`${guide.route}/`)) {
      if (best === null || guide.route.length > best.route.length) best = guide;
    }
  }
  return best;
}

/** 按路由取标题，用于「相关页面」的链接文案。查不到时回显路由本身。 */
export function guideTitleOf(route: string): string {
  return BY_ROUTE.get(route)?.title ?? route;
}

/**
 * 指南在手册里的锚点 id。
 *
 * 页面指南与手册双向跳转靠它。**两处必须用同一个函数生成**——
 * 各写一份字符串处理，改了一处另一处就跳不到了。
 */
export function guideAnchorId(route: string): string {
  return `guide-${route.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-+|-+$/g, "")}`;
}
