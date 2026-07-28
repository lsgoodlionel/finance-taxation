/**
 * 趋势图数据映射的防回退约束 —— 核心是「每个点都来自接口返回」。
 *
 * 不用 node:test / node:assert：apps/web 的 tsconfig 只声明 vite/client 类型、
 * 不含 @types/node，`npm run typecheck` 会直接报 TS2307。同 chairman-questions.test.ts，
 * 这里用本地 assert，由 tools/v4/run-web-tests.mjs 以 tsx 直接执行，抛错即失败。
 */
import type { ChairmanTrendData, ChairmanTrendPoint } from "../../lib/api";
import {
  buildTrendSeries,
  describeTrendCoverage,
  hasAnyTrendData,
  periodLabel
} from "./trend-series";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function point(overrides: Partial<ChairmanTrendPoint> & { period: string }): ChairmanTrendPoint {
  return {
    hasData: true,
    revenue: null,
    cost: null,
    expense: null,
    incomeTax: null,
    grossProfit: null,
    netProfit: null,
    ...overrides
  };
}

function trendOf(points: ChairmanTrendPoint[]): ChairmanTrendData {
  return {
    endPeriod: points[points.length - 1]?.period ?? "2026-05",
    months: points.length,
    points,
    periodsWithData: points.filter((candidate) => candidate.hasData).length
  };
}

// ── 每个点都来自接口返回：逐字段可追溯，不增不减不重排 ────────────────────────

{
  const points = [
    point({ period: "2026-03", revenue: "1000", cost: "400", expense: "100" }),
    point({ period: "2026-04", revenue: "600", cost: "500", expense: "120" }),
    point({ period: "2026-05", revenue: "800", cost: "300", expense: "90" })
  ];

  const rows = buildTrendSeries(trendOf(points));

  assert(rows.length === points.length, "不许多出接口没给的点，也不许少画");
  rows.forEach((row, index) => {
    const source = points[index]!;
    assert(row.period === source.period, `第 ${index} 个点的期间必须与接口一致，顺序不重排`);
    assert(row.revenue === Number(source.revenue), `${source.period} 的收入必须原样来自接口`);
    assert(row.cost === Number(source.cost), `${source.period} 的成本必须原样来自接口`);
    assert(row.expense === Number(source.expense), `${source.period} 的费用必须原样来自接口`);
  });
}

{
  // 接口给几个点就画几个点：中间不插值、两端不外推。
  const rows = buildTrendSeries(
    trendOf([
      point({ period: "2026-03", revenue: "1000", cost: "400", expense: "0" }),
      point({ period: "2026-05", revenue: "800", cost: "300", expense: "0" })
    ])
  );
  assert(rows.length === 2, "不得凭空补出中间月份");
  assert(rows.map((row) => row.period).join(",") === "2026-03,2026-05", "期间序列即接口序列");
}

{
  // 旧实现：factors = [0.72, 0.81, 0.88, 0.94, 0.97, 1.0]，本月数乘系数当历史，
  // 必然单调上升。真实数据里公司在下滑，映射必须如实反映。
  const rows = buildTrendSeries(
    trendOf([
      point({ period: "2026-03", revenue: "1000", cost: "0", expense: "0" }),
      point({ period: "2026-04", revenue: "600", cost: "0", expense: "0" }),
      point({ period: "2026-05", revenue: "300", cost: "0", expense: "0" })
    ])
  );
  const revenues = rows.map((row) => row.revenue);
  assert(revenues.join(",") === "1000,600,300", "各期收入互相独立，不由某一个月派生");
  const isMonotonicRising = revenues.every(
    (value, index) => index === 0 || (value ?? 0) >= (revenues[index - 1] ?? 0)
  );
  assert(!isMonotonicRising, "下滑就得画成下滑");
}

// ── 留白：没有账的期间保持 null ─────────────────────────────────────────────

{
  const rows = buildTrendSeries(
    trendOf([
      point({ period: "2026-03", hasData: false }),
      point({ period: "2026-04", hasData: false }),
      point({ period: "2026-05", revenue: "800", cost: "300", expense: "90" })
    ])
  );

  for (const row of rows.slice(0, 2)) {
    assert(row.hasData === false, `${row.period} 没有账`);
    assert(row.revenue === null, `${row.period} 补零会被读成「收入归零」`);
    assert(row.cost === null, `${row.period} 的成本必须留空`);
    assert(row.expense === null, `${row.period} 的费用必须留空`);
  }
  // 空月仍占一格：抹掉它会让 2 月与 5 月在横轴上紧挨着，看起来是连续的两个月。
  assert(rows.length === 3, "没有账的期间照样占横轴一格");
}

{
  // 「有账但收入为 0」是实测值，与「没有账」必须分得开。
  const rows = buildTrendSeries(
    trendOf([point({ period: "2026-04", revenue: "0", cost: "0", expense: "0" })])
  );
  assert(rows[0]!.hasData === true, "记了账只是没开张，不是没有数据");
  assert(rows[0]!.revenue === 0, "0 是实测点，不能退化成断点");
}

{
  // 解析不出数字的脏值宁可断一格，也不能当成 0 画成实测点。
  const rows = buildTrendSeries(
    trendOf([point({ period: "2026-04", revenue: "—", cost: "n/a", expense: "1,200" })])
  );
  assert(rows[0]!.revenue === null, "占位串不是 0");
  assert(rows[0]!.cost === null, "解析不出的值退化为断点");
  assert(rows[0]!.expense === 1200, "千分位是格式，不是脏值");
}

// ── 整块留白与图注 ─────────────────────────────────────────────────────────

{
  const empty = trendOf([
    point({ period: "2026-04", hasData: false }),
    point({ period: "2026-05", hasData: false })
  ]);
  assert(hasAnyTrendData(empty) === false, "整段没有账 → 整块留白，不画全是断点的空图");

  const partial = trendOf([
    point({ period: "2026-04", hasData: false }),
    point({ period: "2026-05", revenue: "1", cost: "0", expense: "0" })
  ]);
  assert(hasAnyTrendData(partial) === true, "只要有一个期间有账就该画");
}

{
  const full = trendOf([
    point({ period: "2026-04", revenue: "1", cost: "0", expense: "0" }),
    point({ period: "2026-05", revenue: "2", cost: "0", expense: "0" })
  ]);
  assert(describeTrendCoverage(full) === "2026-04 至 2026-05", "图注如实交代覆盖区间");

  const gapped = trendOf([
    point({ period: "2026-04", hasData: false }),
    point({ period: "2026-05", revenue: "2", cost: "0", expense: "0" })
  ]);
  assert(
    describeTrendCoverage(gapped).includes("1 个期间没有账务数据"),
    "缺口要在图注里说出来，不藏"
  );
}

{
  assert(periodLabel("2026-05") === "5月", "横轴短标签");
  assert(periodLabel("2026-12") === "12月", "两位数月份");
  assert(periodLabel("2026-01") === "1月", "去掉前导零");
}

console.log("trend-series-ok");
