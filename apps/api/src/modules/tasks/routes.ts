import type { ServerResponse } from "node:http";
import type { Task, TaskTreeNode } from "@finance-taxation/domain-model";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";
import { readJson } from "../../services/jsonStore.js";

const tasksFile = new URL("../../data/tasks.v2.json", import.meta.url);

const seedTasks: Task[] = [];

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

function hasCompanyWideAccess(roleCodes: string[]) {
  return roleCodes.some((role) => ["role-chairman", "role-finance-director"].includes(role));
}

function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const nodeMap = new Map<string, TaskTreeNode>();
  for (const task of tasks) {
    nodeMap.set(task.id, { ...task, children: [] });
  }
  const roots: TaskTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentTaskId) {
      const parent = nodeMap.get(node.parentTaskId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }
  return roots;
}

export async function listTasks(req: ApiRequest, res: ServerResponse) {
  const tasks = await readJson(tasksFile, seedTasks);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId");
  const companyScoped = tasks.filter((item) => item.companyId === req.auth!.companyId);
  const scoped = hasCompanyWideAccess(req.auth!.roleCodes)
    ? companyScoped
    : companyScoped.filter(
        (item) =>
          item.ownerId === req.auth!.userId || item.assigneeDepartment === req.auth!.departmentName
      );
  const filtered = eventId ? scoped.filter((item) => item.businessEventId === eventId) : scoped;
  return json(res, 200, { items: filtered, tree: buildTaskTree(filtered), total: filtered.length });
}
