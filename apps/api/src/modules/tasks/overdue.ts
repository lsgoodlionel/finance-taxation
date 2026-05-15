import type { Task } from "@finance-taxation/domain-model";

export const TERMINAL_STATUSES = new Set(["done", "cancelled"]);

export function isTaskOverdue(task: Pick<Task, "dueAt" | "status">, now = new Date()): boolean {
  if (!task.dueAt || TERMINAL_STATUSES.has(task.status)) return false;
  return new Date(task.dueAt) < now;
}
