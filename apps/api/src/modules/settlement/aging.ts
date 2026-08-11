/**
 * 账龄分析（V12-C2）。
 *
 * ## 账龄不是逾期天数
 *
 * 两个概念常被混作一谈，但催收动作完全不同：
 * - **账龄**：自业务发生日起的天数，回答"这笔钱挂了多久"；
 * - **逾期**：自约定到期日（发生日 + 信用账期）起的天数，回答"客户违约了没有"。
 *
 * 标准账龄分析表用前者 —— 它是坏账准备计提的依据，与合同账期无关。后者
 * 由 `overdueDays` 单独给出，用往来单位档案里的 `credit_days`。一张表里
 * 两个口径都有，但绝不混算。
 *
 * ## 桶的边界是闭区间
 *
 * `0-30` 含第 30 天，`31-60` 从第 31 天起。写成半开区间（`days < 30`）会让
 * 恰好 30 天的那笔掉进下一档，而 30 天正是最常见的账期，边界上的笔数不少。
 */

export interface AgingBucket {
  key: string;
  label: string;
  /** 该桶的账龄上限（含）。最后一桶为 null，表示无上限。 */
  maxDays: number | null;
}

export const AGING_BUCKETS: readonly AgingBucket[] = [
  { key: "0-30", label: "30 天以内", maxDays: 30 },
  { key: "31-60", label: "31-60 天", maxDays: 60 },
  { key: "61-90", label: "61-90 天", maxDays: 90 },
  { key: "91-180", label: "91-180 天", maxDays: 180 },
  { key: "181-365", label: "181-365 天", maxDays: 365 },
  { key: "365+", label: "1 年以上", maxDays: null }
];

/** 某个账龄天数落在哪个桶。负数（未来日期的分录）归入第一桶。 */
export function bucketFor(days: number): AgingBucket {
  for (const bucket of AGING_BUCKETS) {
    if (bucket.maxDays === null || days <= bucket.maxDays) {
      return bucket;
    }
  }
  // AGING_BUCKETS 末项 maxDays 为 null，循环必然命中；这里只为满足类型收敛。
  return AGING_BUCKETS[AGING_BUCKETS.length - 1]!;
}

/** 两个 `YYYY-MM-DD` 之间的自然日差。用 UTC 避免夏令时导致的 23/25 小时误差。 */
export function daysBetween(from: string, to: string): number {
  const start = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10))
  );
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

/** 一笔未结清的往来款。金额单位为分。 */
export interface OpenItem {
  entryId: string;
  counterpartyId: string | null;
  counterpartyName: string;
  accountCode: string;
  accountName: string;
  entryDate: string;
  summary: string;
  /** 原始发生额。 */
  originalCents: number;
  /** 已核销额。 */
  settledCents: number;
  /** 该往来单位的信用账期（天）；无档案时为 0。 */
  creditDays: number;
}

export interface AgedItem extends OpenItem {
  openCents: number;
  agingDays: number;
  bucketKey: string;
  /** 超过信用账期的天数；未逾期为 0。 */
  overdueDays: number;
}

export interface AgingCounterpartyRow {
  counterpartyId: string | null;
  counterpartyName: string;
  totalCents: number;
  overdueCents: number;
  bucketCents: Record<string, number>;
  itemCount: number;
}

export interface AgingReport {
  asOf: string;
  direction: "receivable" | "payable";
  totalCents: number;
  overdueCents: number;
  bucketCents: Record<string, number>;
  counterparties: AgingCounterpartyRow[];
  items: AgedItem[];
}

function emptyBuckets(): Record<string, number> {
  return Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket.key, 0]));
}

/**
 * 由未结清明细汇总出账龄表。纯函数：取数在 store 里，规则在这里。
 *
 * **已结清的笔不进表**（openCents <= 0 直接跳过）。留着它们会让"应收合计"
 * 等于所有历史交易额，而不是当前欠款 —— 这是账龄表最常见的错法。
 */
export function buildAgingReport(
  items: readonly OpenItem[],
  asOf: string,
  direction: "receivable" | "payable"
): AgingReport {
  const aged: AgedItem[] = [];

  for (const item of items) {
    const openCents = item.originalCents - item.settledCents;
    if (openCents <= 0) continue;

    const agingDays = daysBetween(item.entryDate, asOf);
    const overdueDays = Math.max(0, agingDays - item.creditDays);
    aged.push({
      ...item,
      openCents,
      agingDays,
      bucketKey: bucketFor(agingDays).key,
      overdueDays
    });
  }

  const byCounterparty = new Map<string, AgingCounterpartyRow>();
  const totals = emptyBuckets();
  let totalCents = 0;
  let overdueCents = 0;

  for (const item of aged) {
    totalCents += item.openCents;
    totals[item.bucketKey] = (totals[item.bucketKey] ?? 0) + item.openCents;
    if (item.overdueDays > 0) overdueCents += item.openCents;

    // 无档案的往来单位归到一个显式的"未指定"分组，而不是丢掉 ——
    // 丢掉会让分户合计对不上总额，用户只会以为系统算错了。
    const key = item.counterpartyId ?? "__unassigned__";
    const row = byCounterparty.get(key) ?? {
      counterpartyId: item.counterpartyId,
      counterpartyName: item.counterpartyName,
      totalCents: 0,
      overdueCents: 0,
      bucketCents: emptyBuckets(),
      itemCount: 0
    };
    row.totalCents += item.openCents;
    row.bucketCents[item.bucketKey] = (row.bucketCents[item.bucketKey] ?? 0) + item.openCents;
    row.itemCount += 1;
    if (item.overdueDays > 0) row.overdueCents += item.openCents;
    byCounterparty.set(key, row);
  }

  return {
    asOf,
    direction,
    totalCents,
    overdueCents,
    bucketCents: totals,
    counterparties: [...byCounterparty.values()].sort((a, b) => b.totalCents - a.totalCents),
    items: aged.sort((a, b) => b.agingDays - a.agingDays)
  };
}
