import type { ServerResponse } from "node:http";
import type { Task } from "@finance-taxation/domain-model";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";
import { buildTaskTree, hasCompanyWideAccess, listCompanyTasks } from "../events/routes.js";

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
  const scoped = scopeTasks(rows, req);
  const filtered = eventId ? scoped.filter((item) => item.businessEventId === eventId) : scoped;
  return json(res, 200, { items: filtered, tree: buildTaskTree(filtered), total: filtered.length });
}
