import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 「总账只有一个入口」的防回退断言（V12-A3）。
 *
 * 此前 `insert into ledger_entries` 出现在两处：`postVoucher()` 和 `closePeriod()`。
 * 后者直接写 posted 凭证并直接插分录，绕过了借贷平衡校验、状态机、**以及期间锁**
 * ——可以对一个已锁账的期间做结转。
 *
 * 约束散在两处的后果不是「少一道校验」，而是「没人知道到底有几道」。这条断言让
 * 下一次绕过在评审前就红掉，而不是等下一轮审计。
 */

const MODULES_DIR = join(import.meta.dirname, "..");

/** 允许直接 insert 总账的文件：只有写入口自己。 */
const LEDGER_WRITER = join(MODULES_DIR, "vouchers", "ledger-writer.ts");

function* walkTypeScript(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      yield* walkTypeScript(path);
      continue;
    }
    if (!name.endsWith(".ts") || name.includes(".test.")) continue;
    yield path;
  }
}

test("ledger_entries is only ever inserted through the single writer", () => {
  const offenders: string[] = [];
  for (const file of walkTypeScript(MODULES_DIR)) {
    if (file === LEDGER_WRITER) continue;
    const source = readFileSync(file, "utf8");
    // 只看 SQL 语句本身，注释里提到表名是允许的
    for (const line of source.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
      if (/insert\s+into\s+ledger_entries/i.test(trimmed)) {
        offenders.push(file.replace(MODULES_DIR, "modules"));
        break;
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `以下文件绕过 ledger-writer 直接写总账 —— 这样借贷平衡、期间锁等闸门就不再统一：\n${offenders.join("\n")}`
  );
});

test("the writer module itself still contains the one insert", () => {
  // 防止上面那条断言因为写入口被重命名/挪走而退化成恒真
  const source = readFileSync(LEDGER_WRITER, "utf8");
  const inserts = source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) return false;
      return /insert\s+into\s+ledger_entries/i.test(trimmed);
    });
  assert.equal(inserts.length, 1, "写入口应当恰好有一条总账插入语句");
});
