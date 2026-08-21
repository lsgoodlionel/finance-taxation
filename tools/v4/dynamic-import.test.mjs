/**
 * **动态 import 符号存在性护栏**（V15/P3）。
 *
 * ## 为什么需要
 *
 * P3 拆 `vouchers/routes.ts` 时，`tsc --noEmit` 干净、1025 条单测全过，
 * 集成测试却挂了 11 条：`TypeError: createVoucherFromTemplate is not a function`。
 *
 * 原因是集成测试用 `const { x } = await import("./routes.js")` 取实现——
 * **TypeScript 不校验动态 import 的解构**，函数搬走之后那里静默变成 undefined。
 * 于是「类型检查通过」给了一个它给不起的保证。
 *
 * 这个仓库里有 40 多处这种写法（集成测试要在 `process.env.DATABASE_URL`
 * 设好之后才能加载模块，只能动态 import），所以不是个例，而是一整类。
 *
 * ## 判定
 *
 * 解析每一处 `const { a, b } = await import("...")`，打开目标文件，
 * 确认这些名字真的被导出。目标是外部包（不以 `.` 开头）时跳过——
 * 那是依赖，不归这条护栏管。
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage"]);

function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** 目标文件导出了这个名字吗。`export *` 视为可能导出，不误报。 */
function exportsName(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^export \\*`, "m").test(source)) return true;
  if (new RegExp(`^export (?:async function|function|const|let|interface|type|class) ${escaped}\\b`, "m").test(source)) {
    return true;
  }
  // `export { a, b }` / `export { a } from "..."`
  for (const match of source.matchAll(/^export \{([^}]*)\}/gm)) {
    const names = match[1].split(",").map((part) => part.split(" as ").pop().trim());
    if (names.includes(name)) return true;
  }
  return false;
}

test("动态 import 解构的符号必须真的存在（tsc 不查这个）", () => {
  const files = [
    ...collect(join(repoRoot, "apps/api/src")),
    ...collect(join(repoRoot, "apps/web/src")),
    ...collect(join(repoRoot, "tools"))
  ];

  const broken = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/const \{([^}]*)\} = await import\("([^"]+)"\)/gs)) {
      const target = match[2];
      if (!target.startsWith(".")) continue; // 外部依赖不归这条护栏管

      // `./foo.js` → `./foo.ts`；无扩展名的 `./foo` 可能是 `foo.ts`，
      // 也可能是 `foo/index.ts`——`lib/api.ts` 与 `lib/api/` 同时存在就是这种情形
      // （门面文件 + 同名领域目录），文件优先，与打包器的解析顺序一致。
      const base = target.replace(/\.js$/, "");
      const candidates = [
        normalize(join(dirname(file), `${base}.ts`)),
        normalize(join(dirname(file), `${base}.tsx`)),
        normalize(join(dirname(file), base, "index.ts"))
      ];
      const resolved = candidates.find((path) => existsSync(path) && statSync(path).isFile());
      if (!resolved) {
        broken.push(`${file.slice(repoRoot.length + 1)} → ${target}：目标文件不存在`);
        continue;
      }

      const targetSource = readFileSync(resolved, "utf8");
      for (const raw of match[1].split(",")) {
        const name = raw.split(":")[0].trim();
        if (!name) continue;
        if (!exportsName(targetSource, name)) {
          broken.push(`${file.slice(repoRoot.length + 1)} → ${target}：没有导出 ${name}`);
        }
      }
    }
  }

  assert.deepEqual(
    broken,
    [],
    "以下动态 import 会在运行时拿到 undefined。**tsc 不会报**——" +
      "拆分模块时最容易在这里出事：\n  " + broken.join("\n  ")
  );
});
