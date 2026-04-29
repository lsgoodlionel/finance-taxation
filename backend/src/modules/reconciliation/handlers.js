import { readRequestBody, sendJson } from "../../utils/http.js";
import { readJson, writeJson } from "../../services/json-store.js";
import { appConfig } from "../../config/app.js";

const checksFile = new URL("reconciliation-checks.json", appConfig.dataDir);
const issuesFile = new URL("reconciliation-issues.json", appConfig.dataDir);

const seedChecks = [
  {
    id: "chk-001",
    checkType: "contract-invoice-cash-revenue",
    period: "2026-04",
    status: "warning"
  },
  {
    id: "chk-002",
    checkType: "payroll-iit-social-housing",
    period: "2026-04",
    status: "pass"
  }
];

const seedIssues = [
  {
    id: "iss-001",
    checkId: "chk-001",
    issueType: "revenue-mismatch",
    severity: "high",
    status: "open",
    description: "合同金额与已开票金额一致，但回款金额低于收入确认金额。"
  }
];

export async function runReconciliation(req, res) {
  const body = await readRequestBody(req);
  const checks = await readJson(checksFile, seedChecks);
  const next = {
    id: `chk-${Date.now()}`,
    checkType: body.checkType || "custom",
    period: body.period || "current",
    status: "pending"
  };
  checks.unshift(next);
  await writeJson(checksFile, checks);
  sendJson(res, 202, next);
}

export async function listReconciliationResults(req, res) {
  const checks = await readJson(checksFile, seedChecks);
  const issues = await readJson(issuesFile, seedIssues);
  sendJson(res, 200, { checks, issues });
}
