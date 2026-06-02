/**
 * P4 社保联动：工资关账 → 自动生成社保申报 + 三险一金凭证
 *
 * 触发：对某个已全部确认的工资期间执行关账，自动：
 *   1. 聚合该期三险一金（社保/公积金，单位/个人）
 *   2. 生成「社保申报」经营事项 + 财务申报任务
 *   3. 自动生成「计提」「缴纳」两张记账凭证草稿（借贷平衡）
 *
 * 实际申报文件仍走既有 /api/tax-integration/si-csv、fund-csv 导出。
 */

import { query, queryOne, withTransaction } from "../../db/client.js";
import { writeAudit } from "../../services/audit.js";
import {
  buildSocialSecurityVouchers,
  isBalanced,
  type SocialSecuritySummary,
  type SocialSecurityVoucherDraft,
} from "./social-security-vouchers.js";

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface PeriodAggregate {
  headcount: number;
  draftCount: number;
  ssEmployer: number;
  ssEmployee: number;
  hfEmployer: number;
  hfEmployee: number;
}

async function aggregatePeriod(companyId: string, period: string): Promise<PeriodAggregate> {
  const row = await queryOne<{
    headcount: string; draft_count: string;
    ss_employer: string | null; ss_employee: string | null;
    hf_employer: string | null; hf_employee: string | null;
  }>(
    `SELECT
       count(*)::text as headcount,
       count(*) FILTER (WHERE status <> 'confirmed')::text as draft_count,
       sum(social_security_employer) FILTER (WHERE status = 'confirmed') as ss_employer,
       sum(social_security_employee) FILTER (WHERE status = 'confirmed') as ss_employee,
       sum(housing_fund_employer)    FILTER (WHERE status = 'confirmed') as hf_employer,
       sum(housing_fund_employee)    FILTER (WHERE status = 'confirmed') as hf_employee
     FROM payroll_records WHERE company_id = $1 AND period = $2`,
    [companyId, period],
  );
  return {
    headcount: parseInt(row?.headcount ?? "0", 10),
    draftCount: parseInt(row?.draft_count ?? "0", 10),
    ssEmployer: Number(row?.ss_employer ?? 0),
    ssEmployee: Number(row?.ss_employee ?? 0),
    hfEmployer: Number(row?.hf_employer ?? 0),
    hfEmployee: Number(row?.hf_employee ?? 0),
  };
}

export interface ClosureResult {
  eventId: string;
  taskId: string;
  voucherIds: string[];
  summary: SocialSecuritySummary;
}

export async function generateSocialSecurityClosure(
  companyId: string,
  period: string,
  userId: string,
): Promise<ClosureResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error("period 格式应为 YYYY-MM");
  }

  const agg = await aggregatePeriod(companyId, period);
  if (agg.headcount === 0) {
    throw new Error(`期间 ${period} 没有工资记录`);
  }
  if (agg.draftCount > 0) {
    throw new Error(`期间 ${period} 仍有 ${agg.draftCount} 条工资记录未确认，请先全部确认再关账`);
  }

  const summary: SocialSecuritySummary = {
    period,
    socialSecurityEmployer: agg.ssEmployer,
    socialSecurityEmployee: agg.ssEmployee,
    housingFundEmployer: agg.hfEmployer,
    housingFundEmployee: agg.hfEmployee,
  };

  const drafts = buildSocialSecurityVouchers(summary);
  for (const d of drafts) {
    if (!isBalanced(d)) throw new Error(`生成的凭证「${d.summary}」借贷不平衡，已中止`);
  }

  const eventId = genId("evt-si");
  const taskId = genId("tsk-si");
  const now = new Date().toISOString();
  const totalContribution = summary.socialSecurityEmployer + summary.socialSecurityEmployee +
    summary.housingFundEmployer + summary.housingFundEmployee;

  const voucherIds = await withTransaction(async (client) => {
    // 1. 社保申报经营事项
    await client.query(
      `INSERT INTO business_events
         (id, company_id, type, title, description, department, occurred_on,
          amount, currency, status, source, created_at, updated_at)
       VALUES ($1,$2,'social_security_filing',$3,$4,'财务',$5,$6,'CNY','analyzed','ai',$7,$7)`,
      [
        eventId, companyId,
        `${period} 社保公积金申报`,
        `${period} 工资关账，三险一金合计 ¥${totalContribution.toFixed(2)}（${agg.headcount} 人）。请核对并提交社保/公积金申报，已自动生成计提与缴纳凭证草稿。`,
        `${period}-01`, totalContribution, now,
      ],
    );

    // 2. 申报任务
    await client.query(
      `INSERT INTO tasks
         (id, company_id, business_event_id, title, description, status, priority, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'not_started','high','social_security_filing',$6,$6)`,
      [
        taskId, companyId, eventId,
        `${period} 社保公积金申报`,
        `导出社保费/住房公积金申报文件并提交，核对自动生成的三险一金凭证。`,
        now,
      ],
    );

    // 3. 三险一金凭证草稿（四表：draft + draft_lines + voucher + voucher_lines）
    const ids: string[] = [];
    for (const draft of drafts) {
      const mappingId = genId("ssd");
      const voucherId = genId("ssv");
      ids.push(voucherId);

      await client.query(
        `INSERT INTO event_voucher_drafts
           (id, company_id, business_event_id, voucher_type, status, summary, created_at)
         VALUES ($1,$2,$3,$4,'draft',$5,$6::timestamptz)`,
        [mappingId, companyId, eventId, draft.voucherType, draft.summary, now],
      );
      await client.query(
        `INSERT INTO vouchers
           (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, source, approved_at, posted_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'draft','analysis',null,null,$7::timestamptz,$7::timestamptz)`,
        [voucherId, companyId, eventId, mappingId, draft.voucherType, draft.summary, now],
      );

      for (const [index, l] of draft.lines.entries()) {
        await client.query(
          `INSERT INTO voucher_draft_lines
             (id, draft_id, summary, account_code, account_name, debit, credit, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8)`,
          [`${mappingId}-line-${index + 1}`, mappingId, l.summary, l.accountCode, l.accountName, l.debit, l.credit, index],
        );
        await client.query(
          `INSERT INTO voucher_lines
             (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8)`,
          [`${voucherId}-line-${index + 1}`, voucherId, l.summary, l.accountCode, l.accountName, l.debit, l.credit, index],
        );
      }
    }
    return ids;
  });

  writeAudit({
    companyId, userId, action: "payroll.social_security.closed",
    resourceType: "payroll_period", resourceLabel: period,
    changes: { eventId, taskId, voucherIds, totalContribution: Number(totalContribution.toFixed(2)) },
  });

  return { eventId, taskId, voucherIds, summary };
}
