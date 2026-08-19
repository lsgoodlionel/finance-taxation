/**
 * **前台入口护栏**：后端做了的能力，前台必须有调用点。
 *
 * ## 为什么需要这条
 *
 * 「后端有能力、没入口」是这个项目里出现最多的一类缺陷——V12 数到五次、
 * V13 第六次、V14 第七第八次，而这次做完整审计发现**至少十个**：期初建账、
 * 年度结转、增值税结转、银行付款指令导出、现金流预测……全都后端实现完整、
 * 带集成测试，前台一个调用点都没有。
 *
 * 每一次都是同一个原因：做完后端，测试全绿，就当这件事做完了。
 * 而用户打开系统，那个能力等于不存在。
 *
 * 靠「记得检查」防不住——V13 的蓝图里写了应对办法，V14 里我自己又犯了两次。
 * 所以做成护栏：**新增路由而前台没有调用点时，这条测试会失败**。
 *
 * ## 判定方式：字面前缀，或末段这个有区分度的词
 *
 * 先看前端源码里有没有路径的字面前缀。找不到时再找**末段**——
 * 前端常把 URL 拼起来（`/api/tax-integration/${type}`），字面比对看不见那种，
 * 但 `vat-xml` 这个词一定在前端某处出现过（下拉选项、类型联合、按钮配置）。
 *
 * **只认末段，不做逐段回退。** 回退到 `/api/ledger` 这种两段前缀会哪里都能命中，
 * 等于把没入口的说成有——那比漏报严重得多，因为它让护栏静默失效。
 *
 * 末段太短（少于 4 个字符）或看着像通用词时不认，理由同上。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const registryPath = join(repoRoot, "apps/api/src/routes/registry.ts");
const webRoot = join(repoRoot, "apps/web/src");

/**
 * 允许没有前台调用点的路由，**每条都要说明为什么**。
 *
 * 三类是正当的：
 * 1. 运维探针与引导端点（不面向用户）
 * 2. 开放 API 的元数据（面向外部调用方，不是本系统的前端）
 * 3. 前端用动态拼接调用、字符串比对看不见的
 *
 * **「以后会做」不是正当理由。** 那种情况应当留在下面的 KNOWN_GAPS 里，
 * 它会打印出来提醒，而不是被这条白名单静默吞掉。
 */
const BACKEND_ONLY_ROUTES: ReadonlyMap<string, string> = new Map([
  ["GET /health", "运维探针：给负载均衡与容器健康检查用，不面向用户"],
  ["GET /api/health", "同上，带 /api 前缀的别名"],
  ["GET /bootstrap", "引导端点：返回前端启动所需的最小配置，由 index.html 直接取"],
  ["GET /v2/meta/rbac", "开放 API 元数据：面向外部调用方，不是本系统前端"],
  ["GET /v2/meta/business-events", "同上"],
  ["GET /v2/meta/tasks", "同上"],
  [
    "GET /api/jobs",
    "调度队列的可观测端点。**运维用，不是业务功能**——业务侧看到的是任务的结果" +
      "（凭证、通知），而不是队列本身"
  ],
  ["POST /api/jobs", "同上，手动入队是运维动作"],
  [
    "GET /api/notifications/deliveries",
    "通知发送记录，排查「为什么没收到」时用。运维侧能力，不是日常业务"
  ]
]);

/**
 * **已知缺口**：后端做完了、前台确实还没做的。
 *
 * 与白名单的区别：白名单是「不需要入口」，这里是「需要但还没做」。
 * 列在这里不会让测试失败，但**会被打印出来**——让每次跑测试的人都看见
 * 这个清单还有多长，而不是等到下一次全量审计才发现。
 *
 * 修一个删一条。清空之后把这个常量删掉。
 */
const KNOWN_GAPS: ReadonlyMap<string, string> = new Map([
  ["GET /api/analytics/cash-forecast", "现金流预测：分析类，不阻塞日常记账"],
  ["GET /api/analytics/revenue-comparison", "收入对比：同上"],
  ["GET /api/runtime/tasks", "运行时摘要：前端有自己的汇总口径，这个端点暂无消费方"],
  ["GET /api/runtime/tax", "同上"],
  ["POST /api/banking/sync-statements", "银行流水同步：手工模式下走 CSV 导入，这个端点待接入"],
  ["GET /api/settings/users", "用户管理：权限页有自己的取数，这个端点暂无消费方"],
]);

/**
 * 前端有没有调用这条路径。
 *
 * `/api/tax-integration/vat-xml` 在前端写成 `/api/tax-integration/${type}`——
 * 字面比对看不见，所以逐段砍尾巴再找。砍到只剩两段就停：
 * 再短没有区分度，任何 `/api` 都能命中。
 */
function hasFrontendCaller(routePath: string, webSource: string): boolean {
  const literal = routePath.split("/:")[0]!;
  if (webSource.includes(literal)) return true;

  const segments = literal.split("/").filter((part) => part !== "");
  const last = segments[segments.length - 1];
  // 只有三段以上的路径才看末段：`/api/jobs` 的末段是 `jobs`，
  // 那个词在前端到处都是，认它等于不判。
  if (last === undefined || segments.length < 3) return false;
  if (last.length < 4 || GENERIC_SEGMENTS.has(last)) return false;

  return webSource.includes(last);
}

/**
 * 末段太通用、认了等于不判的词。
 *
 * 这份名单只该收「在前端源码里必然大量出现」的词——不是「我觉得不重要」的词。
 */
const GENERIC_SEGMENTS: ReadonlySet<string> = new Set([
  "list",
  "items",
  "data",
  "info",
  "status",
  "detail",
  "summary",
  "config",
  "settings",
  "users",
  "tasks"
]);

async function collectWebSource(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectWebSource(full)));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

test("后端路由必须有前台调用点（白名单与已知缺口除外）", async () => {
  const registry = await readFile(registryPath, "utf8");
  const routes = [...registry.matchAll(/method:\s*"(\w+)",?\s*\n?\s*path:\s*"([^"]+)"/g)].map(
    ([, method, path]) => ({ method: method!, path: path!, id: `${method} ${path}` })
  );

  assert.ok(routes.length > 200, `路由解析失败，只解析出 ${routes.length} 条`);

  const files = await collectWebSource(webRoot);
  const webSource = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

  const orphans = routes.filter((route) => !hasFrontendCaller(route.path, webSource));

  const unexplained = orphans.filter(
    (route) => !BACKEND_ONLY_ROUTES.has(route.id) && !KNOWN_GAPS.has(route.id)
  );

  assert.deepEqual(
    unexplained.map((route) => route.id),
    [],
    "这些后端路由在前端找不到任何调用点。要么补前台入口，要么登记到 " +
      "BACKEND_ONLY_ROUTES（说明为什么不需要）或 KNOWN_GAPS（承认还没做）。" +
      "「后端有能力、没入口」是这个项目里出现最多的一类缺陷。"
  );

  // 已知缺口列出来——让每次跑测试的人都看见它还有多长。
  if (KNOWN_GAPS.size > 0) {
    const stillOrphan = orphans.filter((route) => KNOWN_GAPS.has(route.id));
    console.log(`\n[前台入口] 已知缺口 ${stillOrphan.length} 条（修一个删一条）：`);
    for (const route of stillOrphan) {
      console.log(`  - ${route.id}  ${KNOWN_GAPS.get(route.id)}`);
    }
  }
});

test("白名单与已知缺口里不能有已经补上入口的条目", async () => {
  // 补上入口却忘了删登记，会让这份清单越读越不可信——
  // 而不可信的清单等于没有清单。
  const registry = await readFile(registryPath, "utf8");
  const routes = [...registry.matchAll(/method:\s*"(\w+)",?\s*\n?\s*path:\s*"([^"]+)"/g)].map(
    ([, method, path]) => `${method} ${path}`
  );
  const routeSet = new Set(routes);

  const files = await collectWebSource(webRoot);
  const webSource = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

  const stale: string[] = [];
  for (const id of KNOWN_GAPS.keys()) {
    if (!routeSet.has(id)) {
      stale.push(`${id}（路由已不存在）`);
      continue;
    }
    if (hasFrontendCaller(id.split(" ")[1]!, webSource)) {
      stale.push(`${id}（前台已有入口，请删除登记）`);
    }
  }
  for (const id of BACKEND_ONLY_ROUTES.keys()) {
    if (!routeSet.has(id)) stale.push(`${id}（路由已不存在）`);
  }

  assert.deepEqual(stale, [], "清单里有过期条目");
});
