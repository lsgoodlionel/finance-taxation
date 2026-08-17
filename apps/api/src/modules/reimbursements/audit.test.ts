/**
 * 报销单业财合规审核的测试（V13-D1/D2/D3/D4）。
 *
 * 四类校验共用 `ControlCheckResult`（V13-A 定的形状），由 `highestLevel`
 * 收敛成一个动作。这是那个抽象的兑现时刻——批次 A 抽它出来时只有两个
 * 消费方，现在是六个。
 *
 * ## 级别的分配是有讲究的
 *
 * - **重复报销 → block**：判定确定性高（同一张票号），且是真金白银的漏洞
 * - **抬头不符 → warn**：可能是分公司抬头、可能是录入错，不该一律拦死
 * - **超标 → 按标准配置**（block/warn/escalate）
 * - **金额不符 → warn**：部分报销（发票 1000 只报 800）是合法的
 */

import assert from "node:assert/strict";
import test from "node:test";
import { highestLevel } from "../controls/result.js";
import { auditReimbursement, type AuditContext } from "./audit.js";

const COMPANY = { name: "某某科技有限公司", creditCode: "91440300MA5XXXXX1A" };

function makeContext(overrides: Partial<AuditContext> = {}): AuditContext {
  return {
    company: COMPANY,
    lines: [
      {
        lineId: "l1",
        expenseType: "travel_hotel",
        amountCents: 100000,
        quantity: 2,
        invoiceId: null
      }
    ],
    invoices: new Map(),
    usedInvoiceIds: new Set(),
    standards: [],
    onDate: "2026-09-15",
    gradeCode: null,
    cityTier: null,
    ...overrides
  };
}

test("干净的报销单不产生任何告警", () => {
  const findings = auditReimbursement(makeContext());

  assert.equal(findings.length, 0);
  assert.equal(highestLevel(findings), "ok");
});

// ── D1 重复报销 ────────────────────────────────────────────────────

test("发票已被别的单据用过 → block", () => {
  // 判定确定性高（同一张票号），且是真金白银的漏洞，所以是最硬的那一档。
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 10000, quantity: 1, invoiceId: "inv-1" }
      ],
      usedInvoiceIds: new Set(["inv-1"])
    })
  );

  const duplicate = findings.find((item) => item.code === "audit.duplicate_invoice");
  assert.ok(duplicate);
  assert.equal(duplicate.level, "block");
  assert.equal(highestLevel(findings), "block");
});

test("没用过的发票不报重复", () => {
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 10000, quantity: 1, invoiceId: "inv-2" }
      ],
      usedInvoiceIds: new Set(["inv-1"])
    })
  );

  assert.equal(findings.some((item) => item.code === "audit.duplicate_invoice"), false);
});

test("多行用同一张票 → block（同单内重复）", () => {
  // 库上有唯一约束挡住，但那报出来的是数据库错误。在这里拦能给出人话。
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 5000, quantity: 1, invoiceId: "inv-1" },
        { lineId: "l2", expenseType: "office", amountCents: 5000, quantity: 1, invoiceId: "inv-1" }
      ]
    })
  );

  const duplicate = findings.find((item) => item.code === "audit.duplicate_invoice_in_form");
  assert.ok(duplicate);
  assert.equal(duplicate.level, "block");
});

// ── D2 票据合规 ────────────────────────────────────────────────────

test("发票抬头与公司名不符 → warn", () => {
  // 不是 block：分公司抬头、简称、录入笔误都可能造成不符，一律拦死会让
  // 大量正常报销提不上来。
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 10000, quantity: 1, invoiceId: "inv-1" }
      ],
      invoices: new Map([
        [
          "inv-1",
          {
            invoiceNo: "12345678",
            buyerName: "另一家公司",
            buyerTaxNo: COMPANY.creditCode,
            totalAmountCents: 10000
          }
        ]
      ])
    })
  );

  const finding = findings.find((item) => item.code === "audit.invoice_title_mismatch");
  assert.ok(finding);
  assert.equal(finding.level, "warn");
  assert.match(finding.message, /另一家公司/);
});

test("税号不符 → warn，且与抬头分开报", () => {
  // 抬头对税号错，通常是开票方录错税号——这是**发票本身有问题**，
  // 与抬头开错不是一回事，分开报才知道该找谁改。
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 10000, quantity: 1, invoiceId: "inv-1" }
      ],
      invoices: new Map([
        [
          "inv-1",
          {
            invoiceNo: "12345678",
            buyerName: COMPANY.name,
            buyerTaxNo: "91440300WRONG",
            totalAmountCents: 10000
          }
        ]
      ])
    })
  );

  assert.ok(findings.find((item) => item.code === "audit.invoice_tax_no_mismatch"));
  assert.equal(findings.some((item) => item.code === "audit.invoice_title_mismatch"), false);
});

test("抬头与税号都对时不报", () => {
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 10000, quantity: 1, invoiceId: "inv-1" }
      ],
      invoices: new Map([
        [
          "inv-1",
          {
            invoiceNo: "12345678",
            buyerName: COMPANY.name,
            buyerTaxNo: COMPANY.creditCode,
            totalAmountCents: 10000
          }
        ]
      ])
    })
  );

  assert.equal(findings.length, 0);
});

test("公司没录统一社会信用代码时跳过税号校验", () => {
  // 没录就没法比。报一条「税号不符」会指向一个用户改不了的问题。
  const findings = auditReimbursement(
    makeContext({
      company: { name: COMPANY.name, creditCode: null },
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 10000, quantity: 1, invoiceId: "inv-1" }
      ],
      invoices: new Map([
        [
          "inv-1",
          {
            invoiceNo: "1",
            buyerName: COMPANY.name,
            buyerTaxNo: "任意税号",
            totalAmountCents: 10000
          }
        ]
      ])
    })
  );

  assert.equal(findings.some((item) => item.code === "audit.invoice_tax_no_mismatch"), false);
});

// ── D4 金额一致性 ──────────────────────────────────────────────────

test("报销金额超过发票金额 → warn", () => {
  // 报得比票多是明确的异常。仍用 warn 而非 block：可能是一张票对多行、
  // 也可能是含税不含税口径差，审批人看一眼比直接拦住合适。
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 15000, quantity: 1, invoiceId: "inv-1" }
      ],
      invoices: new Map([
        [
          "inv-1",
          {
            invoiceNo: "1",
            buyerName: COMPANY.name,
            buyerTaxNo: COMPANY.creditCode,
            totalAmountCents: 10000
          }
        ]
      ])
    })
  );

  const finding = findings.find((item) => item.code === "audit.amount_exceeds_invoice");
  assert.ok(finding);
  assert.equal(finding.level, "warn");
  assert.match(finding.message, /150\.00/);
  assert.match(finding.message, /100\.00/);
});

test("报销金额少于发票金额不报——部分报销是合法的", () => {
  // 发票 1000 元只报 800（另 200 自费）在制度上完全允许。
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 8000, quantity: 1, invoiceId: "inv-1" }
      ],
      invoices: new Map([
        [
          "inv-1",
          {
            invoiceNo: "1",
            buyerName: COMPANY.name,
            buyerTaxNo: COMPANY.creditCode,
            totalAmountCents: 10000
          }
        ]
      ])
    })
  );

  assert.equal(findings.length, 0);
});

// ── D3 超标 ────────────────────────────────────────────────────────

test("超标按标准上配置的策略给级别", () => {
  const findings = auditReimbursement(
    makeContext({
      lines: [
        {
          lineId: "l1",
          expenseType: "travel_hotel",
          amountCents: 100000,
          quantity: 2,
          invoiceId: null
        }
      ],
      standards: [
        {
          id: "std-1",
          expenseType: "travel_hotel",
          gradeCode: null,
          cityTier: null,
          limitCents: 30000,
          limitBasis: "per_day",
          overPolicy: "escalate",
          effectiveFrom: "2026-01-01",
          effectiveTo: null
        }
      ]
    })
  );

  const finding = findings.find((item) => item.code === "standard.overrun");
  assert.ok(finding);
  // 300/晚 × 2 晚 = 600 限额，实报 1000 → 超 400，策略是加签
  assert.equal(finding.level, "escalate");
  assert.equal(highestLevel(findings), "escalate");
});

test("没配标准的费用类型不做超标判定", () => {
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "training", amountCents: 999999, quantity: 1, invoiceId: null }
      ],
      standards: []
    })
  );

  assert.equal(findings.some((item) => item.code.startsWith("standard.")), false);
});

// ── 收敛 ───────────────────────────────────────────────────────────

test("多类问题同时存在时取最严厉的级别", () => {
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 10000, quantity: 1, invoiceId: "inv-1" }
      ],
      usedInvoiceIds: new Set(["inv-1"]),
      invoices: new Map([
        [
          "inv-1",
          {
            invoiceNo: "1",
            buyerName: "别家公司",
            buyerTaxNo: COMPANY.creditCode,
            totalAmountCents: 10000
          }
        ]
      ])
    })
  );

  // 重复报销（block）+ 抬头不符（warn）
  assert.ok(findings.length >= 2);
  assert.equal(highestLevel(findings), "block");
});

test("每条 finding 都带上是哪一行出的问题", () => {
  // 一张单十几行时，只说「超标了」用户不知道改哪一行。
  const findings = auditReimbursement(
    makeContext({
      lines: [
        { lineId: "l1", expenseType: "office", amountCents: 5000, quantity: 1, invoiceId: null },
        { lineId: "l2", expenseType: "office", amountCents: 5000, quantity: 1, invoiceId: "inv-1" }
      ],
      usedInvoiceIds: new Set(["inv-1"])
    })
  );

  const finding = findings.find((item) => item.code === "audit.duplicate_invoice");
  assert.equal(finding?.lineId, "l2");
});
