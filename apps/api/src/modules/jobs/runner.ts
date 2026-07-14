/**
 * F5 调度 runner：轮询 scheduled_jobs，取到点 pending 任务派发执行，
 * 成功则完成（或按 recurring_interval_ms 重排），失败走 planRetry 指数退避。
 *
 * 退避/重试/选取策略复用 schedule.ts 的纯核心；本文件只做「DB 取数 → 派发 →
 * 落库」以及 setInterval 生命周期。所有错误吞掉，绝不让调度崩掉 API 进程。
 */

import { query } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { planRetry, type BackoffOptions } from "./schedule.js";
import { JOB_HANDLERS, type JobContext } from "./handlers.js";

const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 30_000, maxMs: 60 * 60 * 1000, factor: 2 };
const BATCH_SIZE = 20;

export interface JobRow {
  id: string;
  company_id: string | null;
  kind: string;
  attempts: number;
  max_attempts: number;
  recurring_interval_ms: string | null;
  payload: Record<string, unknown> | null;
}

export interface JobOutcome {
  status: "completed" | "pending" | "dead";
  runAt: string | null;
  attempts: number;
  lastError: string | null;
}

/**
 * 纯函数：给定一次执行结果，决定任务落库后的状态。成功且 recurring 则重排为
 * pending；成功且非 recurring 则 completed；失败则按 planRetry 退避或进死信。
 */
export function resolveJobOutcome(
  job: Pick<JobRow, "attempts" | "max_attempts" | "recurring_interval_ms">,
  success: boolean,
  nowMs: number,
  errorMessage?: string,
  opts: BackoffOptions = DEFAULT_BACKOFF
): JobOutcome {
  if (success) {
    const intervalMs = job.recurring_interval_ms === null ? null : Number(job.recurring_interval_ms);
    if (intervalMs && intervalMs > 0) {
      return { status: "pending", runAt: new Date(nowMs + intervalMs).toISOString(), attempts: 0, lastError: null };
    }
    return { status: "completed", runAt: null, attempts: job.attempts, lastError: null };
  }
  // planRetry 内部按 job.attempts + 1 计算下次退避与死信判定，故传入「本次失败前」
  // 的原始 attempts；对外报告已递增的尝试次数供落库。
  const plan = planRetry({ attempts: job.attempts, maxAttempts: job.max_attempts }, nowMs, opts);
  return {
    status: plan.shouldRetry ? "pending" : "dead",
    runAt: plan.nextRunAt,
    attempts: job.attempts + 1,
    lastError: errorMessage ?? "unknown error"
  };
}

async function runOne(job: JobRow, nowMs: number): Promise<void> {
  const handler = JOB_HANDLERS[job.kind];
  let outcome: JobOutcome;
  if (!handler) {
    outcome = { status: "dead", runAt: null, attempts: job.attempts, lastError: `未知任务类型：${job.kind}` };
  } else {
    const ctx: JobContext = { id: job.id, companyId: job.company_id, payload: job.payload };
    try {
      await handler(ctx);
      outcome = resolveJobOutcome(job, true, nowMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome = resolveJobOutcome(job, false, nowMs, message);
    }
  }
  await query(
    `update scheduled_jobs
        set status=$2, run_at=coalesce($3, run_at), attempts=$4, last_error=$5,
            last_run_at=now(), updated_at=now()
      where id=$1`,
    [job.id, outcome.status, outcome.runAt, outcome.attempts, outcome.lastError]
  );
}

/** 取一批到点 pending 任务并逐个执行。返回处理条数。每个任务独立容错。 */
export async function processDueJobs(nowMs: number = Date.now()): Promise<number> {
  const due = await query<JobRow>(
    `update scheduled_jobs
        set status='running', updated_at=now()
      where id in (
        select id from scheduled_jobs
         where status='pending' and run_at <= now()
         order by run_at asc
         limit ${BATCH_SIZE}
         for update skip locked
      )
      returning id, company_id, kind, attempts, max_attempts, recurring_interval_ms, payload`
  );
  for (const job of due) {
    try {
      await runOne(job, nowMs);
    } catch (error) {
      logger.error("scheduled job failed to settle", { jobId: job.id, error: String(error) });
    }
  }
  return due.length;
}

export interface SchedulerHandle {
  stop: () => void;
}

/** 启动轮询调度；返回可停止的句柄。异常全部吞掉，不影响 API 进程。 */
export function startScheduler(intervalMs: number): SchedulerHandle {
  const timer = setInterval(() => {
    processDueJobs().catch((error) => logger.error("scheduler tick failed", { error: String(error) }));
  }, intervalMs);
  timer.unref?.();
  logger.info("scheduler started", { intervalMs });
  return {
    stop: () => clearInterval(timer)
  };
}
