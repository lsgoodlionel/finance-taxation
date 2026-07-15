import {
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

// pro 导航常量：7 组 17 项
assert(proNavItems.length === 7, "expected 7 pro nav groups");
const proLeafCount = proNavItems.reduce((count, group) => count + (group.children?.length ?? 0), 0);
assert(proLeafCount === 17, "expected 17 pro nav leaves");

// guided 导航常量：扁平且 ≤6 项，路由必须是 pro 导航的子集
assert(guidedNavItems.length <= 6, "expected guided nav to stay minimal");
const proRoutes = new Set(proNavItems.flatMap((group) => (group.children ?? []).map((child) => child.key)));
for (const item of guidedNavItems) {
  assert(!item.children, "expected guided nav to be flat");
  assert(proRoutes.has(item.key), `expected guided route ${item.key} to exist in pro nav`);
}

// 面包屑：最长前缀匹配
const bc = buildBreadcrumb(proNavItems, "/dashboard/chairman");
assert(bc?.group === "业务入口" && bc.page === "董事长驾驶舱", "expected breadcrumb for chairman dashboard");
assert(buildBreadcrumb(proNavItems, "/nowhere") === null, "expected null breadcrumb for unknown route");

console.log("nav-filter-ok");
