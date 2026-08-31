/**
 * 事项的可见范围与活动留痕——两个被路由层共用的小工具。
 *
 * 单独一个文件是为了打破循环：`routes.ts` 与拆出去的 `analyze.routes.ts`
 * 都要用它们，而 `routes.ts` 又 re-export 了 analyze 的出口。
 * 放在任一侧都会形成 import 环。
 */
import type { BusinessEvent, BusinessEventActivity } from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { filterVisibleEvents } from "./visibility.js";

/** 先按公司过滤，再按本人的可见范围过滤。 */
export function scopeEvents(
  rows: BusinessEvent[],
  req: ApiRequest,
  collaboratingEventIds: ReadonlySet<string>
) {
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  return filterVisibleEvents(
    companyRows,
    { userId: req.auth!.userId, roleCodes: req.auth!.roleCodes },
    collaboratingEventIds
  );
}

export function buildActivity(
  req: ApiRequest,
  businessEventId: string,
  activityType: BusinessEventActivity["activityType"],
  summary: string
): BusinessEventActivity {
  return {
    id: `act-${businessEventId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    companyId: req.auth!.companyId,
    businessEventId,
    activityType,
    actorUserId: req.auth!.userId,
    actorName: req.auth!.username,
    summary,
    createdAt: new Date().toISOString()
  };
}
