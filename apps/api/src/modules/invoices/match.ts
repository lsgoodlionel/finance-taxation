/**
 * 发票池与报销单的匹配建议（V14-D）。
 *
 * ## V13 的判断要修正一半
 *
 * V13 把这件事列入「明确不做」，理由是「误配代价高于省下的点击」。
 * **那个推理没错，但由此得出「不做」是跳步了。**
 *
 * 正确的结论是「不做**自动挂载**」。做成建议——按相关度排序，
 * 用户点一下选中——省掉的是「在几百张票里翻找」，而不是「确认这张对不对」。
 * 误配的风险因此降到零，收益一分没少。
 *
 * ## 分数只用于排序，不设阈值
 *
 * **设阈值自动选就等于自动挂载**，绕回原来的问题。所以这里没有
 * 「分数高于 X 就自动选中」，只有排序。
 *
 * ## 纯函数
 *
 * 不查库。候选发票由调用方查好传进来，评分逻辑可以单独测遍所有分支——
 * 而「为什么这张票排在前面」是用户会问的问题，答案必须是可复现的。
 */

/** 金额完全相等。最强的信号——发票金额与报销金额一致基本就是它。 */
const SCORE_AMOUNT_EXACT = 50;
/** 金额相差不超过 1 元。含税不含税的零头、抹零都会造成这种小差。 */
const SCORE_AMOUNT_CLOSE = 30;
/** 发票日期落在费用日期前后 7 天内。 */
const SCORE_DATE_NEAR = 20;
/** 供应商名含关键词。 */
const SCORE_SELLER_MATCH = 15;
/** 已验真的票排在前面——它更可能是要报的那张。 */
const SCORE_VERIFIED = 5;

/** 金额「接近」的容差：1 元 = 100 分。 */
const AMOUNT_TOLERANCE_CENTS = 100;
/** 日期「接近」的窗口：前后 7 天。 */
const DATE_WINDOW_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface InvoiceCandidate {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  sellerName: string | null;
  totalAmountCents: number;
  verifyStatus: string | null;
}

export interface MatchTarget {
  /** 报销行金额（分）。 */
  amountCents: number;
  /** 费用发生日期 YYYY-MM-DD。 */
  expenseOn: string;
  /**
   * 供应商关键词。取自报销行摘要或往来单位名。
   *
   * `null` 表示没有可比的关键词——**不是「关键词为空串」**：
   * 空串会让 `includes` 恒真，把所有票都加 15 分，等于这一项没有区分度。
   */
  keyword: string | null;
}

export interface MatchSuggestion {
  invoice: InvoiceCandidate;
  score: number;
  /** 得分理由，逐条给出。「为什么这张排在前面」是用户会问的问题。 */
  reasons: string[];
  /** 与费用日期相差的天数，供同分时排序。 */
  dayGap: number;
}

function dayGapBetween(a: string, b: string): number {
  const left = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const right = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / MS_PER_DAY;
}

/**
 * 给一张候选发票打分。
 *
 * 金额的两档**互斥**：完全相等就不再算「接近」，否则相等的票会拿 80 分
 * 而接近的拿 30，档位之间的差距被人为拉大，排序反而失真。
 */
export function scoreInvoice(target: MatchTarget, invoice: InvoiceCandidate): MatchSuggestion {
  const reasons: string[] = [];
  let score = 0;

  const amountDiff = Math.abs(invoice.totalAmountCents - target.amountCents);
  if (amountDiff === 0) {
    score += SCORE_AMOUNT_EXACT;
    reasons.push("金额完全一致");
  } else if (amountDiff <= AMOUNT_TOLERANCE_CENTS) {
    score += SCORE_AMOUNT_CLOSE;
    reasons.push(`金额相差 ${(amountDiff / 100).toFixed(2)} 元`);
  }

  const dayGap = dayGapBetween(invoice.invoiceDate, target.expenseOn);
  if (dayGap <= DATE_WINDOW_DAYS) {
    score += SCORE_DATE_NEAR;
    reasons.push(dayGap === 0 ? "开票日与费用日同天" : `开票日相差 ${dayGap} 天`);
  }

  // keyword 为 null 时整项跳过。空串会让 includes 恒真，
  // 把所有票都加 15 分——那等于这一项没有区分度。
  const keyword = target.keyword?.trim();
  if (keyword && invoice.sellerName && invoice.sellerName.includes(keyword)) {
    score += SCORE_SELLER_MATCH;
    reasons.push(`销方含「${keyword}」`);
  }

  if (invoice.verifyStatus === "verified") {
    score += SCORE_VERIFIED;
    reasons.push("已验真");
  }

  return { invoice, score, reasons, dayGap };
}

/**
 * 给一批候选发票打分并排序。
 *
 * **不过滤零分的**：零分只表示「哪一条都没对上」，不表示「不是这张」。
 * 用户自己贴的票据可能开票日期离费用日很远、金额是几张合并的——
 * 把它们藏起来会让用户以为票不在池子里，转而去手工录一张重复的。
 *
 * 同分时按日期接近程度排——同样金额的两张票，日期近的更可能是这一笔。
 */
export function rankInvoices(
  target: MatchTarget,
  candidates: readonly InvoiceCandidate[]
): MatchSuggestion[] {
  return candidates
    .map((invoice) => scoreInvoice(target, invoice))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.dayGap !== b.dayGap) return a.dayGap - b.dayGap;
      // 分数与日期都一样时按发票号排，保证结果稳定——
      // 顺序不稳定会让同一次查询两次刷新出不同的排列。
      return a.invoice.invoiceNo.localeCompare(b.invoice.invoiceNo);
    });
}
