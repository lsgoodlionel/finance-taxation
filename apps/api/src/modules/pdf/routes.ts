import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";
import { wrapHtml, fmt, escHtml } from "./template.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowLabel(): string {
  return new Date().toLocaleString("zh-CN");
}

// ── Payroll Summary PDF ───────────────────────────────────────────────────────

interface PayrollRow {
  id: string;
  employee_name: string;
  gross_salary: string;
  social_security_employee: string;
  social_security_employer: string;
  housing_fund_employee: string;
  housing_fund_employer: string;
  iit_withheld: string;
  net_pay: string;
  status: string;
}

export async function payrollPdf(req: ApiRequest, res: ServerResponse): Promise<void> {
  if (!req.auth) { json(res, 401, { error: "Unauthorized" }); return; }
  const url = new URL(req.url!, `http://localhost`);
  const period = url.searchParams.get("period");
  if (!period) { json(res, 400, { error: "period 参数不能为空" }); return; }

  const rows = await query<PayrollRow>(
    `select id, employee_name,
            gross_salary::text, social_security_employee::text,
            social_security_employer::text, housing_fund_employee::text,
            housing_fund_employer::text, iit_withheld::text, net_pay::text, status
     from payroll_records
     where company_id = $1 and period = $2
     order by employee_name`,
    [req.auth.companyId, period]
  );

  const companyName = (await queryOne<{ name: string }>("select name from companies where id=$1", [req.auth.companyId]))?.name ?? "";

  let totalGross = 0, totalSsEmp = 0, totalSsEr = 0, totalHfEmp = 0, totalHfEr = 0, totalIit = 0, totalNet = 0;
  const dataRows = rows.map((r) => {
    const g = Number(r.gross_salary), ssE = Number(r.social_security_employee), ssR = Number(r.social_security_employer),
      hfE = Number(r.housing_fund_employee), hfR = Number(r.housing_fund_employer),
      iit = Number(r.iit_withheld), net = Number(r.net_pay);
    totalGross += g; totalSsEmp += ssE; totalSsEr += ssR; totalHfEmp += hfE; totalHfEr += hfR; totalIit += iit; totalNet += net;
    return `<tr>
      <td>${escHtml(r.employee_name)}</td>
      <td class="num">${fmt(g)}</td><td class="num">${fmt(ssE)}</td>
      <td class="num">${fmt(ssR)}</td><td class="num">${fmt(hfE)}</td>
      <td class="num">${fmt(hfR)}</td><td class="num">${fmt(iit)}</td>
      <td class="num"><strong>${fmt(net)}</strong></td>
      <td>${r.status === "confirmed" ? "✓ 已确认" : "草稿"}</td>
    </tr>`;
  }).join("");

  const title = `${companyName} ${period} 工资汇总表`;
  const body = `
    <div class="doc-header">
      <div>
        <div class="doc-title">${escHtml(title)}</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">共 ${rows.length} 人</div>
      </div>
      <div class="doc-meta">生成时间：${nowLabel()}</div>
    </div>
    <div class="section">
      <table>
        <thead>
          <tr>
            <th>姓名</th><th class="num">应发工资</th><th class="num">个人社保</th>
            <th class="num">单位社保</th><th class="num">个人公积金</th><th class="num">单位公积金</th>
            <th class="num">个税</th><th class="num">实发工资</th><th>状态</th>
          </tr>
        </thead>
        <tbody>${dataRows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td>合计（${rows.length} 人）</td>
            <td class="num">${fmt(totalGross)}</td><td class="num">${fmt(totalSsEmp)}</td>
            <td class="num">${fmt(totalSsEr)}</td><td class="num">${fmt(totalHfEmp)}</td>
            <td class="num">${fmt(totalHfEr)}</td><td class="num">${fmt(totalIit)}</td>
            <td class="num">${fmt(totalNet)}</td><td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="doc-footer">
      <span>制表：<span class="sig-line"></span></span>
      <span>审核：<span class="sig-line"></span></span>
      <span>批准：<span class="sig-line"></span></span>
    </div>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(wrapHtml(title, body));
}

// ── Individual Payroll Slip ───────────────────────────────────────────────────

interface PolicyRow {
  social_security_base_min: string;
  social_security_base_max: string;
  pension_employee_rate: string;
  medical_employee_rate: string;
  unemployment_employee_rate: string;
  housing_fund_employee_rate: string;
  iit_threshold: string;
}

export async function payrollSlipPdf(req: ApiRequest, res: ServerResponse): Promise<void> {
  if (!req.auth) { json(res, 401, { error: "Unauthorized" }); return; }
  const url = new URL(req.url!, `http://localhost`);
  const period = url.searchParams.get("period");
  const employeeId = url.searchParams.get("employeeId");
  if (!period) { json(res, 400, { error: "period 参数不能为空" }); return; }

  const where = employeeId
    ? "company_id=$1 and period=$2 and employee_id=$3"
    : "company_id=$1 and period=$2";
  const params = employeeId
    ? [req.auth.companyId, period, employeeId]
    : [req.auth.companyId, period];

  const rows = await query<PayrollRow & { employee_id: string }>(
    `select id, employee_id, employee_name,
            gross_salary::text, social_security_employee::text,
            social_security_employer::text, housing_fund_employee::text,
            housing_fund_employer::text, iit_withheld::text, net_pay::text, status
     from payroll_records where ${where} order by employee_name`,
    params
  );

  const [companyRes, policyRes] = await Promise.all([
    queryOne<{ name: string }>("select name from companies where id=$1", [req.auth.companyId]),
    queryOne<PolicyRow>("select * from payroll_policy where company_id=$1", [req.auth.companyId])
  ]);
  const companyName = companyRes?.name ?? "";

  const slips = rows.map((r) => {
    const g = Number(r.gross_salary), ssE = Number(r.social_security_employee),
      hfE = Number(r.housing_fund_employee), iit = Number(r.iit_withheld), net = Number(r.net_pay);
    return `
      <div class="section" style="border:1px solid #ccc;padding:16px;margin-bottom:20px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid #ccc;padding-bottom:8px;margin-bottom:12px;">
          <div>
            <div style="font-size:15px;font-weight:700;">${escHtml(companyName)} — 工资条</div>
            <div style="font-size:12px;color:#555;">期间：${period} &nbsp;|&nbsp; 员工：${escHtml(r.employee_name)}</div>
          </div>
          <div style="font-size:11px;color:#888;">${r.status === "confirmed" ? "✓ 已确认" : "草稿"}</div>
        </div>
        <table>
          <tr><td style="width:50%;border:none;padding:4px 0;">应发工资</td><td style="width:50%;border:none;padding:4px 0;text-align:right;font-weight:700;">¥ ${fmt(g)}</td></tr>
          <tr><td style="border:none;padding:4px 0;color:#555;">— 个人社保（养老+医疗+失业）</td><td style="border:none;padding:4px 0;text-align:right;color:#c0392b;">- ¥ ${fmt(ssE)}</td></tr>
          <tr><td style="border:none;padding:4px 0;color:#555;">— 个人住房公积金</td><td style="border:none;padding:4px 0;text-align:right;color:#c0392b;">- ¥ ${fmt(hfE)}</td></tr>
          <tr><td style="border:none;padding:4px 0;color:#555;">— 代扣个人所得税</td><td style="border:none;padding:4px 0;text-align:right;color:#c0392b;">- ¥ ${fmt(iit)}</td></tr>
          <tr style="border-top:2px solid #333;"><td style="border:none;padding:6px 0;font-weight:700;">实发工资</td><td style="border:none;padding:6px 0;text-align:right;font-weight:700;font-size:15px;color:#1a7f5a;">¥ ${fmt(net)}</td></tr>
        </table>
        ${policyRes ? `<div style="font-size:10px;color:#888;margin-top:8px;">社保基数范围：¥${fmt(Number(policyRes.social_security_base_min))}–¥${fmt(Number(policyRes.social_security_base_max))} | 个税起征点：¥${fmt(Number(policyRes.iit_threshold))}</div>` : ""}
      </div>`;
  }).join("");

  const title = `${companyName} ${period} 工资条`;
  const body = `
    <div class="doc-header">
      <div class="doc-title">${escHtml(title)}</div>
      <div class="doc-meta">生成时间：${nowLabel()}</div>
    </div>
    ${slips || `<p style="color:#aaa;text-align:center;padding:40px;">暂无工资数据</p>`}`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(wrapHtml(title, body));
}

// ── Voucher PDF ───────────────────────────────────────────────────────────────

interface VoucherRow {
  id: string;
  voucher_no: string;
  voucher_type: string;
  summary: string;
  status: string;
  voucher_date: string;
  created_at: string;
}

interface LineRow {
  summary: string;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
}

export async function voucherPdf(req: ApiRequest, res: ServerResponse, voucherId: string): Promise<void> {
  if (!req.auth) { json(res, 401, { error: "Unauthorized" }); return; }

  const [voucher, lines, companyRes] = await Promise.all([
    queryOne<VoucherRow>(
      "select id, voucher_no, voucher_type, summary, status, voucher_date::text, created_at from vouchers where id=$1 and company_id=$2",
      [voucherId, req.auth.companyId]
    ),
    query<LineRow>(
      "select summary, account_code, account_name, debit::text, credit::text from voucher_lines where voucher_id=$1 order by sort_order",
      [voucherId]
    ),
    queryOne<{ name: string }>("select name from companies where id=$1", [req.auth.companyId])
  ]);

  if (!voucher) { json(res, 404, { error: "凭证不存在" }); return; }
  const companyName = companyRes?.name ?? "";

  let totalDebit = 0, totalCredit = 0;
  const lineRows = lines.map((l) => {
    const d = Number(l.debit), c = Number(l.credit);
    totalDebit += d; totalCredit += c;
    return `<tr>
      <td>${escHtml(l.summary)}</td>
      <td>${escHtml(l.account_code)}</td>
      <td>${escHtml(l.account_name)}</td>
      <td class="num">${d > 0 ? fmt(d) : ""}</td>
      <td class="num">${c > 0 ? fmt(c) : ""}</td>
    </tr>`;
  }).join("");

  const title = `记账凭证 ${voucher.voucher_no}`;
  const body = `
    <div class="doc-header">
      <div>
        <div class="doc-title">${escHtml(companyName)}</div>
        <div style="font-size:14px;margin-top:4px;">记账凭证 &nbsp;|&nbsp; ${escHtml(voucher.voucher_no)}</div>
      </div>
      <div class="doc-meta">
        <div>凭证类型：${escHtml(voucher.voucher_type)}</div>
        <div>凭证日期：${voucher.voucher_date}</div>
        <div>状态：${voucher.status}</div>
      </div>
    </div>
    <div class="section">
      <div style="font-size:12px;color:#555;margin-bottom:8px;">摘要：${escHtml(voucher.summary)}</div>
      <table>
        <thead>
          <tr>
            <th style="width:30%">摘要</th>
            <th style="width:12%">科目编码</th>
            <th style="width:28%">科目名称</th>
            <th class="num" style="width:15%">借方金额</th>
            <th class="num" style="width:15%">贷方金额</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="3" style="text-align:right">合计</td>
            <td class="num">${fmt(totalDebit)}</td>
            <td class="num">${fmt(totalCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="doc-footer">
      <span>制单：<span class="sig-line"></span></span>
      <span>审核：<span class="sig-line"></span></span>
      <span>记账：<span class="sig-line"></span></span>
      <span style="color:#888;font-size:10px;">生成时间：${nowLabel()}</span>
    </div>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(wrapHtml(title, body));
}

// ── Report PDF ────────────────────────────────────────────────────────────────

interface SnapshotRow {
  id: string;
  report_type: string;
  period_type: string;
  period_label: string;
  snapshot_date: string;
  payload: unknown;
}

function renderReportTable(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "<pre>" + escHtml(JSON.stringify(payload, null, 2)) + "</pre>";
  const p = payload as Record<string, unknown>;

  const sections: string[] = [];

  function renderSection(title: string, items: unknown): string {
    if (!Array.isArray(items) || items.length === 0) return "";
    const rows = items.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? row.accountName ?? row.label ?? "");
      const val = row.amount ?? row.value ?? row.balance ?? 0;
      const isTotal = String(name).includes("合计") || String(name).includes("总计") || (row as Record<string, unknown>).isTotal;
      const cls = isTotal ? "total-row" : "";
      return `<tr class="${cls}"><td>${escHtml(name)}</td><td class="num">${fmt(Number(val))}</td></tr>`;
    }).join("");
    return `
      <div class="section">
        <div class="section-title">${escHtml(title)}</div>
        <table>
          <thead><tr><th>项目</th><th class="num">金额（元）</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  for (const [key, val] of Object.entries(p)) {
    if (Array.isArray(val)) {
      sections.push(renderSection(key, val));
    } else if (typeof val === "object" && val !== null) {
      const inner = val as Record<string, unknown>;
      for (const [k2, v2] of Object.entries(inner)) {
        if (Array.isArray(v2)) sections.push(renderSection(`${key} / ${k2}`, v2));
      }
    }
  }

  if (sections.filter(Boolean).length === 0) {
    return `<pre style="font-size:11px;background:#f7f7f7;padding:12px;">${escHtml(JSON.stringify(payload, null, 2))}</pre>`;
  }
  return sections.filter(Boolean).join("");
}

export async function reportPdf(req: ApiRequest, res: ServerResponse): Promise<void> {
  if (!req.auth) { json(res, 401, { error: "Unauthorized" }); return; }
  const url = new URL(req.url!, `http://localhost`);
  const snapshotId = url.searchParams.get("snapshotId");
  if (!snapshotId) { json(res, 400, { error: "snapshotId 参数不能为空" }); return; }

  const snapshot = await queryOne<SnapshotRow>(
    "select id, report_type, period_type, period_label, snapshot_date::text, payload from report_snapshots where id=$1 and company_id=$2",
    [snapshotId, req.auth.companyId]
  );
  if (!snapshot) { json(res, 404, { error: "报表快照不存在" }); return; }

  const companyName = (await queryOne<{ name: string }>("select name from companies where id=$1", [req.auth.companyId]))?.name ?? "";

  const TYPE_LABELS: Record<string, string> = {
    balance_sheet: "资产负债表",
    profit_statement: "利润表",
    cash_flow: "现金流量表"
  };
  const typeLabel = TYPE_LABELS[snapshot.report_type] ?? snapshot.report_type;
  const title = `${companyName} ${snapshot.period_label} ${typeLabel}`;

  const body = `
    <div class="doc-header">
      <div>
        <div class="doc-title">${escHtml(title)}</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">期间：${snapshot.period_label} &nbsp;|&nbsp; 快照日期：${snapshot.snapshot_date}</div>
      </div>
      <div class="doc-meta">生成时间：${nowLabel()}</div>
    </div>
    ${renderReportTable(snapshot.payload)}
    <div class="doc-footer">
      <span style="color:#888;font-size:10px;">本报表由系统自动生成，请结合实际业务复核后使用。</span>
    </div>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(wrapHtml(title, body));
}
