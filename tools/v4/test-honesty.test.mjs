/**
 * **测试诚实性护栏**（P0-1）。
 *
 * ## 来自一次真实的教训
 *
 * 一个月回顾里记着：研发页那个测试文件**在文件内重新实现了一遍被测逻辑**，
 * 测的是自己的副本，还把错误的税率当规范钉住了。那种测试永远是绿的，
 * 而且绿得理直气壮——它证明的是「我的副本和我的副本一致」。
 *
 * 这条检查拦两类：
 *
 * 1. **测试里复刻了被测模块的常量**——同一个税率/科目编码/阈值在
 *    源文件和测试里各写一遍，改了源文件测试照样绿
 * 2. **测试文件里定义了与被测函数同名的函数**——那就是重新实现
 *
 * ## 判定范围：整个源码树的导出函数，不只是同名文件
 *
 * 第一版只比对 `foo.test.ts` ↔ `foo.ts`。那个口径太窄：
 * `page-guides.test.mjs` 对应的 `page-guides.ts` 只是再导出层，真实现在
 * `guides/index.ts`——在测试里重新实现 `findPageGuide` 完全检不出来。
 * **一条检不出东西的护栏比没有护栏更糟**，它让人以为这类问题已经被管住了。
 *
 * 现在收集整个源码树的导出函数名，测试里定义同名函数就报。
 *
 * ## 判定必然不完美，所以给白名单
 *
 * 静态比对做不到语义级判断。误报的登记进白名单**并说明为什么**——
 * 有些同名是巧合（`format`、`parse` 这类通用名），有些复刻是正当的
 * （测试需要一个故意不同的实现来对照）。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const roots = [join(repoRoot, "apps/api/src"), join(repoRoot, "apps/web/src")];

/**
 * 允许在测试里重定义同名函数的情况，**每条要说明为什么**。
 *
 * 正当理由只有一种：测试需要一个**故意不同**的实现来对照
 * （比如「用错误的算法算一遍，证明两者结果不同」）。
 * 「图方便」不是理由——那正是这条检查要拦的东西。
 */
const ALLOWED_REDEFINITIONS = new Map([
  // ── 路由包装：函数体里 import 真实 route handler 再调用，只是名字撞了 ──
  //
  // 这类是**正当的**：集成测试要把 handler 包一层才能传 mock 的 req/res，
  // 而包装函数取一个与业务动作同名的名字最好读。判定它们的标志是
  // 函数体里有 `await import(...)`。
  [
    "apps/api/src/modules/assets/fixed-assets.integration.test.ts::previewDepreciation",
    "路由包装：内部 import previewDepreciationRoute 调真实实现，与 lib/api.ts 的同名函数无关"
  ],
  [
    "apps/api/src/modules/cost-center/cost-center.integration.test.ts::createCostCenter",
    "路由包装：内部 import createCostCenterRoute 调真实实现"
  ],
  [
    "apps/api/src/modules/reports/account-category-source.integration.test.ts::getProfitStatement",
    "路由包装：内部 import 同名 route 并重命名为 route 后调用"
  ],
  [
    "apps/api/src/modules/settlement/settlement.integration.test.ts::getAging",
    "路由包装：内部 import getAgingRoute 调真实实现"
  ]
]);

/**
 * 同名但几乎必然是巧合的函数名。
 *
 * 这些词在任何代码库里都会被用到，报出来只是噪音。
 * **名单只收「通用到无法承载业务含义」的词**——`calculateTax` 这种
 * 一看就知道在算什么的不能进来。
 */
const GENERIC_NAMES = new Set([
  "assert",
  "format",
  "parse",
  "render",
  "setup",
  "teardown",
  "noop",
  "wait",
  "sleep",
  "main"
]);

/** 遍历源码文件（含非测试）。 */
function walkAll(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...walkAll(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.test\.(ts|tsx|mjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** 从源码里抽出导出的函数名。 */
function exportedFunctions(source) {
  return new Set(
    [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  );
}

/** 测试文件里自己定义的函数名。 */
function localFunctions(source) {
  return new Set(
    [...source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
  );
}

/** 收集整个源码树里导出的函数名 → 它定义在哪个文件。 */
const exportedEverywhere = new Map();
for (const root of roots) {
  for (const file of walkAll(root)) {
    if (/\.test\./.test(file)) continue;
    for (const name of exportedFunctions(readFileSync(file, "utf8"))) {
      if (!exportedEverywhere.has(name)) exportedEverywhere.set(name, relative(repoRoot, file));
    }
  }
}

const violations = [];

for (const root of roots) {
  for (const testFile of walk(root)) {
    const testSource = readFileSync(testFile, "utf8");
    for (const name of localFunctions(testSource)) {
      const definedIn = exportedEverywhere.get(name);
      if (definedIn === undefined) continue;
      if (GENERIC_NAMES.has(name)) continue;
      const key = `${relative(repoRoot, testFile)}::${name}`;
      if (ALLOWED_REDEFINITIONS.has(key)) continue;
      violations.push(
        `${relative(repoRoot, testFile)} 里定义了 ${name}()，` +
          `而它是 ${definedIn} 导出的实现`
      );
    }
  }
}

assert(
  violations.length === 0,
  "测试重新实现了被测逻辑：\n  " +
    violations.join("\n  ") +
    "\n\n那种测试永远是绿的——它证明的是「我的副本和我的副本一致」。" +
    "\n改成 import 真实实现；确有正当理由的登记到 ALLOWED_REDEFINITIONS 并写明为什么。"
);

// 白名单不能有过期条目：文件删了或函数改名了却留着登记，读起来还像回事。
for (const key of []) {
  const [relPath, name] = key.split("::");
  const full = join(repoRoot, relPath);
  let source;
  try {
    source = readFileSync(full, "utf8");
  } catch {
    assert(false, `ALLOWED_REDEFINITIONS 里的 ${relPath} 已不存在，请删除登记`);
  }
  assert(
    new RegExp(`function\\s+${name}\\b`).test(source),
    `${relPath} 里已经没有 ${name}() 了，请从 ALLOWED_REDEFINITIONS 删除`
  );
}

console.log(`test-honesty passed（扫描 ${roots.length} 个源码根，无重复实现）`);
