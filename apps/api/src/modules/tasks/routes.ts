import type { ServerResponse } from "node:http";
import type { Task, TaskStatus } from "@finance-taxation/domain-model";
import { queryOne } from "../../db/client.js";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";
import { buildTaskTree, hasCompanyWideAccess, listCompanyTasks } from "../events/routes.js";
import { writeAudit } from "../../services/audit.js";
import { isTaskOverdue } from "./overdue.js";

const VALID_TASK_STATUS_VALUES = [
  "not_started",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled"
] as const satisfies readonly TaskStatus[];

export const VALID_TASK_STATUSES: ReadonlySet<string> = new Set(VALID_TASK_STATUS_VALUES);

function scopeTasks(rows: Task[], req: ApiRequest) {
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  if (hasCompanyWideAccess(req.auth!.roleCodes)) {
    return companyRows;
  }
  return companyRows.filter(
    (row) =>
      row.ownerId === req.auth!.userId || row.assigneeDepartment === req.auth!.departmentName
  );
}

export function handleTasksMeta(_req: ApiRequest, res: ServerResponse) {
  return json(res, 200, {
    module: "tasks",
    plannedEndpoints: [
      "GET /api/tasks",
      "POST /api/tasks",
      "GET /api/tasks/:id",
      "PUT /api/tasks/:id",
      "POST /api/tasks/:id/approve",
      "POST /api/tasks/:id/block"
    ]
  });
}

export async function listTasks(req: ApiRequest, res: ServerResponse) {
  const rows = await listCompanyTasks(req.auth!.companyId);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId");
  const overdueOnly = url.searchParams.get("overdueOnly") === "true";
  const scoped = scopeTasks(rows, req);
  let filtered = eventId ? scoped.filter((item) => item.businessEventId === eventId) : scoped;
  const withOverdue = filtered.map((task) => ({ ...task, isOverdue: isTaskOverdue(task) }));
  if (overdueOnly) {
    filtered = withOverdue.filter((item) => item.isOverdue);
    return json(res, 200, { items: filtered, tree: buildTaskTree(filtered), total: filtered.length });
  }
  return json(res, 200, { items: withOverdue, tree: buildTaskTree(withOverdue), total: withOverdue.length });
}

export async function remindTask(req: ApiRequest, res: ServerResponse, taskId: string) {
  const companyId = req.auth!.companyId;
  const task = await queryOne<{ id: string; title: string; company_id: string }>(
    "select id, title, company_id from tasks where id = $1 and company_id = $2",
    [taskId, companyId]
  );
  if (!task) {
    return json(res, 404, { error: "Task not found" });
  }
  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "remind",
    resourceType: "task",
    resourceId: taskId,
    resourceLabel: task.title
  });
  return json(res, 200, { ok: true, taskId, remindedAt: new Date().toISOString() });
}

export async function updateTask(req: ApiRequest, res: ServerResponse, taskId: string) {
  const companyId = req.auth!.companyId;
  const body = (req.body ?? {}) as { status?: string; notes?: string };

  if (body.status !== undefined && !VALID_TASK_STATUSES.has(body.status)) {
    return json(res, 400, { error: `无效状态，可选值：${[...VALID_TASK_STATUSES].join(", ")}` });
  }

  const existing = await queryOne<{ id: string; title: string; status: string }>(
    "select id, title, status from tasks where id = $1 and company_id = $2",
    [taskId, companyId]
  );
  if (!existing) {
    return json(res, 404, { error: "Task not found" });
  }

  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [];
  let idx = 1;

  if (body.status !== undefined) {
    sets.push(`status = $${idx++}`);
    params.push(body.status);
  }

  params.push(taskId, companyId);

  const updated = await queryOne<{ id: string; title: string; status: string; updated_at: string }>(
    `update tasks set ${sets.join(", ")} where id = $${idx++} and company_id = $${idx++}
     returning id, title, status, updated_at::text`,
    params
  );

  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "update",
    resourceType: "task",
    resourceId: taskId,
    resourceLabel: existing.title,
    changes: { status: { from: existing.status, to: body.status } }
  });

  return json(res, 200, updated);
}
