import test from "node:test";
import assert from "node:assert/strict";
import type { RndCostLine, RndProject, RndTimeEntry } from "@finance-taxation/domain-model";
import { buildSuperDeductionPackage } from "./package.js";

test("buildSuperDeductionPackage computes deduction base and checklist", () => {
  const project: RndProject = {
    id: "rnd-1",
    companyId: "cmp-1",
    businessEventId: null,
    code: "RND-1",
    name: "平台研发",
    status: "active",
    capitalizationPolicy: "mixed",
    startedOn: "2026-05-01",
    endedOn: null,
    ownerId: null,
    notes: "",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
  const costLines: RndCostLine[] = [
    {
      id: "c1",
      companyId: "cmp-1",
      projectId: "rnd-1",
      businessEventId: null,
      voucherId: null,
      costType: "payroll",
      accountingTreatment: "expensed",
      amount: "100",
      occurredOn: "2026-05-10",
      notes: "",
      createdAt: "2026-05-15T00:00:00.000Z"
    }
  ];
  const timeEntries: RndTimeEntry[] = [
    {
      id: "t1",
      companyId: "cmp-1",
      projectId: "rnd-1",
      businessEventId: null,
      userId: null,
      staffName: "张三",
      workDate: "2026-05-10",
      hours: "8",
      notes: "",
      createdAt: "2026-05-15T00:00:00.000Z"
    }
  ];

  const pkg = buildSuperDeductionPackage(project, costLines, timeEntries, "2026-05-15T00:00:00.000Z");
  assert.equal(pkg.eligibleBase, "100");
  assert.equal(pkg.suggestedDeductionAmount, "200");
  assert.equal(pkg.checklist.length > 0, true);
});
