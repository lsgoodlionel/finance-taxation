/**
 * P7-B1 现金流前瞻（纯函数，可测）
 *
 * 基于当前可动用资金 + 预计流入（应收）- 预计流出（应付/税负/工资/社保），
 * 预测资金位置并判断「这个月还能发工资吗」。
 */

export interface CashForecastInput {
  cashBalance: number;          // 当前可动用资金（1002 银行存款）
  receivables: number;          // 预计流入：应收账款
  payables: number;             // 预计流出：应付账款
  taxLiability: number;         // 预计流出：应交税费
  upcomingPayroll: number;      // 预计流出：本期工资（实发）
  upcomingSocialSecurity: number; // 预计流出：三险一金（单位+个人）
}

export interface CashForecast {
  cashBalance: number;
  expectedInflow: number;
  expectedOutflow: number;
  projectedBalance: number;     // 全部收支后的预计余额
  salaryNeed: number;           // 工资+社保即时刚性支出
  /**
   * 当前资金是否够发当月工资社保。
   *
   * **`null` = 算不出**（一条账务数据都没有），与 `false`（算出来不够）不同。
   * 调用方必须分开处理：给一家没录数据的公司显示绿灯，比显示红灯更危险。
   */
  canPaySalary: boolean | null;
  gap: number;                  // 资金缺口（正=缺口）
  verdict: string;
}

function r2(n: number): number { return Number(n.toFixed(2)); }

export function buildCashForecast(i: CashForecastInput): CashForecast {
  const cashBalance = r2(i.cashBalance);
  const expectedInflow = r2(Math.max(0, i.receivables));
  const expectedOutflow = r2(
    Math.max(0, i.payables) + Math.max(0, i.taxLiability) +
    Math.max(0, i.upcomingPayroll) + Math.max(0, i.upcomingSocialSecurity),
  );
  const projectedBalance = r2(cashBalance + expectedInflow - expectedOutflow);
  const salaryNeed = r2(Math.max(0, i.upcomingPayroll) + Math.max(0, i.upcomingSocialSecurity));
  const gap = projectedBalance < 0 ? r2(-projectedBalance) : 0;

  // **全零 = 没有数据，不是「财务健康」**（V16 角色实验发现）。
  //
  // 此前 `cashBalance >= salaryNeed` 在 0 >= 0 时为真，于是一家账上一分钱没有、
  // 也没录过任何账务数据的公司，会在老板的驾驶舱上看到
  // 「资金充裕：本期工资社保可发」——而同一张卡片上方就写着
  // 「本期还没有账务数据，算不出可动用资金」。两句话互相打脸，
  // 而老板会信下面那句带数字的。
  //
  // 这是本项目一贯强调的 null ≠ 0 在自己代码里的又一次违反：
  // 「算不出来」和「算出来是零」是两件事，**永远不要在无数据时给肯定结论**。
  const hasAnyData =
    cashBalance !== 0 || expectedInflow !== 0 || expectedOutflow !== 0 || salaryNeed !== 0;

  if (!hasAnyData) {
    return {
      cashBalance,
      expectedInflow,
      expectedOutflow,
      projectedBalance,
      salaryNeed,
      // null 而不是 true：调用方据此显示「算不出」，而不是给一个绿灯。
      canPaySalary: null,
      gap,
      verdict: "本期还没有任何资金与应收应付数据，算不出资金状况。先把银行流水与应付录进来。"
    };
  }

  const canPaySalary = cashBalance >= salaryNeed;

  let verdict: string;
  if (!canPaySalary) {
    verdict = `⚠️ 当前资金 ¥${cashBalance.toFixed(2)} 不足以支付本期工资社保 ¥${salaryNeed.toFixed(2)}，需尽快回款或安排资金。`;
  } else if (gap > 0) {
    verdict = `本期工资可发，但全部应付/税负结清后预计资金缺口 ¥${gap.toFixed(2)}，建议加快应收回款。`;
  } else {
    verdict = `资金充裕：本期工资社保可发，结清全部应付与税负后预计仍余 ¥${projectedBalance.toFixed(2)}。`;
  }

  return { cashBalance, expectedInflow, expectedOutflow, projectedBalance, salaryNeed, canPaySalary, gap, verdict };
}
