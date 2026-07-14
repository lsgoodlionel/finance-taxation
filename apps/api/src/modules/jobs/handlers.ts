/**
 * F5 调度：任务类型 → 执行器 的注册表。
 *
 * runner 从 scheduled_jobs 取到点任务后按 kind 派发到这里。handler 保持幂等、
 * 只做只读扫描或安全写入；失败抛错交给 runner 走 planRetry 退避重试。
 */

import { query } from "../../db/client.js";
import { writeAudit } from "../../services/audit.js";

export interface JobContext {
  id: string;
  companyId: string | null;
  payload: Record<string, unknown> | null;
}

export type JobHandler = (ctx: JobContext) => Promise<void>;

/**
 * 逾期任务扫描：统计每家公司未完结且已过期的任务数，写入审计留痕，
 * 供收件箱/驾驶舱后续消费。纯读 + 审计写入，天然幂等。
 */
async function overdueTaskScan(ctx: JobContext): Promise<void> {
  const rows = await query<{ company_id: string; overdue: string }>(
    `select company_id, count(*)::text as overdue
       from tasks
      where due_at is not null
        and due_at < now()
        and status not in ('done', 'cancelled')
      group by company_id`
  );
  for (const row of rows) {
    const overdue = Number(row.overdue);
    if (overdue > 0) {
      writeAudit({
        companyId: row.company_id,
        action: "jobs.overdue_task_scan",
        resourceType: "task",
        changes: { overdue, jobId: ctx.id }
      });
    }
  }
}

export const JOB_HANDLERS: Record<string, JobHandler> = {
  overdue_task_scan: overdueTaskScan
};

export function isKnownJobKind(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(JOB_HANDLERS, kind);
}
