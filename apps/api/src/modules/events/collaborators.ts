/**
 * 事项协作人的取数与维护（V15/P1）。
 *
 * 判定逻辑在 `visibility.ts`（纯函数，可单测）；这里只负责读写。
 */

import { query } from "../../db/client.js";

/**
 * 该用户参与协作的事项 id 集合。
 *
 * 一次查完而不是逐条判定：列表页有几百条事项时，逐条去查是几百次往返。
 */
export async function loadCollaboratingEventIds(
  companyId: string,
  userId: string
): Promise<Set<string>> {
  const rows = await query<{ business_event_id: string }>(
    `
      select c.business_event_id
      from event_collaborators c
      join business_events e on e.id = c.business_event_id
      where c.user_id = $1 and e.company_id = $2
    `,
    [userId, companyId]
  );
  return new Set(rows.map((row) => row.business_event_id));
}

export interface EventCollaborator {
  userId: string;
  displayName: string;
  source: string;
  addedByUserId: string | null;
  createdAt: string;
}

export async function listEventCollaborators(
  businessEventId: string
): Promise<EventCollaborator[]> {
  const rows = await query<{
    user_id: string;
    display_name: string;
    source: string;
    added_by_user_id: string | null;
    created_at: string | Date;
  }>(
    `
      select c.user_id, u.display_name, c.source, c.added_by_user_id, c.created_at
      from event_collaborators c
      join users u on u.id = c.user_id
      where c.business_event_id = $1
      order by c.created_at asc
    `,
    [businessEventId]
  );

  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    source: row.source,
    addedByUserId: row.added_by_user_id,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  }));
}

/** 加协作人。重复添加是幂等的，不报错——按钮点两下不该变成一次失败。 */
export async function addEventCollaborator(input: {
  businessEventId: string;
  userId: string;
  addedByUserId: string;
}): Promise<void> {
  await query(
    `
      insert into event_collaborators (business_event_id, user_id, added_by_user_id, source)
      values ($1, $2, $3, 'manual')
      on conflict (business_event_id, user_id) do nothing
    `,
    [input.businessEventId, input.userId, input.addedByUserId]
  );
}

export async function removeEventCollaborator(
  businessEventId: string,
  userId: string
): Promise<void> {
  await query(`delete from event_collaborators where business_event_id = $1 and user_id = $2`, [
    businessEventId,
    userId
  ]);
}
