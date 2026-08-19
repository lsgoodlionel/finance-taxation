/**
 * 生产成本结转的路径级断言（V14-C）。
 *
 * 约当产量的分配与凭证方向已由单测钉住。这里测只有连库才成立的：
 *
 * - **平衡护栏**（蓝图护栏 3）：凭证借贷相等，且完工 + 在产 ≡ 期初 + 归集
 * - 期初在产品真的从上期结果自动接上
 * - 结转真的只能做一次
 * - 已结账的期间真的生成不了凭证
 * - 凭证真的是 draft
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("生产成本归集与完工结转", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { listRuns, getRun, carryOver, upsertRun, resolveOpeningWip, previewAllocation } =
    await import("./store.js");

  const runs = await listRuns(COMPANY_ID);
  // 种子里有三条。取不到就说明种子没播——**不 return 跳过**：
  // 「取不到就跳过」会让整组用例静默通过，V13-B4 栽过一次。
  assert.equal(runs.length, 3, "种子里应当有三条生产批次");

  const march = runs.find((r) => r.period === "2026-03" && r.productCode === "SRV-2U-A")!;
  const aprilTwoU = runs.find((r) => r.period === "2026-04" && r.productCode === "SRV-2U-A")!;
  const aprilOneU = runs.find((r) => r.period === "2026-04" && r.productCode === "SRV-1U-B")!;

  await t.test("预演与实际结转走同一个纯函数，数字必然一致", async () => {
    const preview = previewAllocation(march);
    assert.equal(preview.ok, true);
    if (!preview.ok) return;

    // 材料 296000 元，约当 120 + 40×100% = 160 台，完工分走 120/160 = 75%
    const material = preview.value.elements.find((e) => e.element === "material")!;
    assert.equal(material.finishedCents, 222_000_00);
    assert.equal(material.endingWipCents, 74_000_00);

    // 人工 6912 元，约当 120 + 40×60% = 144 台，完工分走 120/144
    const labor = preview.value.elements.find((e) => e.element === "labor")!;
    assert.equal(labor.finishedCents, 5_760_00);

    // 护栏 3
    assert.equal(
      preview.value.totalFinishedCents + preview.value.totalEndingWipCents,
      preview.value.totalInputCents
    );
  });

  let marchFinishedCents = 0;
  let marchWipCents = 0;

  await t.test("结转生成 draft 凭证，借贷相等", async () => {
    const result = await carryOver(COMPANY_ID, march.id, "2026-03-31");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    marchFinishedCents = result.value.totalFinishedCents;
    marchWipCents = result.value.totalEndingWipCents;

    const voucher = await pool.query<{ status: string; period: string; voucher_type: string }>(
      "select status, period, voucher_type from vouchers where id=$1",
      [result.value.voucherId]
    );
    // **系统生成的凭证一律 draft**，延续折旧、红冲、增值税结转、期末调汇、
    // 借款付款、报销落账、合同付款的一贯做法。
    assert.equal(voucher.rows[0]!.status, "draft");
    assert.equal(voucher.rows[0]!.period, "2026-03");

    const lines = await pool.query<{ debit: string; credit: string; account_code: string }>(
      "select debit, credit, account_code from voucher_lines where voucher_id=$1 order by sort_order",
      [result.value.voucherId]
    );
    const debit = lines.rows.reduce((sum, row) => sum + Math.round(Number(row.debit) * 100), 0);
    const credit = lines.rows.reduce((sum, row) => sum + Math.round(Number(row.credit) * 100), 0);

    assert.equal(debit, credit, "凭证借贷不平");
    assert.equal(debit, marchFinishedCents, "凭证金额应当等于完工成本");

    // 借库存商品、贷生产成本——方向反了会让生产成本越结越大。
    assert.equal(lines.rows[0]!.account_code, "1403");
    assert.ok(lines.rows.slice(1).every((row) => row.account_code === "4001"));
  });

  await t.test("平衡护栏：完工 + 期末在产 ≡ 期初 + 本期归集", async () => {
    const after = await getRun(COMPANY_ID, march.id);
    assert.ok(after);

    const input = after!.costs.reduce(
      (sum, cost) => sum + cost.openingWipCents + cost.incurredCents,
      0
    );
    const finished = after!.costs.reduce((sum, cost) => sum + (cost.finishedCents ?? 0), 0);
    const wip = after!.costs.reduce((sum, cost) => sum + (cost.endingWipCents ?? 0), 0);

    // 差一分就是借贷不平、凭证过不了账。
    assert.equal(finished + wip, input);
    assert.equal(finished, marchFinishedCents);
    assert.equal(wip, marchWipCents);
  });

  await t.test("同一批次结转两次被拒", async () => {
    // 重复结转在账上表现为库存商品凭空多出一批，而多出来的那批没有实物。
    const again = await carryOver(COMPANY_ID, march.id, "2026-03-31");
    assert.equal(again.ok, false);
    assert.equal(again.ok === false && again.failure.code, "RUN_ALREADY_CARRIED_OVER");
  });

  await t.test("已结转的批次改不了产量", async () => {
    // 凭证已经按旧数做了，改产量会让账与数据对不上。
    const result = await upsertRun({
      companyId: COMPANY_ID,
      id: march.id,
      productId: march.productId,
      period: march.period,
      finishedQuantity: 999,
      endingWipQuantity: 0,
      note: null,
      costs: [{ element: "material", incurredCents: 100, wipCompletionBp: 10000 }]
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure.code, "RUN_INVALID_TRANSITION");
  });

  await t.test("期初在产品自动从上期取，用户不用去翻上个月", async () => {
    const opening = await resolveOpeningWip(COMPANY_ID, march.productId, "2026-04");
    assert.equal(opening.get("material"), 74_000_00, "3 月留下的材料在产品没接上");
    assert.ok((opening.get("labor") ?? 0) > 0);

    // 重新保存 4 月批次，期初在产品应当被写进去。
    const saved = await upsertRun({
      companyId: COMPANY_ID,
      id: aprilTwoU.id,
      productId: aprilTwoU.productId,
      period: aprilTwoU.period,
      finishedQuantity: aprilTwoU.finishedQuantity,
      endingWipQuantity: aprilTwoU.endingWipQuantity,
      note: aprilTwoU.note,
      costs: aprilTwoU.costs.map((cost) => ({
        element: cost.element,
        incurredCents: cost.incurredCents,
        wipCompletionBp: cost.wipCompletionBp
      }))
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;

    const material = saved.value.costs.find((c) => c.element === "material")!;
    assert.equal(material.openingWipCents, 74_000_00);
  });

  await t.test("不重新保存也能接上期初——期初是读取时算的", async () => {
    // **这是一个真 bug 的回归用例。**
    //
    // 原实现用的是保存时存下的期初。用户在上期结转之前就把本期批次录好
    // 是很正常的顺序，那时上期还没有期末数，存下来的是 0——照那个 0 分配，
    // 上期留下的在产品成本会被静默丢掉，永远卡在生产成本上。
    const other = await getRun(COMPANY_ID, aprilOneU.id);
    assert.ok(other);

    // 直接读一条从没重新保存过的 4 月批次（1U 机型没有上期，期初该是 0）。
    assert.equal(
      other!.costs.every((cost) => cost.openingWipCents === 0),
      true,
      "第一次投产的产品期初该是零"
    );

    // 而 2U 机型有 3 月的期末——即便库里存的是 0，读出来也该是实时值。
    await pool.query(
      "update production_run_costs set opening_wip_cents = 0 where run_id = $1",
      [aprilTwoU.id]
    );
    const twoU = await getRun(COMPANY_ID, aprilTwoU.id);
    const material = twoU!.costs.find((c) => c.element === "material")!;
    assert.equal(material.openingWipCents, 74_000_00, "库里被清零了也该读出实时值");
  });

  await t.test("接上期初在产品后，4 月的平衡照样成立", async () => {
    const result = await carryOver(COMPANY_ID, aprilTwoU.id, "2026-04-30");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const after = await getRun(COMPANY_ID, aprilTwoU.id);
    const input = after!.costs.reduce(
      (sum, cost) => sum + cost.openingWipCents + cost.incurredCents,
      0
    );
    const finished = after!.costs.reduce((sum, cost) => sum + (cost.finishedCents ?? 0), 0);
    const wip = after!.costs.reduce((sum, cost) => sum + (cost.endingWipCents ?? 0), 0);
    assert.equal(finished + wip, input);

    // 3 月的期末在产品全额进了 4 月的分配盘子——**没有一分钱漏在中间**。
    //
    // 本期归集从批次自身读出来算，不写死一个数：写死的那个数我第一次
    // 就加错了，而错的合计会把这条断言变成「测我自己的算术」。
    const aprilIncurred = after!.costs.reduce((sum, cost) => sum + cost.incurredCents, 0);
    assert.equal(input, marchWipCents + aprilIncurred);
    assert.ok(marchWipCents > 0, "3 月应当留下在产品，否则这条断言测不到衔接");
  });

  await t.test("已结转的批次期初被冻结，不再随上期变动", async () => {
    // 凭证是按它做的。再往前追溯会让「完工 + 在产 = 期初 + 归集」
    // 这条平衡在事后复核时算不平。
    const after = await getRun(COMPANY_ID, aprilTwoU.id);
    assert.equal(after!.status, "carried_over");
    const material = after!.costs.find((c) => c.element === "material")!;
    assert.equal(material.openingWipCents, 74_000_00);

    // 把 3 月的期末改掉，已结转的 4 月不该跟着变。
    await pool.query(
      "update production_run_costs set ending_wip_cents = 1 where run_id = $1 and element = 'material'",
      [march.id]
    );
    const again = await getRun(COMPANY_ID, aprilTwoU.id);
    assert.equal(
      again!.costs.find((c) => c.element === "material")!.openingWipCents,
      74_000_00,
      "已结转的期初跟着上期变了"
    );

    // 改回去，不影响后面的用例。
    await pool.query(
      "update production_run_costs set ending_wip_cents = 7400000 where run_id = $1 and element = 'material'",
      [march.id]
    );
  });

  await t.test("没有在产品时全额结转，一分不留", async () => {
    const result = await carryOver(COMPANY_ID, aprilOneU.id, "2026-04-30");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const after = await getRun(COMPANY_ID, aprilOneU.id);
    const input = after!.costs.reduce((sum, cost) => sum + cost.incurredCents, 0);
    assert.equal(result.value.totalFinishedCents, input);
    assert.equal(result.value.totalEndingWipCents, 0);
  });

  await t.test("已结账的期间生成不了凭证", async () => {
    await pool.query(
      `insert into accounting_periods (id, company_id, period, is_locked)
       values ('ap-cost-lock', $1, '2026-05', true)
       on conflict (company_id, period) do update set is_locked = true`,
      [COMPANY_ID]
    );

    const created = await upsertRun({
      companyId: COMPANY_ID,
      id: null,
      productId: aprilOneU.productId,
      period: "2026-05",
      finishedQuantity: 10,
      endingWipQuantity: 0,
      note: null,
      costs: [{ element: "material", incurredCents: 100_00, wipCompletionBp: 10000 }]
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const blocked = await carryOver(COMPANY_ID, created.value.id, "2026-05-31");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.ok === false && blocked.failure.code, "PERIOD_LOCKED");
  });

  await t.test("同一产品同一期间不能有两条未作废的批次", async () => {
    // 两条会让同一批成本被结转两次。
    await assert.rejects(() =>
      pool.query(
        `insert into production_runs (id, company_id, product_id, period)
         values ('prn-dup', $1, $2, '2026-04')`,
        [COMPANY_ID, aprilOneU.productId]
      )
    );
  });

  await t.test("跨租户读不到别家的批次", async () => {
    const items = await listRuns("cmp-does-not-exist");
    assert.equal(items.length, 0);
    assert.equal(await getRun("cmp-does-not-exist", march.id), null);
  });
});
