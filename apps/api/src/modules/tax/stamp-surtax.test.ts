import test from "node:test";
import assert from "node:assert/strict";
import type { TaxItem } from "@finance-taxation/domain-model";
import { calculateSurtax } from "./surtax.js";
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
      taxableAmountCents: null,
      taxableCategory: null,
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
      taxableAmountCents: null,
      taxableCategory: null,
      filingPeriod: "2026-Q2",
      status: "ready",
      source: "analysis",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    }
  ];

  // 这条验的是**筛选**：人工登记的税项照常按税种分类。
  // V17 批次 B 之后附加税还会算出来一份，与筛选无关——
  // 传一个算好的结果进去，下面的断言一条不用改。
  const surtax = calculateSurtax({
    paidVatCents: 100_00,
    zone: "city",
    halvedReduction: false
  });
  const result = buildStampAndSurtaxSummary("cmp-1", "2026-Q2", taxItems, surtax);
  assert.equal(result.stampDutyItems.length, 1);
  assert.equal(result.surtaxItems.length, 1);
  assert.equal(result.notes.some((item) => item.includes("印花税")), true);
});
