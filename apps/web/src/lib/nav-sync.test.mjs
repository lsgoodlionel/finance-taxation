/**
 * **导航同步护栏**（V15）。
 *
 * ## 为什么需要
 *
 * 导航有两份清单：后端 `modules/access/routes.ts` 的 `ALL_MENU_ITEMS`（决定
 * 权限过滤），前端 `lib/nav-filter.ts` 的 `proNavItems`（决定左侧栏长什么样）。
 * 两份都手写，**漂移是必然的**。
 *
 * V15 加「成本结转」时就漂了一次：后端菜单加了、前端导航没加，
 * 于是专业模式的左侧栏里根本看不到那一项——功能做完了、页面也做了，
 * 但用户点不到。这是「后端有能力、没入口」的又一种形态。
 *
 * 这条测试把两份清单对起来：一边有另一边没有就失败。
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const apiSource = await readFile(
  resolve(repoRoot, "apps/api/src/modules/access/routes.ts"),
  "utf8"
);
const webSource = await readFile(
  resolve(repoRoot, "apps/web/src/lib/nav-filter.ts"),
  "utf8"
);

/**
 * 后端有、但**故意不放进左侧导航**的路由。
 *
 * 只该收「旧路由的兼容项」——它们保留在后端是为了让旧深链的权限判断仍然成立，
 * 但左侧栏不该出现两个入口指向同一件事。
 */
const BACKEND_ONLY_ROUTES = new Map([
  ["/tasks", "旧路由：前端已重定向到 /inbox，保留后端项只为旧深链的权限判断"],
  ["/documents", "旧路由：前端已重定向到 /bills，理由同上"],
  [
    "/banking/reconciliation",
    "从「总账中心」进的二级页面。左侧栏放一级入口会让「对账」看起来与" +
      "「凭证」「总账」平级，而它是总账下的一个动作"
  ]
]);

const backendRoutes = [...apiSource.matchAll(/route: "([^"]+)"/g)].map((m) => m[1]);
const webRoutes = [...webSource.matchAll(/key: "(\/[^"]*)"/g)].map((m) => m[1]);

assert(backendRoutes.length > 15, `后端导航解析失败，只解析出 ${backendRoutes.length} 条`);
assert(webRoutes.length > 15, `前端导航解析失败，只解析出 ${webRoutes.length} 条`);

const webSet = new Set(webRoutes);
const missingInWeb = backendRoutes.filter(
  (route) => !webSet.has(route) && !BACKEND_ONLY_ROUTES.has(route)
);
assert(
  missingInWeb.length === 0,
  `这些路由在后端菜单里有、前端左侧导航里没有：${missingInWeb.join("、")}\n` +
    "补进 lib/nav-filter.ts 的 proNavItems，或登记到 BACKEND_ONLY_ROUTES 并说明为什么。\n" +
    "后端有而前端导航没有 = 用户点不到，等于功能不存在。"
);

const backendSet = new Set(backendRoutes);
const missingInBackend = [...new Set(webRoutes)].filter((route) => !backendSet.has(route));
assert(
  missingInBackend.length === 0,
  `这些路由在前端左侧导航里有、后端菜单里没有：${missingInBackend.join("、")}\n` +
    "后端没有就没有权限元数据，那一项对所有人都不可见——补进 ALL_MENU_ITEMS。"
);

// 例外清单不能有过期条目：路由删了却留着登记，读起来还像回事。
for (const route of BACKEND_ONLY_ROUTES.keys()) {
  assert(backendSet.has(route), `BACKEND_ONLY_ROUTES 里的 ${route} 在后端已不存在，请删除登记`);
}

console.log(`nav-sync passed（后端 ${backendRoutes.length} 项，前端 ${webRoutes.length} 项）`);
