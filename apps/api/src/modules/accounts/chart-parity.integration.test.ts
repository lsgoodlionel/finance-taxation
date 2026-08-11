/**
 * 硬编码科目表与落库科目模板的一致性护栏（V12 残留 7）。
 *
 * ## 为什么需要它
 *
 * 049 把科目表落了库（`account_templates` + `accounts`），但
 * `chart-of-accounts.ts` 这份 TS 常量并没有退休——报表侧的
 * `profit-accounts.ts` / `balance-sheet-accounts.ts` 至今仍从它取
 * `category` 来判断一个科目进利润表还是资产负债表。于是同一件事有两个
 * 事实来源，而它们**必须手工保持同步**。
 *
 * 这不是假设的风险，已经咬过一次：V12-C1 新增「6115 资产处置损益」时，
 * 如果只加进迁移而忘了加进这张常量表，6115 会走
 * `classifyProfitAccount` 的兜底——「6 开头且不是收入 → 一律计费用」——
 * 于是一笔处置**收益**被算成费用，利润表的「资产处置收益」永远是 0。
 *
 * ## 这个测试守什么、不守什么
 *
 * 守的是**报表分类真正依赖的那几个字段**：科目集合、`category`、`direction`。
 * 名称不比对——迁移里的名称常带「应交税费-」这类前缀限定，与常量表的
 * 展示名有合理差异，逐字比对只会制造噪音。
 *
 * 它不能替代真正的收敛（让报表侧直接读 `accounts` 表）。那是一次触及
 * 报表核心口径的重构，`classifyProfitAccount` / `classifyBalanceSheetAccount`
 * 是同步纯函数，改成读库要么变异步、要么把科目表作为参数贯穿十余个调用点，
 * 应当独立立项。在那之前，这个测试把「靠人记得同步」换成「机器记得」。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

interface TemplateRow {
  code: string;
  name: string;
  category: string;
  direction: string;
}

test("硬编码科目表与落库模板在报表分类字段上一致", async (t) => {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  await resetTestDatabase(databaseUrl);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { CHART_OF_ACCOUNTS } = await import("./chart-of-accounts.js");
  const rows = (
    await pool.query<TemplateRow>(
      `select code, name, category, direction from account_templates
       where template_key = 'default' order by code`
    )
  ).rows;

  const hardcoded = new Map(CHART_OF_ACCOUNTS.map((account) => [account.code, account]));
  const templates = new Map(rows.map((row) => [row.code, row]));

  await t.test("科目集合一致：任一侧新增科目都必须同步另一侧", () => {
    const onlyInTemplates = [...templates.keys()].filter((code) => !hardcoded.has(code));
    const onlyInHardcoded = [...hardcoded.keys()].filter((code) => !templates.has(code));

    assert.deepEqual(
      onlyInTemplates,
      [],
      `这些科目只在迁移里加了、没加进 chart-of-accounts.ts：${onlyInTemplates.join("、")}。` +
        `报表侧读的是那张常量表，缺了会走兜底分类——6 开头的会被一律当成费用。`
    );
    assert.deepEqual(
      onlyInHardcoded,
      [],
      `这些科目只在 chart-of-accounts.ts 里、没有对应的迁移：${onlyInHardcoded.join("、")}。` +
        `用户的科目表来自数据库，常量表里多出来的科目在界面上根本选不到。`
    );
  });

  await t.test("category 一致：它决定科目进利润表还是资产负债表", () => {
    const mismatched = [...templates.entries()]
      .filter(([code, row]) => hardcoded.has(code) && hardcoded.get(code)!.category !== row.category)
      .map(([code, row]) => `${code}：模板=${row.category}，常量表=${hardcoded.get(code)!.category}`);

    assert.deepEqual(mismatched, [], `category 不一致会让同一科目在两份报表里各归各的：\n${mismatched.join("\n")}`);
  });

  await t.test("direction 一致：它决定余额的正常方向", () => {
    const mismatched = [...templates.entries()]
      .filter(([code, row]) => hardcoded.has(code) && hardcoded.get(code)!.direction !== row.direction)
      .map(([code, row]) => `${code}：模板=${row.direction}，常量表=${hardcoded.get(code)!.direction}`);

    assert.deepEqual(mismatched, [], `direction 不一致：\n${mismatched.join("\n")}`);
  });
});
