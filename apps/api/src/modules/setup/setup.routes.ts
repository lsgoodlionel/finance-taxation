/**
 * 设置就绪度（P2-8 快速开始后端）
 * GET /api/setup/status
 *
 * 检查关键主数据是否配置，引导新企业跑通首月。
 */

import type { ServerResponse } from "node:http";
import { queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";

export interface SetupItem {
  key: string;
  label: string;
  done: boolean;
  actionPath: string;
  hint: string;
}

async function num(sql: string, params: unknown[]): Promise<number> {
  const row = await queryOne<{ n: string }>(sql, params);
  return parseInt(row?.n ?? "0", 10);
}

export async function getSetupStatus(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;

  const company = await queryOne<{ credit_code: string | null }>(
    "SELECT credit_code FROM companies WHERE id=$1", [cid]);
  const taxpayers = await num("SELECT count(*)::text n FROM taxpayer_profiles WHERE company_id=$1", [cid]);
  const policy = await num("SELECT count(*)::text n FROM payroll_policy WHERE company_id=$1", [cid]);
  const employees = await num("SELECT count(*)::text n FROM employees WHERE company_id=$1 AND status='active'", [cid]);
  const salaryAccounts = await num("SELECT count(*)::text n FROM employees WHERE company_id=$1 AND status='active' AND coalesce(salary_account,'')<>''", [cid]);
  const banks = await num("SELECT count(*)::text n FROM bank_accounts WHERE company_id=$1", [cid]);

  const items: SetupItem[] = [
    { key: "company", label: "完善公司信息", done: !!company?.credit_code, actionPath: "/settings",
      hint: "填写统一社会信用代码、开户行等档案" },
    { key: "taxpayer", label: "配置纳税人档案", done: taxpayers > 0, actionPath: "/tax",
      hint: "设置一般/小规模纳税人口径，决定税率与申报" },
    { key: "policy", label: "设置工资政策", done: policy > 0, actionPath: "/payroll",
      hint: "五险一金费率、个税起征点" },
    { key: "employees", label: "录入员工", done: employees > 0, actionPath: "/payroll",
      hint: "建立员工档案以计算工资与社保" },
    { key: "salary_accounts", label: "维护工资账号", done: employees > 0 && salaryAccounts >= employees, actionPath: "/payroll/transfer",
      hint: "录入工资卡号，代发批次才能完整生成" },
    { key: "bank", label: "添加银行账户", done: banks > 0, actionPath: "/banking",
      hint: "登记对公账户，导入流水并对账" },
  ];

  const doneCount = items.filter((i) => i.done).length;
  json(res, 200, { items, doneCount, total: items.length, ready: doneCount === items.length });
}
