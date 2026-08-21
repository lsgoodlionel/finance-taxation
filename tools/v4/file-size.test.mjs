/**
 * **文件体量护栏**（V15/P2）。
 *
 * ## 为什么需要
 *
 * P2 把三个文件拆开了：`lib/api.ts` 3037 → 903、`events/routes.ts` 2097 → 908、
 * `routes/registry.ts` 1787 → 48。
 *
 * 但拆开只是一次性动作。这些文件当初也不是一天写成 3000 行的，是一次加 30 行、
 * 加了一百次。**没有护栏的话，半年后它们会重新长回去**，而且下一次拆的人
 * 还得从头理一遍。
 *
 * ## 判定：按当前实际值定上限，只许降不许升
 *
 * 上限不是拍一个「800 行」的通用值——那会让本来就超标的历史文件天天报红，
 * 变成必须无视的噪音。这里给每个已知的大文件钉一条**当前值 + 少量余量**的线：
 * 继续改它可以，长回去不行。
 *
 * 新文件走默认上限。默认值定在 800 行——超过这个数，一个人一屏一屏翻完
 * 就已经忘了开头。
 *
 * ## 想加豁免的时候
 *
 * 请先问：这个文件是不是又在承担两件事？`registry.ts` 之所以能从 1787 降到 48，
 * 是因为它原本同时是「路由目录」和「三个 handler 的实现」。
 * 豁免清单里的每一条都该写清**为什么这一坨必须待在一起**。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** 默认上限。超过这行数，读的人已经记不住文件开头讲了什么。 */
const DEFAULT_LIMIT = 800;

/**
 * 逐文件上限：**当前值 + 余量**，只许降不许升。
 *
 * 余量给到 ~5%，够放几个新函数，不够放一个新领域。
 */
const FILE_LIMITS = new Map([
  // 门面 + 一段跨领域互相引用的中枢接口（事项/任务/凭证/单据/总账/报表/税务）。
  // 这一段硬切会造出循环依赖，等各自领域稳定再动。
  ["apps/web/src/lib/api.ts", 950],
  // 事项路由：映射规则与落库都拆走了，剩下的是 HTTP 层本身。
  ["apps/api/src/modules/events/routes.ts", 950],
  // 事项 → 单据/税务/凭证的派生规则。这是一整套业务规则，拆散反而更难读。
  ["apps/api/src/modules/events/event-mappings.ts", 600],
  // 费控地基路由组：申请单/借款/报销/验收/发票池/成本/银企/付款/审批流。
  // 它们共享一套费用控制语义，且顺序敏感（子路径必须在 /:id 之前）。
  ["apps/api/src/routes/groups/expense-control.ts", 500],

  // ── 这条护栏第一次跑就抓出来的五个，回顾里一个都没提到 ────────────────
  // 「摩擦最大的三个文件」是人工数的，而人只会数自己最近碰过的。
  // 下面几条先钉住现值止住增长，按摩擦排序逐个处理。
  ["apps/api/src/modules/vouchers/routes.ts", 1550],
  ["apps/api/src/modules/tax/routes.ts", 1160],
  ["apps/api/src/modules/approval/store.ts", 1010],
  ["apps/web/src/lib/api-expense-control.ts", 860],
  ["tools/v4/workflow-runtime-db.integration.test.ts", 990],
]);

/** 不参与统计的目录。 */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage", ".vite"]);

/**
 * 豁免：**必须写明为什么这一坨不能拆**。
 *
 * 「太大了但还没空拆」不是理由——那种情况该进 FILE_LIMITS 钉住当前值，
 * 让它至少不再涨。
 */
const EXEMPT = new Map([
  [
    "packages/domain-model/src/index.ts",
    "领域类型的单一事实来源。前后端都从这一个入口引用，拆开会让每次加字段" +
      "都要同时改多个文件的导出，而它本身没有逻辑、只有类型声明"
  ],
]);

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
      continue;
    }
    if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

test("源码文件不得超过体量上限（拆开的文件不许长回去）", () => {
  const roots = ["apps/api/src", "apps/web/src", "packages", "tools"].map((p) =>
    join(repoRoot, p)
  );

  const offenders = [];
  for (const root of roots) {
    for (const file of collect(root)) {
      const rel = relative(repoRoot, file);
      if (EXEMPT.has(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n").length;
      const limit = FILE_LIMITS.get(rel) ?? DEFAULT_LIMIT;
      if (lines > limit) offenders.push(`${rel}：${lines} 行 > 上限 ${limit}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "以下文件超过体量上限。**先想能不能拆**——多半是它同时承担了两件事；" +
      "确实拆不动的话，把当前值加进 FILE_LIMITS 并写清理由，" +
      "让它至少不再继续涨：\n  " + offenders.join("\n  ")
  );
});

test("逐文件上限本身保持有效：不得为已经瘦下来的文件留着虚高的线", () => {
  // 一条永远够用的上限等于没有上限。文件瘦下来之后线要跟着降，
  // 否则下一次它长回旧尺寸时护栏还是绿的。
  const stale = [];
  for (const [rel, limit] of FILE_LIMITS) {
    const full = join(repoRoot, rel);
    let lines;
    try {
      lines = readFileSync(full, "utf8").split("\n").length;
    } catch {
      stale.push(`${rel}：文件已不存在，请从 FILE_LIMITS 里删掉`);
      continue;
    }
    // 留 30% 以上的空档说明这条线早就该往下调了。
    if (lines * 1.3 < limit) {
      stale.push(`${rel}：现在只有 ${lines} 行，上限 ${limit} 太松，请调到 ${Math.ceil(lines * 1.05)}`);
    }
  }

  assert.deepEqual(stale, [], stale.join("\n  "));
});
