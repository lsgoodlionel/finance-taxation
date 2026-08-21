/**
 * **模块测试覆盖护栏**（P0-1）。
 *
 * ## 为什么需要
 *
 * 一个月回顾里「14 个零测试模块」是人工数出来的。P0 把它们补完之后，
 * 需要一条机制保证**新模块不会又变成零测试**——否则下一次回顾还会数出一批。
 *
 * ## 判定：模块里的路由被哪些测试引用了
 *
 * 不按「目录里有没有 .test.ts」数——那个口径会误判：六个小模块的测试写在
 * `modules/misc-modules.integration.test.ts` 里（合并一份省掉六份重复骨架），
 * 按目录数它们仍是零。**用错的口径统计，比不统计更误导下一个人。**
 *
 * 判定分两条，满足其一即算覆盖：
 *
 * 1. **测试文件就在这个模块目录里**——它用相对路径 `./routes.js` 引用实现，
 *    路径里根本不出现模块名，按模块名去搜必然搜不到
 * 2. **别处的测试用带模块名的路径引用了它**（如合并写的
 *    `misc-modules.integration.test.ts` 里的 `./knowledge/routes.js`）
 *
 * 第一条是第一版漏掉的：只按模块名搜，结果 30 多个有测试的模块全被报成没覆盖。
 * **判定错的护栏会淹没真问题**——一次报 30 条，没人会去看。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modulesRoot = join(repoRoot, "apps/api/src/modules");
const apiRoot = join(repoRoot, "apps/api/src");

/**
 * 允许没有测试的模块，**每条要说明为什么**。
 *
 * 唯一正当的理由是「这个目录里没有可测的行为」——比如纯类型定义、
 * 纯再导出。「还没来得及写」不是理由：那种情况应当直接写，
 * P0 已经把 12 个补完了，再欠新的说不过去。
 */
const ALLOWED_WITHOUT_TESTS = new Map([
  [
    "auth",
    "16 行的再导出层：真实实现在 middleware/auth.ts，那里有自己的测试。" +
      "这个目录里没有可测的行为。"
  ]
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const testFiles = walk(apiRoot).filter((file) => /\.test\.(ts|tsx|mjs)$/.test(file));

/** 模块目录 → 它自己目录里有没有测试文件。 */
const hasOwnTest = new Set(
  testFiles
    .filter((file) => file.startsWith(modulesRoot))
    .map((file) => file.slice(modulesRoot.length + 1).split("/")[0])
    .filter((segment) => segment !== undefined && !segment.includes("."))
);

/** 别处的测试里出现的带模块名的引用。 */
const crossReferences = testFiles.map((file) => readFileSync(file, "utf8")).join("\n");

const uncovered = [];

for (const name of readdirSync(modulesRoot)) {
  const full = join(modulesRoot, name);
  if (!statSync(full).isDirectory()) continue;
  if (ALLOWED_WITHOUT_TESTS.has(name)) continue;

  const sources = readdirSync(full).filter(
    (file) => /\.ts$/.test(file) && !/\.test\./.test(file)
  );
  if (sources.length === 0) continue;

  if (hasOwnTest.has(name)) continue;

  const referenced = sources.some(
    (file) =>
      crossReferences.includes(`${name}/${file.replace(/\.ts$/, ".js")}`) ||
      crossReferences.includes(`${name}/${file}`)
  );
  if (!referenced) uncovered.push(name);
}

assert(
  uncovered.length === 0,
  `这些模块没有任何测试引用它们的实现：\n  ${uncovered.join("\n  ")}\n\n` +
    "P0 已经把此前 12 个零测试模块补完，新增的不该再欠。\n" +
    "写路由级测试（成功 + 越权被拒 + 前置校验被拒），" +
    "或登记到 ALLOWED_WITHOUT_TESTS 并说明这个目录为什么没有可测的行为。"
);

// 白名单不能有过期条目。
for (const name of ALLOWED_WITHOUT_TESTS.keys()) {
  assert(
    readdirSync(modulesRoot).includes(name),
    `ALLOWED_WITHOUT_TESTS 里的 ${name} 模块已不存在，请删除登记`
  );
}

console.log(
  `module-coverage passed（${readdirSync(modulesRoot).length} 个模块，` +
    `${ALLOWED_WITHOUT_TESTS.size} 个登记免测）`
);
