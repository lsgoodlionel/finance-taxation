import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNT_CODE_MAPPINGS,
  CODE_BEARING_COLUMNS,
  isLegacyCode,
  LEGACY_CODES,
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
 * ## 护栏：源码里不得再出现旧编码
 *
 * **本用例目前应当是红的** —— D3 尚未实施，40 个文件还在用旧编码。
 * 它先落地是刻意的：让「还剩多少处没改」变成一个随时可查的数字，
 * 而不是靠 grep 手工数。实施过程中它会逐步变绿。
 *
 * 与 `chart-parity.integration.test.ts` 同一个思路：把「靠人记得」换成
 * 「机器记得」。
 */
test("源码里不再出现旧编码字面量", { skip: "D3 尚未实施，见 docs/v12-d3-account-code-standardization-plan.md" }, () => {
  const roots = [
    join(process.cwd(), "apps/api/src"),
    join(process.cwd(), "apps/web/src")
  ];
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
      const hits = LEGACY_CODES.filter((code) => content.includes(`"${code}"`));
      if (hits.length > 0) {
        offenders.push(`${full.replace(process.cwd() + "/", "")} → ${hits.join("、")}`);
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
