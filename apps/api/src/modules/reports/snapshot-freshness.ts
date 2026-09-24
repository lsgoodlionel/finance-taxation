/**
 * 快照新鲜度的取数层（V15/P1）。
 *
 * 判定逻辑在 `provenance.ts`（纯函数，可单测）；这里只负责把「当前账上是什么样」
 * 从库里捞出来。
 *
 * 一条聚合 SQL 把所有快照的当前口径一次算完，而不是每条快照拉一遍分录——
 * 列表页有几十条快照时后者是几十次全表扫描。
 */

import { query } from "../../db/client.js";
import {
  evaluateSnapshotFreshness,
  type SnapshotFreshness,
  type SnapshotProvenance
} from "./provenance.js";

interface CurrentRow {
  id: string;
  entry_count: string;
  latest_posted_at: string | Date | null;
}

/**
 * 批量算出每条快照对应期间的当前分录条数与最后过账时间。
 *
 * 期间口径必须与生成时一致（见 `buildReportPayload`）：
 * 资产负债表是时点表，取期末之前的**全部**分录，没有下限；
 * 利润表与现金流量表只取当期那一段。口径对不上会让每一份资产负债表快照
 * 都被误报成「已过期」。
 */
export async function loadCurrentProvenance(
  companyId: string
): Promise<Map<string, SnapshotProvenance>> {
  const rows = await query<CurrentRow>(
    `
      select
        s.id,
        count(e.id)::text     as entry_count,
        max(e.posted_at)      as latest_posted_at
      from report_snapshots s
      left join ledger_entries e
        on e.company_id = s.company_id
       and e.entry_date <= s.period_end
       and (s.report_type = 'balance_sheet' or e.entry_date >= s.period_start)
      where s.company_id = $1
      group by s.id
    `,
    [companyId]
  );

  return new Map(
    rows.map((row) => [
      row.id,
      {
        entryCount: Number(row.entry_count),
        latestPostedAt:
          row.latest_posted_at === null
            ? null
            : new Date(row.latest_posted_at).toISOString()
      }
    ])
  );
}

interface SnapshotLike {
  id: string;
  sourceEntryCount?: number | null;
  sourceLatestPostedAt?: string | null;
}

/**
 * 给快照贴上新鲜度。
 *
 * 查不到当前口径时返回 `unknown` 而不是 `fresh`——**给一份来路不明的报表
 * 打绿勾比说「不知道」危险得多**，用户会拿它去申报。
 */
export function attachFreshness<T extends SnapshotLike>(
  snapshots: readonly T[],
  current: Map<string, SnapshotProvenance>
): (T & { freshness: SnapshotFreshness })[] {
  return snapshots.map((snapshot) => {
    const now = current.get(snapshot.id);
    if (!now) {
      return {
        ...snapshot,
        freshness: { status: "unknown", reason: "取不到当前账面口径，无法判断" } as const
      };
    }
    return {
      ...snapshot,
      freshness: evaluateSnapshotFreshness(
        {
          entryCount: snapshot.sourceEntryCount ?? undefined,
          latestPostedAt: snapshot.sourceLatestPostedAt ?? null
        },
        now
      )
    };
  });
}
