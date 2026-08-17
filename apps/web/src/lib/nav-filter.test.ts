import {
  GUIDED_ONLY_ROUTES,
  buildBreadcrumb,
  filterNavByAllowedRoutes,
  guidedNavItems,
  proNavItems,
  type NavEntry,
} from "./nav-filter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const items: NavEntry[] = [
  {
    key: "g-a",
    label: "分组A",
    type: "group",
    children: [
      { key: "/x", label: "X页" },
      { key: "/y", label: "Y页" },
    ],
  },
  {
    key: "g-b",
    label: "分组B",
    type: "group",
    children: [{ key: "/z", label: "Z页" }],
  },
  { key: "/flat", label: "扁平项" },
];

// 保序过滤：只留可见路由，空组丢弃，扁平项按自身 key 判断
const filtered = filterNavByAllowedRoutes(items, new Set(["/y", "/flat"]));
assert(filtered.length === 2, "expected group-b to be dropped when all children filtered out");
assert(filtered[0]?.key === "g-a" && filtered[1]?.key === "/flat", "expected original order preserved");
const survivedChildren = filtered[0]?.children ?? [];
assert(survivedChildren.length === 1 && survivedChildren[0]?.key === "/y", "expected only /y to survive in group-a");

// 不修改入参（不可变）
assert(items[0]?.children?.length === 2, "expected source items to stay untouched");

// null = 降级放行：显示全部（返回副本）
const fallback = filterNavByAllowedRoutes(items, null);
assert(fallback.length === items.length, "expected fallback to keep all entries");
assert(fallback !== items, "expected fallback to return a copy");

// 空集合 → 空导航
assert(filterNavByAllowedRoutes(items, new Set()).length === 0, "expected empty set to filter everything");

// pro 导航常量：8 组 19 项。
// 这两个数字是**防膨胀护栏**，不是随代码变动的快照：每加一项都该先问
// "能不能并进已有的中心"。V12 批次 C 新增四个能力（固定资产 / 往来账龄 /
// 定期凭证 / 余额调节表），只加了一项 /assets——前三个并成同一页的三件事，
// 余额调节表由月结向导跳转、不进侧栏。
//
// V13-A 新增第 8 组「费用与支付」，本批次只落 1 项（预算中心）。
// 费用标准没有独立入口：它是**配置**而非日常操作，归入系统中心，与科目表、
// 往来单位一致——低频配置项进一级导航会稀释高频入口。
// 批次 B/C 会把这组加到 5 项（申请与借款 / 报销中心 / 付款中心 / 我的审批），
// 届时这两个数字要跟着改，而改动本身就是一次"这项非加不可吗"的复核。
assert(proNavItems.length === 8, "expected 8 pro nav groups");
const proLeafCount = proNavItems.reduce((count, group) => count + (group.children?.length ?? 0), 0);
assert(proLeafCount === 19, "expected 19 pro nav leaves");

// guided 导航常量：扁平且 ≤6 项，路由必须是 pro 导航或 guided 专属路由清单的成员
assert(guidedNavItems.length <= 6, "expected guided nav to stay minimal");
const proRoutes = new Set(proNavItems.flatMap((group) => (group.children ?? []).map((child) => child.key)));
for (const item of guidedNavItems) {
  assert(!item.children, "expected guided nav to be flat");
  assert(
    proRoutes.has(item.key) || GUIDED_ONLY_ROUTES.includes(item.key),
    `expected guided route ${item.key} to exist in pro nav or GUIDED_ONLY_ROUTES`
  );
}
assert(GUIDED_ONLY_ROUTES.includes("/home") && GUIDED_ONLY_ROUTES.includes("/quick-entry"), "expected guided-only routes to cover /home and /quick-entry");

// 面包屑：最长前缀匹配
const bc = buildBreadcrumb(proNavItems, "/dashboard/chairman");
assert(bc?.group === "业务入口" && bc.page === "董事长驾驶舱", "expected breadcrumb for chairman dashboard");
assert(buildBreadcrumb(proNavItems, "/nowhere") === null, "expected null breadcrumb for unknown route");

console.log("nav-filter-ok");
