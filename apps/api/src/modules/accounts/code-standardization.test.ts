import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT_CODE_MAPPINGS,
  CODE_BEARING_COLUMNS,
  isLegacyCode,
  LEGACY_CODES,
  RETIRED_CODES,
  STANDARD_CODES,
  toLegacyCode,
  toStandardCode
} from "./code-standardization.js";

test("映射表本身自洽：新旧编码各不重复、双向可还原", () => {
  const legacy = new Set(LEGACY_CODES);
  const standard = new Set(STANDARD_CODES);
  assert.equal(legacy.size, LEGACY_CODES.length, "旧编码不得重复");
  assert.equal(standard.size, STANDARD_CODES.length, "国标编码不得重复");

  for (const item of ACCOUNT_CODE_MAPPINGS) {
    assert.equal(toStandardCode(item.legacy), item.standard);
    assert.equal(toLegacyCode(item.standard), item.legacy);
  }
});

test("国标编码与旧编码之间不再有前缀关系——这是这次改动的目的", () => {
  // 6001c 与 6001 重叠、6301e 与 6301 重叠，正是要消灭的东西。
  // 改完之后任何一个国标编码都不该是另一个「留用编码」的前缀延伸。
  const retained = ["6001", "6051", "6111", "6115", "6301", "6801"];
  for (const standard of STANDARD_CODES) {
    for (const code of retained) {
      assert.ok(
        !standard.startsWith(code),
        `${standard} 仍以留用编码 ${code} 开头——前缀陷阱没有消除`
      );
    }
  }
});

test("不在映射表里的编码原样返回", () => {
  assert.equal(toStandardCode("1002"), "1002");
  assert.equal(toStandardCode("6001"), "6001", "主营业务收入本就合规，不动它");
  assert.equal(isLegacyCode("1002"), false);
  assert.equal(isLegacyCode("6001c"), true);
});

test("管理费用的明细科目跟着父级走", () => {
  assert.equal(toStandardCode("6301e"), "6602");
  for (let index = 1; index <= 7; index += 1) {
    const suffix = String(index).padStart(2, "0");
    assert.equal(
      toStandardCode(`6301e${suffix}`),
      `6602${suffix}`,
      "明细编码沿用「父级 + 两位序号」的既有约定，只是父级变了"
    );
  }
});

test("要改写的列清单覆盖全部已知的科目码承载处", () => {
  const tables = new Set(CODE_BEARING_COLUMNS.map((item) => item.table));
  // 这几张表各自在不同批次里引入，最容易在迁移时被漏掉
  for (const table of [
    "accounts",
    "ledger_entries",
    "voucher_lines",
    "voucher_draft_lines",
    "recurring_voucher_lines", // D1
    "bank_accounts", // C3
    "fixed_assets" // C1
  ]) {
    assert.ok(tables.has(table), `${table} 不在改写清单里，迁移会漏掉它`);
  }

  // 父级列与主编码列都要改：只改 code 不改 parent_code，科目树会断
  assert.ok(
    CODE_BEARING_COLUMNS.some((item) => item.table === "accounts" && item.column === "parent_code"),
    "只改 code 不改 parent_code，科目树的父子关系会断"
  );
});

/**
 * 仓库根。**不能用 `process.cwd()`** —— 单测由 `npm run -w @finance-taxation/api`
 * 驱动，cwd 是 `apps/api` 而不是仓库根，拼出来的路径会变成 `apps/api/apps/api/src`
 * 而 ENOENT（初版就是这么挂的）。从本文件位置往上找才与运行目录无关。
 */
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "apps/web/src"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("找不到仓库根：向上遍历到了文件系统顶层");
    dir = parent;
  }
  return dir;
}

/**
 * ## 护栏：源码里不得再出现旧编码
 *
 * 这条先于实施落地，刻意让它一开始就是红的——让「还剩多少处没改」变成一个
 * 随时可查的数字，而不是靠 grep 手工数。实施时它从 40 个文件逐步收敛到 0，
 * 现在转正，防的是将来有人从旧文档或旧分支里把旧编码抄回来。
 *
 * 与 `chart-parity.integration.test.ts` 同一个思路：把「靠人记得」换成
 * 「机器记得」。
 */
test("源码里不再出现旧编码字面量", () => {
  const repoRoot = findRepoRoot();
  const roots = [join(repoRoot, "apps/api/src"), join(repoRoot, "apps/web/src")];
  /** 映射表自身必须提旧编码，否则没法做映射。 */
  const allowlist = ["code-standardization.ts", "code-standardization.test.ts"];

  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (allowlist.includes(entry)) continue;

      const content = readFileSync(full, "utf8");
      // 用 RETIRED_CODES 而不是 LEGACY_CODES：`6401` 两头都在（财务费用的旧码
      // ＋主营业务成本的新码），按 LEGACY_CODES 判会把正确的新编码报成残留。
      const hits = RETIRED_CODES.filter((code) => content.includes(`"${code}"`));
      if (hits.length > 0) {
        offenders.push(`${full.replace(repoRoot + "/", "")} → ${hits.join("、")}`);
        continue;
      }

      // 带引号的字面量之外，**注释与 UI 文案里的旧编码同样有害**：
      // 前端曾有一句「管理用设备填 6301e02」，照着填会填到一个已不存在的科目；
      // 几处注释写着「财务费用 6401」，而 D3 之后 6401 是主营业务成本。
      // 这些都躲过了上面那条带引号的匹配。
      //
      // 只对**含字母的自造编码**（6001c / 6301e*）做裸匹配：3131、6101 这类纯
      // 数字会撞上金额、行号、ID，误报比漏报更消耗人。
      //
      // 讲历史是允许的——D3 干了什么本来就该记下来——但必须在同一文件里标明
      // 「D3」，否则读的人分不清那是史料还是现状。
      const lettered = RETIRED_CODES.filter((code) => /[a-z]/.test(code));
      const bare = lettered.filter((code) => content.includes(code));
      if (bare.length > 0 && !content.includes("D3")) {
        offenders.push(
          `${full.replace(repoRoot + "/", "")} → ${bare.join("、")}（未标明 D3，` +
            `无法分辨这是历史叙述还是漏改的现状描述）`
        );
      }
    }
  };
  roots.forEach(walk);

  assert.deepEqual(
    offenders,
    [],
    `这些文件仍在用旧编码：\n${offenders.join("\n")}`
  );
});
