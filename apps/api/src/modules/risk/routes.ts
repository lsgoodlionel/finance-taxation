import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import type { RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { listCompanyDocuments } from "../documents/routes.js";
import { getEventDetail, listCompanyEvents, listCompanyTasks } from "../events/routes.js";
import { listCompanyRndProjects } from "../rnd/routes.js";
import { listCompanyTaxFilingBatches, listCompanyTaxItems } from "../tax/routes.js";
import { listCompanyLedgerEntries, listCompanyVouchers } from "../vouchers/routes.js";
import { evaluateRiskFindings } from "./engine.js";
import { scoreRiskFindings } from "./scoring.js";
import { notify } from "../notifications/dispatch.js";
import { buildRiskAlertNotification } from "../notifications/events.js";
import { writeAudit } from "../../services/audit.js";

interface RiskFindingRow {
  id: string;
  company_id: string;
  business_event_id: string | null;
  rule_code: string;
  severity: RiskFinding["severity"];
  status: RiskFinding["status"];
  title: string;
  detail: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RiskClosureRecordRow {
  id: string;
  company_id: string;
  finding_id: string;
  closed_by_user_id: string | null;
  closed_by_name: string;
  resolution: string;
  reviewed_at: string | Date;
}

/** 重扫时被删掉的上一轮发现——留痕需要它的旧状态和标题，光有 id 说不清发生了什么。 */
interface ReplacedFindingRow {
  id: string;
  title: string;
  severity: RiskFinding["severity"];
  status: RiskFinding["status"];
}

/**
 * 风险发现的留痕入口。
 *
 * 痕迹必须落在 finding 自己身上：/risk 的「查看审计」深链带的就是
 * resourceType=risk_finding + findingId（apps/web/src/pages/drilldown.ts 的
 * buildRiskClosureTargetChain）。记到经营事项上，那个深链就永远是空列表。
 */
function auditRiskFinding(
  req: ApiRequest,
  action: string,
  finding: { id: string; title: string },
  changes: Record<string, unknown>
): void {
  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action,
    resourceType: "risk_finding",
    resourceId: finding.id,
    resourceLabel: finding.title,
    changes
  });
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRiskFindingRow(row: RiskFindingRow): RiskFinding {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    ruleCode: row.rule_code,
    severity: row.severity,
    status: row.status,
    title: row.title,
    detail: row.detail,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapRiskClosureRecordRow(row: RiskClosureRecordRow): RiskClosureRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    findingId: row.finding_id,
    closedByUserId: row.closed_by_user_id,
    closedByName: row.closed_by_name,
    resolution: row.resolution,
    reviewedAt: toIsoString(row.reviewed_at) || new Date().toISOString()
  };
}

export async function listCompanyRiskFindings(companyId: string): Promise<RiskFinding[]> {
  const rows = await query<RiskFindingRow>(
    `
      select
        id, company_id, business_event_id, rule_code, severity, status,
        title, detail, created_at, updated_at
      from risk_findings
      where company_id = $1
      order by created_at desc
    `,
    [companyId]
  );
  return rows.map(mapRiskFindingRow);
}

export async function listRiskFindings(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const findings = scoreRiskFindings(await listCompanyRiskFindings(companyId));
  return json(res, 200, { items: findings, total: findings.length });
}

export async function runEventRiskCheck(req: ApiRequest, res: ServerResponse, eventId: string) {
  const companyId = req.auth!.companyId;
  const [events, tasks, taxItems, taxFilingBatches, generatedDocuments, vouchers, ledgerEntries, rndProjects] =
    await Promise.all([
      listCompanyEvents(companyId),
      listCompanyTasks(companyId),
      listCompanyTaxItems(companyId),
      listCompanyTaxFilingBatches(companyId),
      listCompanyDocuments(companyId),
      listCompanyVouchers(companyId),
      listCompanyLedgerEntries(companyId),
      listCompanyRndProjects(companyId)
    ]);

  const event = events.find((item) => item.id === eventId);
  if (!event) {
    return json(res, 404, { error: "Business event not found" });
  }

  const findings = scoreRiskFindings(evaluateRiskFindings({
    now: new Date().toISOString(),
    event,
    events,
    tasks,
    taxItems,
    taxFilingBatches,
    generatedDocuments: generatedDocuments.filter((item) => item.businessEventId === eventId),
    generatedDocumentsAll: generatedDocuments,
    vouchers,
    ledgerEntries,
    rndProjects
  }));

  // 本次删除掉的旧 finding。finding id 是确定性的（ruleCode-eventId），据此只对
  // 「本次新出现」的高风险推送。取自事务内的 delete...returning 而非事务外的 select：
  // 并发重复扫描时后一个事务会阻塞在行锁上，拿到的是前一个事务提交后的真实快照，
  // 因此不会两个请求都把同一条风险判成「新增」而重复打扰。
  // 同时带出 title/severity/status：下面的留痕要拿旧状态和新结论作对比。
  let replacedFindings: ReplacedFindingRow[] = [];
  await withTransaction(async (client) => {
    const removed = await client.query<ReplacedFindingRow>(
      `delete from risk_findings
        where company_id = $1 and business_event_id = $2
        returning id, title, severity, status`,
      [companyId, eventId]
    );
    replacedFindings = removed.rows;
    for (const finding of findings) {
      await client.query(
        `
          insert into risk_findings (
            id, company_id, business_event_id, rule_code, severity, status,
            title, detail, created_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          finding.id,
          finding.companyId,
          finding.businessEventId,
          finding.ruleCode,
          finding.severity,
          finding.status,
          finding.title,
          finding.detail,
          finding.createdAt,
          finding.updatedAt
        ]
      );
    }
  });

  const knownFindingIds = replacedFindings.map((row) => row.id);

  // 重扫本身就是一次复核，三种结论都要留痕：本次新命中（开启）、上一轮已关闭却
  // 又被命中（重新打开）、上一轮存在但已不再命中（消解）。未发生变化的发现不写——
  // 重扫是幂等操作，无变化就没有事实，写了只会把哈希链灌满噪声。
  const replacedById = new Map(replacedFindings.map((row) => [row.id, row]));
  for (const finding of findings) {
    const previous = replacedById.get(finding.id);
    if (!previous) {
      auditRiskFinding(req, "risk.finding.opened", finding, {
        data: {
          ruleCode: finding.ruleCode,
          severity: finding.severity,
          businessEventId: finding.businessEventId
        }
      });
      continue;
    }
    // 引擎产出的 status 恒为 open（engine.ts），所以上一轮已 resolved/dismissed 的
    // 发现被重扫命中就是「重新打开」——这是最该留痕的一种流转：关闭结论被推翻了。
    if (previous.status !== finding.status) {
      auditRiskFinding(req, "risk.finding.reopened", finding, {
        before: { status: previous.status, severity: previous.severity },
        after: { status: finding.status, severity: finding.severity }
      });
    }
  }
  const currentFindingIds = new Set(findings.map((item) => item.id));
  for (const previous of replacedFindings) {
    if (currentFindingIds.has(previous.id)) {
      continue;
    }
    // 行已被删除，风险页上再也看不到它；不留这一条，「风险为什么不见了」就无从回答。
    auditRiskFinding(req, "risk.finding.cleared", previous, {
      before: { status: previous.status, severity: previous.severity },
      after: { status: "cleared" },
      data: { businessEventId: eventId }
    });
  }

  // 即发即忘：通知失败不影响风险扫描结果的返回。
  notify(
    buildRiskAlertNotification({
      companyId,
      eventLabel: event.title,
      findings: findings.map((item) => ({
        id: item.id,
        severity: item.severity,
        title: item.title,
        businessEventId: item.businessEventId
      })),
      knownFindingIds
    })
  );

  return json(res, 200, { items: findings, total: findings.length });
}

export async function listRiskClosureRecords(req: ApiRequest, res: ServerResponse, findingId: string) {
  const rows = await query<RiskClosureRecordRow>(
    `
      select
        id, company_id, finding_id, closed_by_user_id, closed_by_name, resolution, reviewed_at
      from risk_closure_records
      where company_id = $1 and finding_id = $2
      order by reviewed_at desc
    `,
    [req.auth!.companyId, findingId]
  );
  return json(res, 200, { items: rows.map(mapRiskClosureRecordRow), total: rows.length });
}

export async function closeRiskFinding(req: ApiRequest, res: ServerResponse, findingId: string) {
  const companyId = req.auth!.companyId;
  const finding = await queryOne<RiskFindingRow>(
    `
      select
        id, company_id, business_event_id, rule_code, severity, status, title, detail, created_at, updated_at
      from risk_findings
      where company_id = $1 and id = $2
    `,
    [companyId, findingId]
  );
  if (!finding) {
    return json(res, 404, { error: "Risk finding not found" });
  }
  const resolution = String((req.body as { resolution?: string } | undefined)?.resolution || "").trim();
  if (!resolution) {
    return json(res, 400, { error: "resolution is required" });
  }
  const now = new Date().toISOString();
  const closureId = `risk-close-${Date.now()}`;
  const closedByName = req.auth?.username || "系统用户";
  await withTransaction(async (client) => {
    await client.query(
      `
        update risk_findings
        set status = 'resolved', updated_at = $1::timestamptz
        where id = $2 and company_id = $3
      `,
      [now, findingId, companyId]
    );
    await client.query(
      `
        insert into risk_closure_records (
          id, company_id, finding_id, closed_by_user_id, closed_by_name, resolution, reviewed_at
        )
        values ($1,$2,$3,$4,$5,$6,$7::timestamptz)
      `,
      [closureId, companyId, findingId, req.auth?.userId || null, closedByName, resolution, now]
    );
  });

  // 关闭与复核在本域是同一个动作：risk_closure_records 存的就是复核结论
  // （复核人 + 结论说明 + 复核时间），所以留一条 closed 并把复核证据带进 changes，
  // 而不是编一个后端并不存在的 review 动作。事务提交后才写，回滚的关闭不留痕。
  auditRiskFinding(req, "risk.finding.closed", finding, {
    before: { status: finding.status },
    after: { status: "resolved" },
    data: { closureId, resolution, reviewedBy: closedByName, reviewedAt: now }
  });

  const updated = scoreRiskFindings(await listCompanyRiskFindings(companyId));
  return json(res, 200, updated.find((item) => item.id === findingId));
}
