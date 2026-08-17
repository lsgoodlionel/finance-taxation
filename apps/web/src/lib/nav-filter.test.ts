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

// pro 导航常量：8 组 24 项。
// 这两个数字是**防膨胀护栏**，不是随代码变动的快照：每加一项都该先问
// "能不能并进已有的中心"。V12 批次 C 新增四个能力（固定资产 / 往来账龄 /
// 定期凭证 / 余额调节表），只加了一项 /assets——前三个并成同一页的三件事，
// 余额调节表由月结向导跳转、不进侧栏。
//
// V13 第 8 组「费用与支付」到批次 C 收在 5 项：
// 预算中心 / 我的审批 / 申请与借款 / 报销中心 / 付款中心——与蓝图一致，
// 不多不少。
// 费用标准没有独立入口：它是**配置**而非日常操作，归入系统中心，与科目表、
// 往来单位一致——低频配置项进一级导航会稀释高频入口。
// 这一组到此为止。再想往里加，先问「能不能并进已有的五项之一」。
assert(proNavItems.length === 8, "expected 8 pro nav groups");
const proLeafCount = proNavItems.reduce((count, group) => count + (group.children?.length ?? 0), 0);
assert(proLeafCount === 24, "expected 24 pro nav leaves");

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
// V13-B8：/quick-entry 从 guided 轨移到 pro 轨，不再是 guided 专属。
// 「记一笔」是记账口径，对业务人员是错的抽象；但会计要这个快速入口，
// 所以是移动而不是删除——两轨都不放等于悄悄下线一个功能。
assert(GUIDED_ONLY_ROUTES.includes("/home"), "expected /home to stay guided-only");
assert(!GUIDED_ONLY_ROUTES.includes("/quick-entry"), "expected /quick-entry to have moved to pro nav");
assert(proRoutes.has("/quick-entry"), "expected /quick-entry to be reachable from pro nav");

// 面包屑：最长前缀匹配
const bc = buildBreadcrumb(proNavItems, "/dashboard/chairman");
assert(bc?.group === "业务入口" && bc.page === "董事长驾驶舱", "expected breadcrumb for chairman dashboard");
assert(buildBreadcrumb(proNavItems, "/nowhere") === null, "expected null breadcrumb for unknown route");

console.log("nav-filter-ok");
