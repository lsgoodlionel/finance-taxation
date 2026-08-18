/**
 * F5 调度：任务类型 → 执行器 的注册表。
 *
 * runner 从 scheduled_jobs 取到点任务后按 kind 派发到这里。handler 保持幂等、
 * 只做只读扫描或安全写入；失败抛错交给 runner 走 planRetry 退避重试。
 */

import { query } from "../../db/client.js";
import { writeAudit } from "../../services/audit.js";
import { notify } from "../notifications/dispatch.js";
import { buildOverdueTasksNotification } from "../notifications/events.js";

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
      // 每家公司汇总一条即发即忘通知；投递失败不会让本次调度任务失败重试。
      notify(buildOverdueTasksNotification({ companyId: row.company_id, overdue }));
    }
  }
}

/**
 * 质保金到期扫描（V13 残留 11）。
 *
 * 合同的质保金期次到了释放日仍未付清时，生成一条任务提醒出纳。
 *
 * ## 为什么必须有这个扫描
 *
 * 质保金的性质就是「一年后才付」——而一年后没人会记得。到期日存在库里
 * 却没人看，那笔钱会一直挂着，直到供应商来催。
 *
 * ## 幂等：靠 id 而不是查重
 *
 * 任务 id 由 `schedule_id` 派生（`task-retention-<scheduleId>`），
 * `on conflict do nothing` 保证重复扫描不会堆出一串一模一样的提醒。
 * 用「先查有没有再插」在并发下会双双查到没有然后双双插入。
 */
async function retentionReleaseScan(ctx: JobContext): Promise<void> {
  const rows = await query<{
    schedule_id: string;
    company_id: string;
    contract_no: string;
    counterparty_name: string;
    amount_cents: string;
    paid_cents: string;
    release_date: string;
  }>(
    `select s.id as schedule_id, s.company_id, c.contract_no, c.counterparty_name,
            s.amount_cents,
            coalesce((select sum(p.amount_cents) from payments p
                       where p.schedule_id = s.id and p.status = 'paid'), 0) as paid_cents,
            to_char(s.retention_release_date, 'YYYY-MM-DD') as release_date
       from contract_payment_schedules s
       join contracts c on c.id = s.contract_id
      where s.schedule_type = 'retention'
        and not s.is_cancelled
        and s.retention_release_date is not null
        -- 到期当天就该提醒，闭区间——与质保金释放判定一致。
        and s.retention_release_date <= current_date`
  );

  for (const row of rows) {
    const remaining = Number(row.amount_cents) - Number(row.paid_cents);
    // 已付清的不提醒。这个判据是**账上的付款汇总**而不是期次上的状态字段——
    // 与整个 V13 一致：状态可以被人改，账不能。
    if (remaining <= 0) continue;

    await query(
      `insert into tasks (id, company_id, title, description, status, priority, source, due_at)
       values ($1, $2, $3, $4, 'not_started', 'medium', 'workflow', $5::date)
       on conflict (id) do nothing`,
      [
        `task-retention-${row.schedule_id}`,
        row.company_id,
        `质保金到期待释放：${row.contract_no}`,
        `${row.counterparty_name} 的合同 ${row.contract_no} 质保金 ` +
          `${(remaining / 100).toFixed(2)} 元已于 ${row.release_date} 到期，可以付款了。`,
        row.release_date
      ]
    );

    writeAudit({
      companyId: row.company_id,
      action: "jobs.retention_release_scan",
      resourceType: "contract_payment_schedule",
      resourceId: row.schedule_id,
      resourceLabel: `${row.contract_no} 质保金到期`,
      changes: { remainingCents: remaining, releaseDate: row.release_date, jobId: ctx.id }
    });
  }
}

export const JOB_HANDLERS: Record<string, JobHandler> = {
  overdue_task_scan: overdueTaskScan,
  retention_release_scan: retentionReleaseScan
};

export function isKnownJobKind(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(JOB_HANDLERS, kind);
}
