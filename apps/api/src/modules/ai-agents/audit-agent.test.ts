import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuditReview } from "./audit-agent.js";

test("高危未关闭判为 high", () => {
  const r = buildAuditReview({ openHigh: 2, openMedium: 0, openLow: 0, draftVouchers: 0, unmatchedStatements: 0, postedVouchers: 100 });
  assert.equal(r.riskLevel, "high");
  assert.ok(r.findings[0]?.includes("高危"));
});

test("仅未过账凭证判为 medium", () => {
  const r = buildAuditReview({ openHigh: 0, openMedium: 0, openLow: 0, draftVouchers: 5, unmatchedStatements: 0, postedVouchers: 50 });
  assert.equal(r.riskLevel, "medium");
});

test("无异常判为 clean", () => {
  const r = buildAuditReview({ openHigh: 0, openMedium: 0, openLow: 0, draftVouchers: 0, unmatchedStatements: 0, postedVouchers: 80 });
  assert.equal(r.riskLevel, "clean");
  assert.equal(r.findings.length, 0);
});

test("抽样量为已过账凭证的10%，下限3上限30", () => {
  assert.equal(buildAuditReview({ openHigh: 0, openMedium: 0, openLow: 0, draftVouchers: 0, unmatchedStatements: 0, postedVouchers: 5 }).sampleSize, 3);
  assert.equal(buildAuditReview({ openHigh: 0, openMedium: 0, openLow: 0, draftVouchers: 0, unmatchedStatements: 0, postedVouchers: 200 }).sampleSize, 20);
  assert.equal(buildAuditReview({ openHigh: 0, openMedium: 0, openLow: 0, draftVouchers: 0, unmatchedStatements: 0, postedVouchers: 1000 }).sampleSize, 30);
  assert.equal(buildAuditReview({ openHigh: 0, openMedium: 0, openLow: 0, draftVouchers: 0, unmatchedStatements: 0, postedVouchers: 0 }).sampleSize, 0);
});
