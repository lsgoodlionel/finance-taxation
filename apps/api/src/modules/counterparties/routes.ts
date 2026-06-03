/**
 * P7-B2 往来单位主数据 HTTP 路由
 * GET   /api/counterparties          列表（登记档案 + 应收应付画像）
 * POST  /api/counterparties          新建
 * PATCH /api/counterparties/:id      修改
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";

interface PortraitRow {
  name: string;
  ar: number;        // 应收（作为客户，销项发票合计）
  arCount: number;
  ap: number;        // 应付（作为供应商，进项发票合计）
  apCount: number;
}

async function loadPortraits(companyId: string): Promise<Map<string, PortraitRow>> {
  const ar = await query<{ name: string; total: string; cnt: string }>(
    `SELECT buyer_name name, sum(total_amount)::text total, count(*)::text cnt
     FROM invoices WHERE company_id=$1 AND direction='output' AND buyer_name<>'' GROUP BY buyer_name`,
    [companyId],
  );
  const ap = await query<{ name: string; total: string; cnt: string }>(
    `SELECT seller_name name, sum(total_amount)::text total, count(*)::text cnt
     FROM invoices WHERE company_id=$1 AND direction='input' AND seller_name<>'' GROUP BY seller_name`,
    [companyId],
  );
  const map = new Map<string, PortraitRow>();
  const ensure = (n: string) => {
    if (!map.has(n)) map.set(n, { name: n, ar: 0, arCount: 0, ap: 0, apCount: 0 });
    return map.get(n)!;
  };
  for (const r of ar) { const p = ensure(r.name); p.ar = Number(r.total); p.arCount = Number(r.cnt); }
  for (const r of ap) { const p = ensure(r.name); p.ap = Number(r.total); p.apCount = Number(r.cnt); }
  return map;
}

export async function listCounterparties(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const [registry, portraits] = await Promise.all([
    query<{
      id: string; name: string; category: string; tax_no: string; contact_name: string;
      contact_phone: string; credit_limit: string; credit_days: number; risk_level: string; notes: string;
    }>("SELECT * FROM counterparties WHERE company_id=$1 ORDER BY name", [cid]),
    loadPortraits(cid),
  ]);

  const byName = new Map(registry.map((r) => [r.name, r]));
  const names = new Set<string>([...byName.keys(), ...portraits.keys()]);

  const items = Array.from(names).map((name) => {
    const reg = byName.get(name);
    const p = portraits.get(name);
    return {
      id: reg?.id ?? null,
      name,
      category: reg?.category ?? (p && p.ar > 0 && p.ap > 0 ? "both" : p && p.ar > 0 ? "customer" : p && p.ap > 0 ? "supplier" : "both"),
      taxNo: reg?.tax_no ?? "",
      contactName: reg?.contact_name ?? "",
      contactPhone: reg?.contact_phone ?? "",
      creditLimit: reg ? Number(reg.credit_limit) : 0,
      creditDays: reg?.credit_days ?? 0,
      riskLevel: reg?.risk_level ?? "normal",
      notes: reg?.notes ?? "",
      receivable: p?.ar ?? 0,
      receivableCount: p?.arCount ?? 0,
      payable: p?.ap ?? 0,
      payableCount: p?.apCount ?? 0,
      registered: !!reg,
    };
  }).sort((a, b) => (b.receivable + b.payable) - (a.receivable + a.payable));

  json(res, 200, { items, total: items.length });
}

export async function createCounterparty(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!b.name) { json(res, 400, { error: "name 为必填项" }); return; }
  const id = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await query(
      `INSERT INTO counterparties (id, company_id, name, category, tax_no, contact_name, contact_phone, credit_limit, credit_days, risk_level, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())`,
      [id, cid, b.name, b.category ?? "both", b.taxNo ?? "", b.contactName ?? "", b.contactPhone ?? "",
       b.creditLimit ?? 0, b.creditDays ?? 0, b.riskLevel ?? "normal", b.notes ?? ""],
    );
    writeAudit({ companyId: cid, userId: req.auth!.userId, action: "counterparty.created", resourceType: "counterparty", resourceId: id });
    json(res, 201, { id, ok: true });
  } catch {
    json(res, 400, { error: "往来单位名称已存在或参数有误" });
  }
}

export async function updateCounterparty(req: ApiRequest, res: ServerResponse, id: string): Promise<void> {
  const cid = req.auth!.companyId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const existing = await queryOne<{ id: string }>("SELECT id FROM counterparties WHERE id=$1 AND company_id=$2", [id, cid]);
  if (!existing) { json(res, 404, { error: "往来单位不存在" }); return; }
  await query(
    `UPDATE counterparties SET category=$1, tax_no=$2, contact_name=$3, contact_phone=$4,
       credit_limit=$5, credit_days=$6, risk_level=$7, notes=$8, updated_at=now()
     WHERE id=$9 AND company_id=$10`,
    [b.category ?? "both", b.taxNo ?? "", b.contactName ?? "", b.contactPhone ?? "",
     b.creditLimit ?? 0, b.creditDays ?? 0, b.riskLevel ?? "normal", b.notes ?? "", id, cid],
  );
  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "counterparty.updated", resourceType: "counterparty", resourceId: id });
  json(res, 200, { ok: true });
}
