import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaxDeadlines } from "./deadlines.js";

test("到期日为所属期次月15日", () => {
  const [vat] = buildTaxDeadlines({ period: "2026-04", today: "2026-05-01", filedTypes: [] });
  assert.equal(vat!.dueDate, "2026-05-15");
});

test("跨年12月所属期到期日为次年1月15日", () => {
  const [vat] = buildTaxDeadlines({ period: "2026-12", today: "2027-01-01", filedTypes: [] });
  assert.equal(vat!.dueDate, "2027-01-15");
});

test("已申报税种 filed=true 且不紧急", () => {
  const ds = buildTaxDeadlines({ period: "2026-04", today: "2026-05-12", filedTypes: ["vat"] });
  const vat = ds.find((d) => d.taxType === "vat")!;
  assert.equal(vat.filed, true);
  assert.equal(vat.urgent, false);
});

test("未申报且临近到期标记 urgent", () => {
  const ds = buildTaxDeadlines({ period: "2026-04", today: "2026-05-12", filedTypes: [] });
  const vat = ds.find((d) => d.taxType === "vat")!;
  assert.equal(vat.daysLeft, 3);
  assert.equal(vat.urgent, true);
});

test("已逾期未申报 daysLeft 为负且紧急", () => {
  const ds = buildTaxDeadlines({ period: "2026-04", today: "2026-05-20", filedTypes: [] });
  const vat = ds.find((d) => d.taxType === "vat")!;
  assert.ok(vat.daysLeft < 0);
  assert.equal(vat.urgent, true);
});
