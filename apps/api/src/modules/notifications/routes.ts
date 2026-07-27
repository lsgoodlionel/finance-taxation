/**
 * 通知投递可观测性 —— GET /api/notifications/deliveries
 *
 * 通知是即发即忘的，失败不会冒泡到业务响应里，所以必须有地方能看到「到底发出去没有」。
 * 本端点返回**调用方所属公司**最近的投递记录，以及该公司的渠道状态（是否启用、为何停用），
 * 供设置页 / 运维排查使用。仅内存快照，不做持久化，重启即清空。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { getNotificationDispatcher } from "./dispatch.js";

export async function listNotificationDeliveries(req: ApiRequest, res: ServerResponse): Promise<void> {
  const companyId = req.auth!.companyId;
  const dispatcher = getNotificationDispatcher();
  const items = dispatcher.recentDeliveries(companyId);
  const channel = await dispatcher.describeChannel(companyId);
  json(res, 200, {
    channel,
    items,
    total: items.length,
    failed: items.filter((item) => item.status === "failed").length,
    skipped: items.filter((item) => item.status === "skipped").length
  });
}
