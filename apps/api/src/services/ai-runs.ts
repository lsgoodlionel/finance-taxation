/**
 * P6-A1 AI 结果留痕服务
 * 记录每次 AI Agent 运行与结构化输出，供回放/审计/采纳追踪。
 */

import { query, queryOne } from "../db/client.js";

export type AgentType =
  | "accounting" | "completeness" | "tax" | "audit" | "event" | "boss" | "secretary";

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface StartRunInput {
  companyId: string;
  agentType: AgentType;
  inputSummary?: string;
  model?: string;
  createdBy?: string;
}

export async function startAiRun(input: StartRunInput): Promise<string> {
  const id = genId("airun");
  await query(
    `INSERT INTO ai_task_runs (id, company_id, agent_type, status, input_summary, model, created_by, created_at)
     VALUES ($1,$2,$3,'running',$4,$5,$6,now())`,
    [id, input.companyId, input.agentType, input.inputSummary ?? "", input.model ?? "", input.createdBy ?? null],
  );
  return id;
}

export async function finishAiRun(runId: string, durationMs: number, error?: string): Promise<void> {
  await query(
    `UPDATE ai_task_runs SET status=$1, duration_ms=$2, error_message=$3, finished_at=now() WHERE id=$4`,
    [error ? "error" : "done", durationMs, error ?? null, runId],
  );
}

export interface RecordResultInput {
  runId: string;
  companyId: string;
  agentType: AgentType;
  resultType?: "suggestion" | "finding" | "answer" | "draft";
  resourceType?: string;
  resourceId?: string;
  content?: unknown;
  summary?: string;
  sources?: unknown[];
  confidence?: number;
}

export async function recordAiResult(input: RecordResultInput): Promise<string> {
  const id = genId("airs");
  await query(
    `INSERT INTO ai_analysis_results
       (id, run_id, company_id, agent_type, result_type, resource_type, resource_id, content, summary, sources, confidence, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
    [
      id, input.runId, input.companyId, input.agentType, input.resultType ?? "suggestion",
      input.resourceType ?? null, input.resourceId ?? null,
      JSON.stringify(input.content ?? {}), input.summary ?? "",
      JSON.stringify(input.sources ?? []), input.confidence ?? null,
    ],
  );
  return id;
}

/** 便捷封装：包裹一次 AI 调用，自动记录 run + 耗时 + 错误。 */
export async function withAiRun<T>(
  input: StartRunInput,
  fn: (runId: string) => Promise<T>,
): Promise<T> {
  const runId = await startAiRun(input);
  const t0 = Date.now();
  try {
    const result = await fn(runId);
    await finishAiRun(runId, Date.now() - t0);
    return result;
  } catch (err) {
    await finishAiRun(runId, Date.now() - t0, err instanceof Error ? err.message : "unknown");
    throw err;
  }
}

export async function listAiResults(companyId: string, opts: { resourceType?: string; resourceId?: string; agentType?: string } = {}) {
  const params: unknown[] = [companyId];
  let where = "company_id = $1";
  if (opts.resourceType) where += ` AND resource_type = $${params.push(opts.resourceType)}`;
  if (opts.resourceId) where += ` AND resource_id = $${params.push(opts.resourceId)}`;
  if (opts.agentType) where += ` AND agent_type = $${params.push(opts.agentType)}`;
  return query(
    `SELECT id, run_id, agent_type, result_type, resource_type, resource_id, content, summary, sources, confidence, accepted, created_at
     FROM ai_analysis_results WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
    params,
  );
}

export async function setResultAccepted(companyId: string, resultId: string, accepted: boolean): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "UPDATE ai_analysis_results SET accepted=$1 WHERE id=$2 AND company_id=$3 RETURNING id",
    [accepted, resultId, companyId],
  );
  return !!row;
}
