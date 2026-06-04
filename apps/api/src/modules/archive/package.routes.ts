/**
 * Phase9-F9 财税资料包沉淀
 * GET /api/archive/package?period=YYYY-MM
 *
 * 按会计期间汇总财税业务链路各环节的产物，形成可审查、可留档的
 * 「企业财税管理资料包」清单（对内管理 + 对外申报审查的最终资料）。
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";

interface Section {
  stage: string;       // 链路环节
  label: string;
  count: number;
  detail: string;
  complete: boolean;
}

async function num(sql: string, params: unknown[]): Promise<number> {
  const r = await queryOne<{ n: string }>(sql, params);
  return parseInt(r?.n ?? "0", 10);
}

export async function getArchivePackage(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const cid = req.auth!.companyId;
  if (!/^\d{4}-\d{2}$/.test(period)) { json(res, 400, { error: "period 格式应为 YYYY-MM" }); return; }

  const ym = (col: string) => `to_char(${col},'YYYY-MM')=$2`;

  const [company, events, docs, vouchersPosted, vouchersDraft, reports, taxSubs, riskOpen, riskClosed, auditCount, payroll, locked] = await Promise.all([
    queryOne<{ name: string; credit_code: string | null }>("SELECT name, credit_code FROM companies WHERE id=$1", [cid]),
    num(`SELECT count(*)::text n FROM business_events WHERE company_id=$1 AND ${ym("occurred_on")}`, [cid, period]),
    num(`SELECT count(*)::text n FROM generated_documents WHERE company_id=$1 AND ${ym("created_at")}`, [cid, period]),
    num(`SELECT count(*)::text n FROM vouchers WHERE company_id=$1 AND status='posted' AND ${ym("created_at")}`, [cid, period]),
    num(`SELECT count(*)::text n FROM vouchers WHERE company_id=$1 AND status='draft' AND ${ym("created_at")}`, [cid, period]),
    num("SELECT count(*)::text n FROM report_snapshots WHERE company_id=$1 AND period_label=$2", [cid, period]),
    num("SELECT count(*)::text n FROM tax_declaration_submissions WHERE company_id=$1 AND filing_period=$2", [cid, period]),
    num(`SELECT count(*)::text n FROM risk_findings WHERE company_id=$1 AND status='open'`, [cid]),
    num(`SELECT count(*)::text n FROM risk_findings WHERE company_id=$1 AND status<>'open'`, [cid]),
    num(`SELECT count(*)::text n FROM audit_logs WHERE company_id=$1 AND ${ym("created_at")}`, [cid, period]),
    num("SELECT count(*)::text n FROM payroll_records WHERE company_id=$1 AND period=$2 AND status='confirmed'", [cid, period]),
    queryOne<{ is_locked: boolean }>("SELECT is_locked FROM accounting_periods WHERE company_id=$1 AND period=$2", [cid, period]),
  ]);

  const sections: Section[] = [
    { stage: "events", label: "经营事项", count: events, detail: `${events} 项事项`, complete: events > 0 },
    { stage: "documents", label: "原始单据", count: docs, detail: `${docs} 份单据`, complete: docs > 0 },
    { stage: "vouchers", label: "记账凭证", count: vouchersPosted, detail: `已过账 ${vouchersPosted} 张${vouchersDraft > 0 ? `，待过账 ${vouchersDraft} 张` : ""}`, complete: vouchersDraft === 0 && vouchersPosted >= 0 },
    { stage: "payroll", label: "工资社保", count: payroll, detail: payroll > 0 ? `${payroll} 人工资已确认` : "本期无工资记录", complete: true },
    { stage: "reports", label: "财务报表", count: reports, detail: reports > 0 ? `${reports} 张报表快照` : "未生成报表", complete: reports > 0 },
    { stage: "tax", label: "税务申报", count: taxSubs, detail: taxSubs > 0 ? `${taxSubs} 份申报资料` : "未生成申报", complete: taxSubs > 0 },
    { stage: "risk", label: "风险勾稽", count: riskClosed, detail: `已关闭 ${riskClosed} 项${riskOpen > 0 ? `，未关闭 ${riskOpen} 项` : ""}`, complete: riskOpen === 0 },
    { stage: "audit", label: "审计留痕", count: auditCount, detail: `${auditCount} 条操作留痕`, complete: auditCount > 0 },
  ];

  const completeCount = sections.filter((s) => s.complete).length;
  const isLocked = locked?.is_locked ?? false;

  json(res, 200, {
    period,
    company: { name: company?.name ?? "", creditCode: company?.credit_code ?? "" },
    sections,
    completeCount,
    total: sections.length,
    archived: isLocked,
    readyToArchive: completeCount === sections.length,
    generatedAt: new Date().toISOString(),
  });
}
