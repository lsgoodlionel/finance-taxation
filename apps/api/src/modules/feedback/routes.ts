/**
 * Phase9 任务2：反馈与升级需求 HTTP 路由
 * POST /api/feedback                 提交反馈
 * GET  /api/feedback                 反馈列表
 * POST /api/feedback/consolidate     将开放反馈浓缩为升级需求草案
 * GET  /api/proposals                升级需求列表
 * POST /api/proposals/:id/decide     决策者审批（approve/reject/in_development）
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { consolidateFeedback, type FeedbackItem } from "./consolidate.js";

function genId(p: string): string { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export async function submitFeedback(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const b = (req.body ?? {}) as { category?: string; title?: string; content?: string; module?: string };
  if (!b.title?.trim()) { json(res, 400, { error: "title 为必填项" }); return; }
  const id = genId("fb");
  const category = ["bug", "suggestion", "question"].includes(b.category ?? "") ? b.category : "suggestion";
  await query(
    `INSERT INTO feedback (id, company_id, user_id, user_name, category, title, content, module, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
    [id, cid, req.auth!.userId ?? null, req.auth!.username ?? "", category, b.title.trim(), b.content ?? "", b.module ?? ""],
  );
  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "feedback.submitted", resourceType: "feedback", resourceId: id });
  json(res, 201, { id, ok: true });
}

export async function listFeedback(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const status = url.searchParams.get("status");
  const params: unknown[] = [req.auth!.companyId];
  let where = "company_id=$1";
  if (status) where += ` AND status=$${params.push(status)}`;
  const items = await query(
    `SELECT id, user_name, category, title, content, module, status, votes, proposal_id, created_at
     FROM feedback WHERE ${where} ORDER BY created_at DESC LIMIT 200`, params);
  json(res, 200, { items, total: items.length });
}

export async function consolidateFeedbackRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const open = await query<FeedbackItem & { id: string }>(
    "SELECT id, category, title, module, votes FROM feedback WHERE company_id=$1 AND status='open' ORDER BY votes DESC, created_at DESC LIMIT 100",
    [cid]);
  const proposal = consolidateFeedback(open);
  if (!proposal) { json(res, 400, { error: "暂无待浓缩的开放反馈" }); return; }

  const id = genId("prop");
  await query(
    `INSERT INTO upgrade_proposals (id, company_id, title, summary, priority, source_count, source_ids, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted',now(),now())`,
    [id, cid, proposal.title, proposal.summary, proposal.priority, proposal.sourceCount, JSON.stringify(proposal.sourceIds)]);
  // 标记来源反馈已并入
  await query("UPDATE feedback SET status='merged', proposal_id=$1 WHERE company_id=$2 AND id = ANY($3)",
    [id, cid, proposal.sourceIds]);

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "feedback.consolidated", resourceType: "upgrade_proposal", resourceId: id, changes: { sourceCount: proposal.sourceCount } });
  json(res, 201, { id, ok: true, ...proposal });
}

export async function listProposals(req: ApiRequest, res: ServerResponse): Promise<void> {
  const items = await query(
    `SELECT id, title, summary, priority, source_count, status, decided_by_name, decided_at, decision_note, created_at
     FROM upgrade_proposals WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.auth!.companyId]);
  json(res, 200, { items, total: items.length });
}

const VALID_DECISIONS = ["approved", "rejected", "in_development", "done"];

export async function decideProposal(req: ApiRequest, res: ServerResponse, id: string): Promise<void> {
  const cid = req.auth!.companyId;
  const b = (req.body ?? {}) as { decision?: string; note?: string };
  if (!VALID_DECISIONS.includes(b.decision ?? "")) { json(res, 400, { error: "decision 非法" }); return; }
  const row = await queryOne<{ id: string }>("SELECT id FROM upgrade_proposals WHERE id=$1 AND company_id=$2", [id, cid]);
  if (!row) { json(res, 404, { error: "升级需求不存在" }); return; }
  await query(
    `UPDATE upgrade_proposals SET status=$1, decided_by=$2, decided_by_name=$3, decided_at=now(), decision_note=$4, updated_at=now()
     WHERE id=$5 AND company_id=$6`,
    [b.decision, req.auth!.userId ?? null, req.auth!.username ?? "", b.note ?? "", id, cid]);
  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "proposal.decided", resourceType: "upgrade_proposal", resourceId: id, changes: { decision: b.decision } });
  json(res, 200, { ok: true, decision: b.decision });
}
