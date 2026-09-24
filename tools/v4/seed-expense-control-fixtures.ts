/**
 * V13-A 费控地基的种子数据。
 *
 * 纯数据，从 `seed-acceptance-data.ts` 拆出来——那个文件涨到 813 行超了
 * 体量上限，而这些常量与播种的过程逻辑没有耦合，是最干净的一刀。
 */
/**
 * 种子预算的期间：2026-04。
 *
 * **刻意与种子账的业务期间对齐**（种子分录集中在 2026-01/02/04）——预算落在
 * 没有任何分录的月份，打开预算中心看到的就是一排「已发生 0.00」，
 * 那等于没验证取数口径通不通，与不播种没有区别。
 */
export const SEED_BUDGET_PERIOD = "2026-04";

/** 费用标准的生效起日：设在账套期间之前，让整个种子期间都被标准覆盖。 */
export const SEED_STANDARD_EFFECTIVE_FROM = "2026-01-01";

/**
 * V13-A 费控地基的种子。
 *
 * 每个公司播两条预算（一条带科目与部门、一条全公司总额）与两条费用标准
 * （一条通用、一条按职级），覆盖「维度为 null」与「维度有值」两种形态——
 * 只播全 null 的那种，`coalesce` 唯一索引与最具体匹配都测不出来。
 */
export const SEED_BUDGETS = [
  {
    suffix: "travel",
    periodType: "month",
    periodKey: SEED_BUDGET_PERIOD,
    accountCode: "660203",
    amountCents: 500000,
    controlPolicy: "warn",
    note: "差旅费月度预算（V13 种子）"
  },
  {
    suffix: "company",
    periodType: "year",
    periodKey: SEED_BUDGET_PERIOD.slice(0, 4),
    accountCode: null,
    amountCents: 20000000,
    controlPolicy: "warn",
    note: "全公司年度总额预算（V13 种子）"
  }
] as const;

/**
 * 成本中心（V12-D1 的能力，V13-B 补种子）。
 *
 * 没有它，费用分摊在页面上是死的——分摊对象的下拉框空着，而用户看不出
 * 是「功能没做」还是「数据没配」。两个部门够了：分摊至少要两个对象才成立。
 */
//
// **编码带 SEED- 前缀**：`CC-RND` / `CC-SALES` 这类通用编码会与测试自建的
// 成本中心撞车（cost-center.integration.test.ts 用的正是 CC-SALES），
// 而撞车表现为「新建成本中心」用例报 409——从那句话看不出是种子的锅。
export const SEED_COST_CENTERS = [
  { suffix: "rnd", code: "SEED-RD", name: "研发部" },
  { suffix: "sales", code: "SEED-MK", name: "市场部" }
] as const;

export const SEED_STANDARDS = [
  {
    suffix: "hotel-generic",
    expenseType: "travel_hotel",
    gradeCode: null,
    cityTier: null,
    limitCents: 30000,
    limitBasis: "per_day",
    overPolicy: "warn",
    note: "住宿通用标准 300/晚（V13 种子）"
  },
  {
    suffix: "hotel-m2-tier1",
    expenseType: "travel_hotel",
    gradeCode: "M2",
    cityTier: "tier1",
    limitCents: 60000,
    limitBasis: "per_day",
    overPolicy: "escalate",
    note: "M2 一线城市住宿 600/晚，超标加签（V13 种子）"
  }
] as const;
