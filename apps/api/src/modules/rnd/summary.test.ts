import test from "node:test";
import assert from "node:assert/strict";
import type { RndCostLine, RndProject, RndTimeEntry } from "@finance-taxation/domain-model";
import { buildRndProjectSummary } from "./summary.js";

test("buildRndProjectSummary aggregates expense, capitalization, and work hours", () => {
  const project: RndProject = {
    id: "rnd-1",
    companyId: "cmp-1",
    businessEventId: "evt-rnd",
    code: "RND-2026-001",
    name: "AI 财税引擎",
    status: "active",
    capitalizationPolicy: "mixed",
    startedOn: "2026-05-01",
    endedOn: null,
    ownerId: "u1",
    notes: "",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  };

  const costLines: RndCostLine[] = [
    {
      id: "cost-1",
      companyId: "cmp-1",
      projectId: "rnd-1",
      businessEventId: "evt-rnd",
      voucherId: "v-1",
      costType: "payroll",
      accountingTreatment: "expensed",
      amount: "800.00",
      occurredOn: "2026-05-10",
      notes: "",
      createdAt: "2026-05-10T00:00:00.000Z"
    },
    {
      id: "cost-2",
      companyId: "cmp-1",
      projectId: "rnd-1",
      businessEventId: "evt-rnd",
      voucherId: "v-2",
      costType: "software",
      accountingTreatment: "capitalized",
      amount: "300.00",
      occurredOn: "2026-05-11",
      notes: "",
      createdAt: "2026-05-11T00:00:00.000Z"
    }
  ];

  const timeEntries: RndTimeEntry[] = [
    {
      id: "time-1",
      companyId: "cmp-1",
      projectId: "rnd-1",
      businessEventId: "evt-rnd",
      userId: "u1",
      staffName: "张三",
      workDate: "2026-05-10",
      hours: "7.50",
      notes: "",
      createdAt: "2026-05-10T00:00:00.000Z"
    },
    {
      id: "time-2",
      companyId: "cmp-1",
      projectId: "rnd-1",
      businessEventId: "evt-rnd",
      userId: "u2",
      staffName: "李四",
      workDate: "2026-05-10",
      hours: "6.00",
      notes: "",
      createdAt: "2026-05-10T00:00:00.000Z"
    }
  ];

  const summary = buildRndProjectSummary(project, costLines, timeEntries);
  assert.equal(summary.expenseAmount, "800");
  assert.equal(summary.capitalizedAmount, "300");
  assert.equal(summary.totalHours, "13.5");
  assert.equal(summary.superDeductionEligibleBase, "800");
});
