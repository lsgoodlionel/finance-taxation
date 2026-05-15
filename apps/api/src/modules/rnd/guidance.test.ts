import test from "node:test";
import assert from "node:assert/strict";
import type { RndAccountingPolicyReview, RndProject } from "@finance-taxation/domain-model";
import { buildRndPolicyGuidance } from "./guidance.js";

test("buildRndPolicyGuidance adds subsidy and policy hints", () => {
  const project: RndProject = {
    id: "rnd-1",
    companyId: "cmp-1",
    businessEventId: null,
    code: "RND-1",
    name: "研发平台",
    status: "active",
    capitalizationPolicy: "mixed",
    startedOn: "2026-05-01",
    endedOn: null,
    ownerId: null,
    notes: "",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
  const review: RndAccountingPolicyReview = {
    projectId: "rnd-1",
    projectName: "研发平台",
    recommendedPolicy: "mixed",
    conflicts: [],
    guidance: ["已归集成本 2 条。"]
  };

  const result = buildRndPolicyGuidance(project, review, "10000");
  assert.equal(result.subsidyHints.length > 0, true);
  assert.equal(result.policyHints.length > 0, true);
});
