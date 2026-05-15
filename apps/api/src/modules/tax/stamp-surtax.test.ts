import test from "node:test";
import assert from "node:assert/strict";
import type { TaxItem } from "@finance-taxation/domain-model";
import { buildStampAndSurtaxSummary } from "./stamp-surtax.js";

test("buildStampAndSurtaxSummary separates stamp duty and surtax items", () => {
  const taxItems: TaxItem[] = [
    {
      id: "tx-stamp",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      mappingId: "m-1",
      taxType: "印花税",
      treatment: "购销合同印花税",
      basis: "10000",
      filingPeriod: "2026-Q2",
      status: "review_required",
      source: "analysis",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    },
    {
      id: "tx-surtax",
      companyId: "cmp-1",
      businessEventId: "evt-2",
      mappingId: "m-2",
      taxType: "附加税",
      treatment: "城市维护建设税及教育费附加",
      basis: "300",
      filingPeriod: "2026-Q2",
      status: "ready",
      source: "analysis",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    }
  ];

  const result = buildStampAndSurtaxSummary("cmp-1", "2026-Q2", taxItems);
  assert.equal(result.stampDutyItems.length, 1);
  assert.equal(result.surtaxItems.length, 1);
  assert.equal(result.notes.some((item) => item.includes("印花税")), true);
});
