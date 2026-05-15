import test from "node:test";
import assert from "node:assert/strict";
import type { RndCostLine, RndProject, RndTimeEntry } from "@finance-taxation/domain-model";
import { buildRndAccountingPolicyReview } from "./policy.js";

test("buildRndAccountingPolicyReview flags capitalization policy conflicts", () => {
  const project: RndProject = {
    id: "rnd-1",
    companyId: "cmp-1",
    businessEventId: "evt-rnd",
    code: "RND-001",
    name: "AI 平台",
    status: "active",
    capitalizationPolicy: "expense",
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
      costType: "software",
      accountingTreatment: "capitalized",
      amount: "5000",
      occurredOn: "2026-05-10",
      notes: "",
      createdAt: "2026-05-10T00:00:00.000Z"
    }
  ];

  const review = buildRndAccountingPolicyReview(project, costLines, [] as RndTimeEntry[]);
  assert.equal(review.recommendedPolicy, "expense");
  assert.equal(review.conflicts.length, 1);
  assert.equal(review.conflicts[0]?.includes("资本化"), true);
});
