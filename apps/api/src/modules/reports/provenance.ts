/**
 * 报表快照的溯源判定（V15/P1）。
 *
 * ## 要解决的问题
 *
 * 一份月度报表快照生成后，总账还会动：有人补一张上月凭证、有人红冲一笔。
 * 快照本身不会变——那是它的意义所在——但**用户看不出它已经和账不一致了**，
 * 于是拿着一份过期的报表去申报。
 *
 * 这里不去自动重算（自动重算会让「快照」这个概念失去意义），
 * 而是把「还准不准」变成一个可判定、可显示的状态。
 *
 * ## 为什么用条数 + 最后过账时间两个指标
 *
 * 单看条数：一增一删条数不变，漏判。
 * 单看最后过账时间：补录一笔日期在期间内、但过账时间更早的分录（数据修复场景），
 * 最大值不变，也漏判。
 *
 * 两个一起看仍不是密不透风的（同时增删且时间戳恰好相同），但那需要刻意构造。
 * 真正严格的做法是存分录 id 的哈希，代价是每次校验都要全量拉分录——
 * 对一个「提醒用户去重新生成」的功能来说不值得。
 */

export interface SnapshotProvenance {
  /** 纳入计算的已过账分录条数。 */
  entryCount: number;
  /** 最后一笔分录的过账时间，即数据截止时点；期间内无分录时为 null。 */
  latestPostedAt: string | null;
}

/** 判定结果。`unknown` 是**合法状态**，不许当成 "没过期"。 */
export type SnapshotFreshness =
  | { status: "fresh" }
  | { status: "stale"; reason: string }
  | { status: "unknown"; reason: string };

interface PostedEntryLike {
  postedAt?: string | null;
}

/**
 * 从分录算出溯源信息。
 *
 * 过账时间取最大值而不是「列表第一条」：调用方的排序不该成为这里的隐含前提。
 */
export function buildSnapshotProvenance(
  entries: readonly PostedEntryLike[]
): SnapshotProvenance {
  let latest: string | null = null;
  for (const entry of entries) {
    const postedAt = entry.postedAt;
    if (!postedAt) continue;
    if (latest === null || postedAt > latest) latest = postedAt;
  }
  return { entryCount: entries.length, latestPostedAt: latest };
}

/**
 * 快照还准不准。
 *
 * 老快照（迁移 096 之前生成的）没有溯源信息，返回 `unknown`——
 * 那是事实，不是「没问题」。前端据此显示「无法判断是否为最新」，
 * 而不是给一个绿勾。
 */
export function evaluateSnapshotFreshness(
  recorded: Partial<SnapshotProvenance> | null | undefined,
  current: SnapshotProvenance
): SnapshotFreshness {
  if (!recorded || recorded.entryCount === null || recorded.entryCount === undefined) {
    return { status: "unknown", reason: "这份快照生成于系统记录溯源信息之前，无法判断是否为最新" };
  }

  if (recorded.entryCount !== current.entryCount) {
    const delta = current.entryCount - recorded.entryCount;
    const wording = delta > 0 ? `新增了 ${delta} 条` : `减少了 ${-delta} 条`;
    return {
      status: "stale",
      reason: `生成快照后账上${wording}分录，报表数据已与总账不一致，请重新生成`
    };
  }

  // `null` 与有值语义不同：期间内本来就没有分录时两边都该是 null。
  const recordedLatest = recorded.latestPostedAt ?? null;
  if (recordedLatest !== current.latestPostedAt) {
    return {
      status: "stale",
      reason: "生成快照后有分录被改动或补录，报表数据已与总账不一致，请重新生成"
    };
  }

  return { status: "fresh" };
}
