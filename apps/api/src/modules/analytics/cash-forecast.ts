/**
 * 现金流预测（E2）——历史净现金流的最小二乘线性回归外推。
 *
 * 纯数学、无外部依赖：给定按月的历史净现金流序列，拟合趋势线并外推未来
 * N 期。作为「历史 12 月回归」的可核对基线预测；更复杂的季节性/ML 可在此
 * 之上叠加。金额单位由调用方约定（建议分）。
 */

export interface ForecastPoint {
  /** 相对期序，0 为首个历史期。 */
  index: number;
  value: number;
}

export interface LinearFit {
  slope: number;
  intercept: number;
}

export interface CashForecast {
  fit: LinearFit;
  /** 未来各期预测值，index 接续历史。 */
  predictions: ForecastPoint[];
}

/** 对 (index, value) 序列做最小二乘拟合。少于两点时斜率为 0。 */
export function linearFit(history: readonly number[]): LinearFit {
  const n = history.length;
  if (n === 0) {
    return { slope: 0, intercept: 0 };
  }
  if (n === 1) {
    return { slope: 0, intercept: history[0]! };
  }
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    const y = history[i]!;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n };
  }
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * 基于历史序列外推未来 periods 期。
 * @param history 按期升序的净现金流。
 * @param periods 预测期数（>0）。
 */
export function forecastCashFlow(history: readonly number[], periods: number): CashForecast {
  const fit = linearFit(history);
  const predictions: ForecastPoint[] = [];
  const safePeriods = Math.max(0, Math.floor(periods));
  for (let step = 1; step <= safePeriods; step += 1) {
    const index = history.length - 1 + step;
    predictions.push({ index, value: Math.round(fit.slope * index + fit.intercept) });
  }
  return { fit, predictions };
}
