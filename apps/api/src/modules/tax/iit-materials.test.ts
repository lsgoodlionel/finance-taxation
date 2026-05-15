import test from "node:test";
import assert from "node:assert/strict";
import type { LedgerEntry, TaxItem } from "@finance-taxation/domain-model";
import { buildIndividualIncomeTaxMaterials } from "./iit-materials.js";

test("buildIndividualIncomeTaxMaterials summarizes payroll withholding materials", () => {
  const taxItems: TaxItem[] = [
    {
      id: "tx-iit",
      companyId: "cmp-1",
      businessEventId: "evt-payroll",
      mappingId: "m-1",
      taxType: "个人所得税",
      treatment: "工资薪金个人所得税代扣代缴",
      basis: "5000",
      filingPeriod: "2026-05",
      status: "ready",
      source: "analysis",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    }
  ];

  const ledgerEntries: LedgerEntry[] = [
    {
      id: "le-payroll",
      companyId: "cmp-1",
      voucherId: "v-1",
      businessEventId: "evt-payroll",
      entryDate: "2026-05-15",
      summary: "工资计提",
      accountCode: "22110101",
      accountName: "应付职工薪酬-工资",
      debit: "0",
      credit: "5000",
      source: "voucher_posting",
      postedAt: "2026-05-15T00:00:00.000Z"
    }
  ];

  const result = buildIndividualIncomeTaxMaterials("cmp-1", "2026-05", taxItems, ledgerEntries);
  assert.equal(result.withholdingItemCount, 1);
  assert.equal(result.totalPayrollAmount, "5000");
  assert.equal(result.checklist.some((item) => item.includes("个税")), true);
});
