/**
 * 事项协作人的接口（V15/P1）。
 *
 * 可见性收敛到「owner + 显式协作人」之后，**必须有地方把人加进来**——
 * 只收紧口径不给入口，等于把一个功能改成一个故障。
 *
 * 谁能改协作人：事项的 owner，或持 `events.assign` 的人。
 * 借的是 `access/ownership.ts` 的同一套判定——协作人是可见性的一部分，
 * 而**能看见不等于能改**，协作人自己不能再往里拉人。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { queryOne } from "../../db/client.js";
import { canMutate } from "../access/ownership.js";
import {
  addEventCollaborator,
  listEventCollaborators,
  loadCollaboratingEventIds,
  removeEventCollaborator
} from "./collaborators.js";
import { canViewEvent } from "./visibility.js";

interface EventRow {
  id: string;
  owner_id: string | null;
}

async function loadEvent(companyId: string, eventId: string): Promise<EventRow | null> {
  return queryOne<EventRow>(
    `select id, owner_id from business_events where id = $1 and company_id = $2`,
    [eventId, companyId]
  );
}

/**
 * 看得见这条事项的人才能看协作人名单。
 *
 * 看不见时返回 404 而不是 403：403 会确认「这条事项存在」，
 * 对越权探测来说那本身就是信息。
 */
export async function getEventCollaborators(
  req: ApiRequest,
  res: ServerResponse,
  eventId: string
) {
  const { companyId, userId, roleCodes } = req.auth!;
  const event = await loadEvent(companyId, eventId);
  if (!event) return json(res, 404, { error: "Event not found" });

  const collaborating = await loadCollaboratingEventIds(companyId, userId);
  if (!canViewEvent({ id: event.id, ownerId: event.owner_id }, { userId, roleCodes }, collaborating)) {
    return json(res, 404, { error: "Event not found" });
  }

  return json(res, 200, { items: await listEventCollaborators(eventId) });
}

export async function postEventCollaborator(
  req: ApiRequest,
  res: ServerResponse,
  eventId: string
) {
  const { companyId, userId, roleCodes } = req.auth!;
  const targetUserId = String((req.body as { userId?: string } | undefined)?.userId || "").trim();
  if (!targetUserId) return json(res, 400, { error: "userId is required" });

  const event = await loadEvent(companyId, eventId);
  if (!event) return json(res, 404, { error: "Event not found" });

  if (!canMutate("businessEvent", event.owner_id, { userId, roleCodes })) {
    return json(res, 403, { error: "只有事项负责人或有指派权限的人可以调整协作人" });
  }

  // 跨公司拉人会把另一家公司的数据暴露出去——这是多租户里最不能出的错。
  const member = await queryOne<{ id: string }>(
    `select id from users where id = $1 and company_id = $2 and status = 'active'`,
    [targetUserId, companyId]
  );
  if (!member) return json(res, 404, { error: "User not found" });

  await addEventCollaborator({
    businessEventId: eventId,
    userId: targetUserId,
    addedByUserId: userId
  });
  return json(res, 201, { items: await listEventCollaborators(eventId) });
}

export async function deleteEventCollaborator(
  req: ApiRequest,
  res: ServerResponse,
  eventId: string,
  targetUserId: string
) {
  const { companyId, userId, roleCodes } = req.auth!;
  const event = await loadEvent(companyId, eventId);
  if (!event) return json(res, 404, { error: "Event not found" });

  if (!canMutate("businessEvent", event.owner_id, { userId, roleCodes })) {
    return json(res, 403, { error: "只有事项负责人或有指派权限的人可以调整协作人" });
  }

  await removeEventCollaborator(eventId, targetUserId);
  return json(res, 200, { items: await listEventCollaborators(eventId) });
}
