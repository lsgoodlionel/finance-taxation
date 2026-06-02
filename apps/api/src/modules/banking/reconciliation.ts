/**
 * P3 对账引擎
 *
 * 核心算法：多策略置信度评分
 *   策略1  金额完全匹配（±容差）     +50分
 *   策略2  日期接近程度               +30分（同日+30, 1天+25, 3天+15, 7天+5）
 *   策略3  摘要关键词匹配             +20分
 *   策略4  对方名称与凭证摘要相关     +10分（bonus）
 *
 * 评分规则：
 *   ≥ 85 → auto 自动确认（写入 bank_statements.match_status='auto'）
 *   50–84 → suggest 建议确认（写入 reconciliation_candidates 待人工确认）
 *   < 50  → unmatched（保留，超时自动创建经营事项）
 *
 * 未匹配流水处理：
 *   超过 N 天（默认5天）无匹配 → 自动创建 BusinessEvent（type=bank_unmatched）
 *   + Task（财务手动核查）
 */

import { query, queryOne } from "../../db/client.js";
import { writeAudit } from "../../services/audit.js";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface BankStmt {
  id: string;
  transaction_date: string;
  amount: string;
  counterparty_name: string | null;
  counterparty_no: string | null;
  description: string | null;
}

export interface VoucherCandidate {
  id: string;
  total_debit: string;
  created_at: string;
  summary: string;
}

export interface MatchResult {
  statementId: string;
  voucherId: string | null;
  score: number;
  reasons: string[];
  amountDiff: number;
  dateDiffDays: number;
}

export interface ReconRules {
  amountTolerance: number;
  dateWindowDays: number;
  autoConfirmThreshold: number;
  unmatchedEventDays: number;
  keywordWeights: Record<string, number>;
}

// ── 默认规则 ──────────────────────────────────────────────────────────────────

export const DEFAULT_RULES: ReconRules = {
  amountTolerance: 0.01,
  dateWindowDays: 3,
  autoConfirmThreshold: 85,
  unmatchedEventDays: 5,
  keywordWeights: { 工资: 15, 薪资: 15, 代发: 15, 货款: 10, 回款: 10, 付款: 10 },
};

async function loadRules(companyId: string): Promise<ReconRules> {
  const row = await queryOne<{
    amount_tolerance: string;
    date_window_days: number;
    auto_confirm_threshold: number;
    unmatched_event_days: number;
    keyword_weights: Record<string, number> | null;
  }>("SELECT * FROM reconciliation_rules WHERE company_id = $1", [companyId]);

  if (!row) return DEFAULT_RULES;
  return {
    amountTolerance:      parseFloat(row.amount_tolerance),
    dateWindowDays:       row.date_window_days,
    autoConfirmThreshold: row.auto_confirm_threshold,
    unmatchedEventDays:   row.unmatched_event_days,
    keywordWeights:       row.keyword_weights ?? DEFAULT_RULES.keywordWeights,
  };
}

// ── 评分算法 ──────────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(a - b) / 86400000);
}

function scoreDateProximity(diffDays: number): number {
  if (diffDays === 0) return 30;
  if (diffDays <= 1)  return 25;
  if (diffDays <= 3)  return 15;
  if (diffDays <= 7)  return 5;
  return 0;
}

function scoreKeywords(
  text: string | null | undefined,
  weights: Record<string, number>,
): { score: number; reasons: string[] } {
  if (!text) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  let total = 0;
  for (const [word, weight] of Object.entries(weights)) {
    if (text.includes(word)) { total += weight; reasons.push(`摘要含"${word}"`); }
  }
  return { score: Math.min(total, 20), reasons };  // cap at 20
}

function scoreAmountMatch(
  stmtAmt: number,
  voucherAmt: number,
  tolerance: number,
): { score: number; diff: number } {
  const diff = Math.abs(Math.abs(stmtAmt) - voucherAmt);
  if (diff <= tolerance) return { score: 50, diff };
  if (diff <= 1)         return { score: 35, diff };
  if (diff <= 100)       return { score: 15, diff };
  return { score: 0, diff };
}

export function computeMatchScore(
  stmt: BankStmt,
  voucher: VoucherCandidate,
  rules: ReconRules,
): MatchResult {
  const stmtAmt   = parseFloat(stmt.amount);
  const voucherAmt = parseFloat(voucher.total_debit);
  const reasons: string[] = [];

  // 金额
  const { score: amtScore, diff: amountDiff } = scoreAmountMatch(stmtAmt, voucherAmt, rules.amountTolerance);
  if (amtScore === 50) reasons.push("金额完全匹配");
  else if (amtScore > 0) reasons.push(`金额接近（差 ¥${amountDiff.toFixed(2)}）`);

  // 日期
  const dateDiffDays = daysBetween(stmt.transaction_date, voucher.created_at.slice(0, 10));
  const dateScore = scoreDateProximity(dateDiffDays);
  if (dateDiffDays === 0) reasons.push("日期一致");
  else if (dateScore > 0) reasons.push(`日期相差 ${dateDiffDays} 天`);

  // 关键词（流水摘要 + 对方名称 vs 凭证摘要）
  const combinedText = [stmt.description, stmt.counterparty_name, voucher.summary].join(" ");
  const { score: kwScore, reasons: kwReasons } = scoreKeywords(combinedText, rules.keywordWeights);
  reasons.push(...kwReasons);

  // 对方名称与凭证摘要交叉匹配（bonus）
  let bonusScore = 0;
  if (stmt.counterparty_name && voucher.summary.includes(stmt.counterparty_name.slice(0, 4))) {
    bonusScore = 10;
    reasons.push("对方名称与凭证摘要相符");
  }

  const total = Math.min(amtScore + dateScore + kwScore + bonusScore, 100);

  return {
    statementId: stmt.id,
    voucherId: voucher.id,
    score: total,
    reasons,
    amountDiff,
    dateDiffDays,
  };
}

// ── 主对账函数 ────────────────────────────────────────────────────────────────

export async function runReconciliation(
  companyId: string,
  options: { statementIds?: string[]; importBatch?: string } = {},
): Promise<{ matched: number; suggested: number; unmatched: number }> {
  const rules = await loadRules(companyId);

  // 取待处理流水
  const params: unknown[] = [companyId];
  let where = "company_id = $1 AND match_status = 'unmatched'";
  if (options.statementIds?.length) {
    where += ` AND id = ANY($${params.push(options.statementIds)})`;
  } else if (options.importBatch) {
    where += ` AND import_batch = $${params.push(options.importBatch)}`;
  }

  const stmts = await query<BankStmt>(
    `SELECT id, transaction_date, amount, counterparty_name, counterparty_no, description
     FROM bank_statements WHERE ${where}`,
    params,
  );

  // 取候选凭证（已过账，最近90天）
  const vouchers = await query<VoucherCandidate>(
    `SELECT v.id, v.summary, v.created_at,
            coalesce((SELECT sum(debit::numeric) FROM voucher_lines WHERE voucher_id=v.id),0)::text as total_debit
     FROM vouchers v
     WHERE v.company_id = $1 AND v.status = 'posted'
       AND v.created_at >= now() - interval '90 days'`,
    [companyId],
  );

  let matched = 0;
  let suggested = 0;
  let unmatched = 0;

  for (const stmt of stmts) {
    // 对每张流水找最高匹配凭证
    let bestMatch: MatchResult | null = null;

    for (const voucher of vouchers) {
      const result = computeMatchScore(stmt, voucher, rules);
      if (result.score > 0 && (!bestMatch || result.score > bestMatch.score)) {
        bestMatch = result;
      }
    }

    if (bestMatch && bestMatch.score >= rules.autoConfirmThreshold) {
      // 自动确认
      await query(
        `UPDATE bank_statements
         SET match_status='auto', matched_voucher_id=$1
         WHERE id=$2 AND company_id=$3`,
        [bestMatch.voucherId, stmt.id, companyId],
      );
      matched++;
    } else if (bestMatch && bestMatch.score >= 50) {
      // 保存候选，等待人工确认
      const candidateId = `rc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await query(
        `INSERT INTO reconciliation_candidates
           (id, company_id, statement_id, voucher_id, score, match_reasons, amount_diff, date_diff_days, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',now())
         ON CONFLICT DO NOTHING`,
        [candidateId, companyId, stmt.id, bestMatch.voucherId, bestMatch.score,
         JSON.stringify(bestMatch.reasons), bestMatch.amountDiff, bestMatch.dateDiffDays],
      );
      suggested++;
    } else {
      unmatched++;
    }
  }

  // 超时未匹配 → 创建经营事项 + 任务
  await createUnmatchedEvents(companyId, rules);

  writeAudit({
    companyId,
    action: "banking.reconciliation.ran",
    resourceType: "bank_statement",
    changes: { matched, suggested, unmatched, totalProcessed: stmts.length },
  });

  return { matched, suggested, unmatched };
}

// ── 超时未匹配流水 → 经营事项 ────────────────────────────────────────────────

async function createUnmatchedEvents(companyId: string, rules: ReconRules) {
  const cutoffDate = new Date(Date.now() - rules.unmatchedEventDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const aged = await query<{
    id: string; transaction_date: string; amount: string; description: string | null;
  }>(
    `SELECT id, transaction_date, amount, description
     FROM bank_statements
     WHERE company_id=$1 AND match_status='unmatched'
       AND transaction_date <= $2
       AND NOT EXISTS (
         SELECT 1 FROM business_events
         WHERE company_id=$1 AND source='bank_unmatched'
           AND description LIKE '%' || bank_statements.id || '%'
       )
     LIMIT 20`,
    [companyId, cutoffDate],
  );

  for (const stmt of aged) {
    const amt = parseFloat(stmt.amount);
    const eventId = `evt-bk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const taskId  = `tsk-bk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    await query(
      `INSERT INTO business_events
         (id, company_id, type, title, description, department, occurred_on,
          amount, currency, status, source, created_at, updated_at)
       VALUES ($1,$2,'bank_unmatched',$3,$4,'财务',
               $5,$6,'CNY','draft','bank_unmatched',$7,$7)`,
      [
        eventId, companyId,
        `待核查银行流水 ${stmt.transaction_date}`,
        `银行流水 ${stmt.id} 已超 ${rules.unmatchedEventDays} 天未匹配凭证，金额 ¥${Math.abs(amt).toFixed(2)}，${amt >= 0 ? "收款" : "付款"}，摘要：${stmt.description ?? "无"}`,
        stmt.transaction_date,
        Math.abs(amt),
        now,
      ],
    );

    await query(
      `INSERT INTO tasks
         (id, company_id, business_event_id, title, description,
          status, priority, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'not_started','high','bank_unmatched',$6,$6)`,
      [
        taskId, companyId, eventId,
        `手动核查银行流水 ${stmt.transaction_date}`,
        `流水金额 ¥${Math.abs(amt).toFixed(2)}（${amt >= 0 ? "收款" : "付款"}），${stmt.transaction_date}，请查找对应凭证或单据并完成对账。`,
        now,
      ],
    );

    // 标记流水已有对应事项
    await query(
      "UPDATE bank_statements SET match_status='unmatched' WHERE id=$1",
      [stmt.id],
    );
  }
}

// ── 候选结果 CRUD ─────────────────────────────────────────────────────────────

export async function listCandidates(companyId: string, status?: string) {
  const params: unknown[] = [companyId];
  let where = "rc.company_id = $1";
  if (status) where += ` AND rc.status = $${params.push(status)}`;

  return query<{
    id: string; statement_id: string; voucher_id: string | null;
    score: number; match_reasons: unknown; amount_diff: string;
    date_diff_days: number; status: string; created_at: string;
    stmt_date: string; stmt_amount: string; stmt_desc: string | null;
    voucher_summary: string | null;
  }>(
    `SELECT rc.*,
            bs.transaction_date as stmt_date, bs.amount as stmt_amount,
            bs.description as stmt_desc,
            v.summary as voucher_summary
     FROM reconciliation_candidates rc
     JOIN bank_statements bs ON bs.id = rc.statement_id
     LEFT JOIN vouchers v ON v.id = rc.voucher_id
     WHERE ${where}
     ORDER BY rc.score DESC, rc.created_at DESC
     LIMIT 200`,
    params,
  );
}

export async function confirmCandidate(
  companyId: string, candidateId: string, reviewedBy: string,
) {
  const candidate = await queryOne<{ statement_id: string; voucher_id: string | null }>(
    "SELECT statement_id, voucher_id FROM reconciliation_candidates WHERE id=$1 AND company_id=$2",
    [candidateId, companyId],
  );
  if (!candidate) throw new Error("候选记录不存在");

  await query(
    "UPDATE reconciliation_candidates SET status='confirmed', reviewed_by=$1, reviewed_at=now() WHERE id=$2",
    [reviewedBy, candidateId],
  );
  await query(
    "UPDATE bank_statements SET match_status='manual', matched_voucher_id=$1 WHERE id=$2 AND company_id=$3",
    [candidate.voucher_id, candidate.statement_id, companyId],
  );

  writeAudit({ companyId, action: "banking.reconciliation.candidate_confirmed",
    resourceType: "reconciliation_candidate", resourceId: candidateId });
}

export async function rejectCandidate(
  companyId: string, candidateId: string, reviewedBy: string,
) {
  await query(
    "UPDATE reconciliation_candidates SET status='rejected', reviewed_by=$1, reviewed_at=now() WHERE id=$2 AND company_id=$3",
    [reviewedBy, candidateId, companyId],
  );
  writeAudit({ companyId, action: "banking.reconciliation.candidate_rejected",
    resourceType: "reconciliation_candidate", resourceId: candidateId });
}

// ── 规则配置 CRUD ─────────────────────────────────────────────────────────────

export async function getReconRules(companyId: string) {
  const row = await queryOne(
    "SELECT * FROM reconciliation_rules WHERE company_id=$1", [companyId],
  );
  return row ?? {
    companyId,
    amountTolerance: DEFAULT_RULES.amountTolerance,
    dateWindowDays:  DEFAULT_RULES.dateWindowDays,
    autoConfirmThreshold: DEFAULT_RULES.autoConfirmThreshold,
    unmatchedEventDays: DEFAULT_RULES.unmatchedEventDays,
    keywordWeights: DEFAULT_RULES.keywordWeights,
  };
}

export async function upsertReconRules(
  companyId: string,
  input: Partial<ReconRules>,
) {
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM reconciliation_rules WHERE company_id=$1", [companyId],
  );

  if (existing) {
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: [keyof ReconRules, string][] = [
      ["amountTolerance", "amount_tolerance"],
      ["dateWindowDays",  "date_window_days"],
      ["autoConfirmThreshold", "auto_confirm_threshold"],
      ["unmatchedEventDays", "unmatched_event_days"],
      ["keywordWeights", "keyword_weights"],
    ];
    for (const [jsKey, dbCol] of map) {
      if (input[jsKey] !== undefined) {
        sets.push(`${dbCol} = $${params.push(jsKey === "keywordWeights" ? JSON.stringify(input[jsKey]) : input[jsKey])}`);
      }
    }
    if (sets.length) {
      sets.push("updated_at = now()");
      params.push(companyId);
      await query(`UPDATE reconciliation_rules SET ${sets.join(",")} WHERE company_id=$${params.length}`, params);
    }
  } else {
    const id = `rr-${Date.now()}`;
    await query(
      `INSERT INTO reconciliation_rules
         (id, company_id, amount_tolerance, date_window_days, auto_confirm_threshold,
          unmatched_event_days, keyword_weights, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())`,
      [id, companyId,
       input.amountTolerance ?? DEFAULT_RULES.amountTolerance,
       input.dateWindowDays  ?? DEFAULT_RULES.dateWindowDays,
       input.autoConfirmThreshold ?? DEFAULT_RULES.autoConfirmThreshold,
       input.unmatchedEventDays   ?? DEFAULT_RULES.unmatchedEventDays,
       JSON.stringify(input.keywordWeights ?? DEFAULT_RULES.keywordWeights)],
    );
  }
}
