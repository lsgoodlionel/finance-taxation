/**
 * 驾驶舱 KPI 环比文案的纯逻辑。
 * 后端在无法给出环比时会返回「—」/「无上期数据」/「暂无数据」——
 * 此时不得在标签旁标注「环比上月」，否则又是一句系统给不出的承诺。
 */
const NO_COMPARISON_TOKENS = ["—", "-"] as const;
const NO_COMPARISON_HINTS = ["无上期数据", "暂无数据"] as const;

export function hasTrendComparison(trend: string): boolean {
  const value = trend.trim();
  if (!value) return false;
  if (NO_COMPARISON_TOKENS.some((token) => value === token)) return false;
  return !NO_COMPARISON_HINTS.some((hint) => value.includes(hint));
}
