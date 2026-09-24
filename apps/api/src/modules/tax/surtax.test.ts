import assert from "node:assert/strict";
import test from "node:test";
import { calculateSurtax } from "./surtax.js";

/**
 * 附加税计算（V17 阶段三批次 B）。
 *
 * ## 缺陷
 *
 * `stamp-surtax.ts` 全文 21 行，做的事是把税种名含「附加」的税项**筛出来展示**：
 *
 * ```ts
 * const surtaxItems = scoped.filter((item) => item.taxType.includes("附加"));
 * ```
 *
 * 一分钱都不算。这些税项要靠人手工建——没人建，页面就永远是空的。
 * 科目、凭证模板、种子里那句「城建税7%+教育附加3%+地方教育附加2%=12%」
 * 的说明都有，**唯独没有计算**。
 *
 * ## 计税依据是「实际缴纳」的增值税，不是「应纳」
 *
 * 两者在有留抵、有减免、分期缴纳时都不相等。系统里此前没有
 * 「这笔增值税实际交了多少」这个事实——申报状态机只到 submitted，
 * 不含已缴纳，也不存金额。批次 B 先把这个事实补上。
 *
 * 政策依据见 `docs/v17-tax-rate-policy/POLICY-MAP-CIT-SURTAX.md` 第 2.5 节。
 */

test("市区 7% + 教育费附加 3% + 地方教育附加 2% = 12%", () => {
  const result = calculateSurtax({
    paidVatCents: 1_000_00, // 实缴增值税 1000 元
    zone: "city",
    halvedReduction: false
  });

  assert.equal(result.kind, "calculated");
  assert.equal(result.urbanConstructionCents, 70_00, "城建税 1000 × 7% = 70");
  assert.equal(result.educationSurchargeCents, 30_00, "教育费附加 1000 × 3% = 30");
  assert.equal(result.localEducationSurchargeCents, 20_00, "地方教育附加 1000 × 2% = 20");
  assert.equal(result.totalCents, 120_00, "合计 120 元，即计税依据的 12%");
});

test("县城、镇按 5%，其他地区按 1%", () => {
  const county = calculateSurtax({
    paidVatCents: 1_000_00,
    zone: "county",
    halvedReduction: false
  });
  assert.equal(county.urbanConstructionCents, 50_00, "县城、镇 5%");
  assert.equal(county.totalCents, 100_00, "5% + 3% + 2% = 10%");

  const other = calculateSurtax({
    paidVatCents: 1_000_00,
    zone: "other",
    halvedReduction: false
  });
  assert.equal(other.urbanConstructionCents, 10_00, "其他地区 1%");
  assert.equal(other.totalCents, 60_00, "1% + 3% + 2% = 6%");
});

test("六税两费减半：小规模与小型微利减征 50%", () => {
  const result = calculateSurtax({
    paidVatCents: 1_000_00,
    zone: "city",
    halvedReduction: true
  });

  assert.equal(result.urbanConstructionCents, 35_00, "城建税减半");
  assert.equal(result.educationSurchargeCents, 15_00, "教育费附加减半");
  assert.equal(result.localEducationSurchargeCents, 10_00, "地方教育附加减半");
  assert.equal(result.totalCents, 60_00, "合计减半");
  assert.equal(result.reductionCents, 60_00, "减征额要单独列出——申报表上是一栏");
});

test("实缴增值税未知时不估算，报「待主税缴纳后计算」", () => {
  // **这是批次 B 最重要的一条。**
  //
  // 附加税依附于实缴主税。拿「应纳增值税」代替「实缴」得到的是近似值——
  // 有留抵、有减免、分期缴纳时两者都不相等。
  //
  // 给一个近似值意味着用户会拿它去申报，而申报表上的数字必须是准的。
  // 与增值税「税目待确认」、企业所得税「资格待确认」同一口径。
  const result = calculateSurtax({
    paidVatCents: null,
    zone: "city",
    halvedReduction: false
  });

  assert.equal(result.kind, "pending_main_tax");
  assert.equal(result.totalCents, null, "算不出就不给数字");
  assert.match(
    result.reason,
    /缴纳/,
    "要说清在等什么——用户得知道是去缴主税，而不是这里坏了"
  );
});

test("所在地档位未登记时不猜，也不默认按市区 7%", () => {
  // 默认按市区会**多收**：县城企业按 7% 算，多交 2 个点。
  // 与「按最高档兜底」是同一个错误。
  const result = calculateSurtax({
    paidVatCents: 1_000_00,
    zone: null,
    halvedReduction: false
  });

  assert.equal(result.kind, "zone_unknown");
  assert.equal(result.totalCents, null);
  assert.match(result.reason, /所在地/, "要说清缺的是所在地档位");
});

test("实缴增值税为 0 时附加税也是 0，不是「待确认」", () => {
  // **0 与 null 不同**：当期确实没缴增值税（比如全部留抵），
  // 附加税就是 0，这是一个确定的结论，不该让用户去等什么。
  const result = calculateSurtax({
    paidVatCents: 0,
    zone: "city",
    halvedReduction: false
  });

  assert.equal(result.kind, "calculated", "0 是算得出来的结论");
  assert.equal(result.totalCents, 0);
});

test("分角的计税依据不产生小数分", () => {
  // 1234.56 元 × 7% = 86.4192 元。分是最小单位，不能留小数。
  const result = calculateSurtax({
    paidVatCents: 123_456,
    zone: "city",
    halvedReduction: false
  });

  assert.ok(Number.isInteger(result.urbanConstructionCents!), "城建税必须是整数分");
  assert.ok(Number.isInteger(result.educationSurchargeCents!), "教育费附加必须是整数分");
  assert.ok(Number.isInteger(result.localEducationSurchargeCents!), "地方教育附加必须是整数分");
  assert.equal(
    result.totalCents,
    result.urbanConstructionCents! +
      result.educationSurchargeCents! +
      result.localEducationSurchargeCents!,
    "合计必须等于三项之和——各自取整之后合计不能再单独算一遍，否则对不上"
  );
});
