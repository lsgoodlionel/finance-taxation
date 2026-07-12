/**
 * 定时任务/工作流的调度核心（D3）。
 *
 * 承接定时报税/对账/OCR 的重试与退避策略——纯函数、可测。真实队列 runtime
 * （pg-boss / BullMQ，跨天多步申报评估 Temporal）在此核心之上落地：这里只
 * 决定「失败后何时重试/是否放弃」「哪些任务到点可执行」，与存储/传输解耦。
 */

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** 每次尝试的倍增因子，默认 2（指数退避）。 */
  factor?: number;
}

/** 第 attempt 次（从 1 起）失败后的退避毫秒数，封顶 maxMs。 */
export function computeBackoffMs(attempt: number, opts: BackoffOptions): number {
  const factor = opts.factor ?? 2;
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const raw = opts.baseMs * factor ** (safeAttempt - 1);
  return Math.min(opts.maxMs, Math.round(raw));
}

export interface RetriableJob {
  attempts: number;
  maxAttempts: number;
}

export interface RetryPlan {
  shouldRetry: boolean;
  /** 下次执行时间（ISO），放弃时为 null。 */
  nextRunAt: string | null;
  reason: string;
}

/** 一次失败后是否重试及下次时间。`nowMs`/ISO 由调用方注入以保证确定性。 */
export function planRetry(
  job: RetriableJob,
  nowMs: number,
  opts: BackoffOptions
): RetryPlan {
  if (job.attempts >= job.maxAttempts) {
    return { shouldRetry: false, nextRunAt: null, reason: "已达最大重试次数，进入死信" };
  }
  const delay = computeBackoffMs(job.attempts + 1, opts);
  return {
    shouldRetry: true,
    nextRunAt: new Date(nowMs + delay).toISOString(),
    reason: `第 ${job.attempts + 1} 次重试，退避 ${delay}ms`
  };
}

export interface ScheduledJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "dead";
  /** 计划执行时间（ISO）。 */
  runAt: string;
}

/** 挑出到点且处于 pending 的任务（runAt ≤ now）。 */
export function selectDue<T extends ScheduledJob>(jobs: readonly T[], nowMs: number): T[] {
  return jobs.filter((job) => job.status === "pending" && new Date(job.runAt).getTime() <= nowMs);
}
