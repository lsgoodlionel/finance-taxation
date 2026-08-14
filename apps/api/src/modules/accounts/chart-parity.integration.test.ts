/**
 * 硬编码科目表与落库科目模板的一致性护栏（V12 残留 7）。
 *
 * ## 为什么需要它
 *
 * 049 把科目表落了库（`account_templates` + `accounts`），但
 * `chart-of-accounts.ts` 这份 TS 常量并没有退休。
 *
 * **报表侧已经收敛到库**（残留 7 已处理）：分录经 `listCompanyLedgerEntries`
 * 取出时随行带上 `accountCategory`，`classifyProfitAccount` /
 * `classifyBalanceSheetAccount` 优先采信它。常量表降级为兜底——服务那些只拿得到
 * 科目码的调用点（结转损益、风控引擎）与纯函数单测。
 *
 * 但兜底路径仍在生产里跑，两份数据漂移仍会出错，所以这个护栏继续有效。
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
 * ## 与 account-category-source.integration.test.ts 的分工
 *
 * 这条只能证明两份数据**一致**，证明不了报表实际读的是哪一份——两份一致时，
 * 读哪份都得到同样的报表。那件事由 `account-category-source.integration.test.ts`
 * 负责：它故意改库里某个科目的 `category`，看报表跟不跟着变。
 *
 * 两条都要有。这条防漂移，那条防「悄悄退回读常量」。
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
