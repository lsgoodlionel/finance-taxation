import test from "node:test";
import assert from "node:assert/strict";
import type { RiskFinding } from "@finance-taxation/domain-model";
import { scoreRiskFindings } from "./scoring.js";

test("scoreRiskFindings adds score and priority", () => {
  const findings: RiskFinding[] = [
    {
      id: "f1",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      ruleCode: "SALES_WITHOUT_VAT_ITEM",
      severity: "high",
      status: "open",
      title: "x",
      detail: "y",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    },
    {
      id: "f2",
      companyId: "cmp-1",
      businessEventId: "evt-2",
      ruleCode: "OVERDUE_BLOCKED_TASK",
      severity: "medium",
      status: "open",
      title: "x",
      detail: "y",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    }
  ];

  const scored = scoreRiskFindings(findings);
  assert.equal(scored[0]?.priority, "P1");
  assert.equal(scored[1]?.priority, "P2");
  assert.equal((scored[0]?.score || 0) > (scored[1]?.score || 0), true);
});
