import assert from "node:assert/strict";
import test from "node:test";
import type { Task, TaxFilingBatch, TaxItem, Voucher } from "@finance-taxation/domain-model";
import {
  type PayrollTransferRuntimeBatch,
  derivePayrollTransferRuntimeSummary,
  deriveTaskRuntimeSummary,
  deriveTaxRuntimeSummary,
  deriveVoucherRuntimeSummary
} from "./summary.js";

test("deriveTaskRuntimeSummary marks blocked task chains as failed runtime", () => {
  const tasks: Task[] = [
    {
      id: "task-1",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      parentTaskId: null,
      title: "补资料",
      description: "",
      status: "blocked",
      priority: "high",
      ownerId: null,
      dueAt: null,
      assigneeDepartment: "财务部",
      source: "workflow"
    }
  ];

  const summary = deriveTaskRuntimeSummary(tasks, ["role-accountant"]);
  assert.equal(summary.executionState, "failed");
  assert.equal(summary.authorizationState, "not_required");
  assert.equal(summary.issue?.tone, "error");
  assert.equal(summary.actions?.[0]?.key, "retry-blocked-task");
  assert.equal(summary.actions?.[0]?.params?.taskId, "task-1");
});

test("deriveTaxRuntimeSummary reports insufficient authorization when taxpayer profile is missing", () => {
  const items: TaxItem[] = [];
  const batches: TaxFilingBatch[] = [];

  const summary = deriveTaxRuntimeSummary(items, batches, null, [], ["role-employee"]);
  assert.equal(summary.executionState, "waiting");
  assert.equal(summary.authorizationState, "insufficient");
  assert.equal(summary.authorizationLabel, "口径未建立");
  assert.equal(summary.issue?.tone, "warning");
});

test("deriveTaxRuntimeSummary exposes review retry action for review-required batches", () => {
  const items: TaxItem[] = [
    {
      id: "tax-item-1",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      mappingId: "map-1",
      taxType: "增值税",
      treatment: "缺少进项发票，需补充后再复核",
      basis: "增值税暂行条例",
      filingPeriod: "2026-05",
      status: "review_required",
      source: "analysis",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  const batch: TaxFilingBatch = {
    id: "batch-1",
    companyId: "cmp-1",
    taxType: "增值税",
    filingPeriod: "2026-05",
    status: "review_required",
    itemIds: ["tax-item-1"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const summary = deriveTaxRuntimeSummary(
    items,
    [batch],
    batch,
    [{ id: "profile-1", companyId: "cmp-1", taxpayerType: "general_vat", effectiveFrom: "2026-01-01", status: "active", notes: "", createdAt: "", updatedAt: "" }],
    ["role-tax-specialist"]
  );

  assert.equal(summary.executionState, "failed");
  assert.equal(summary.issue?.tone, "error");
  assert.equal(summary.actions?.[0]?.key, "retry-tax-review");
  assert.equal(summary.actions?.[0]?.params?.batchId, "batch-1");
});

test("deriveTaxRuntimeSummary follows selected batch state after review is approved", () => {
  const items: TaxItem[] = [
    {
      id: "tax-item-1",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      mappingId: "map-1",
      taxType: "增值税",
      treatment: "补充进项发票后重新复核",
      basis: "增值税暂行条例",
      filingPeriod: "2026-05",
      status: "review_required",
      source: "analysis",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  const batch: TaxFilingBatch = {
    id: "batch-1",
    companyId: "cmp-1",
    taxType: "增值税",
    filingPeriod: "2026-05",
    status: "ready",
    itemIds: ["tax-item-1"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const summary = deriveTaxRuntimeSummary(
    items,
    [batch],
    batch,
    [{ id: "profile-1", companyId: "cmp-1", taxpayerType: "general_vat", effectiveFrom: "2026-01-01", status: "active", notes: "", createdAt: "", updatedAt: "" }],
    ["role-tax-specialist"]
  );

  assert.equal(summary.executionState, "running");
  assert.equal(summary.authorizationState, "authorized");
  assert.equal(summary.issue, undefined);
  assert.equal(summary.actions?.length ?? 0, 0);
});

test("deriveVoucherRuntimeSummary exposes validation retry action for invalid details", () => {
  const voucher: Voucher = {
    id: "voucher-1",
    companyId: "cmp-1",
    businessEventId: "evt-1",
    mappingId: "map-1",
    voucherType: "general",
    summary: "测试凭证",
    status: "draft",
    lines: [
      {
        id: "line-1",
        summary: "管理费用",
        accountCode: "6602",
        accountName: "管理费用",
        debit: "100.00",
        credit: "0.00"
      }
    ],
    source: "analysis",
    approvedAt: null,
    postedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const summary = deriveVoucherRuntimeSummary([voucher], voucher, ["role-accountant"]);
  assert.equal(summary.issue?.tone, "error");
  assert.equal(summary.actions?.[0]?.key, "retry-voucher-validate");
  assert.equal(summary.actions?.[0]?.params?.voucherId, "voucher-1");
});

test("derivePayrollTransferRuntimeSummary allows finance director to disburse exported batches", () => {
  const summary = derivePayrollTransferRuntimeSummary(
    [
      {
        id: "batch-1",
        company_id: "cmp-1",
        payroll_period: "2026-05",
        bank_account_id: null,
        bank_statement_id: null,
        total_amount: "9280.00",
        employee_count: 1,
        status: "exported",
        bank_transfer_ref: null,
        notes: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as PayrollTransferRuntimeBatch
    ],
    {
      id: "batch-1",
      company_id: "cmp-1",
      payroll_period: "2026-05",
      bank_account_id: null,
      bank_statement_id: null,
      total_amount: "9280.00",
      employee_count: 1,
      status: "exported",
      bank_transfer_ref: null,
      notes: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as PayrollTransferRuntimeBatch,
    ["role-finance-director"]
  );

  assert.equal(summary.executionState, "running");
  assert.equal(summary.authorizationState, "authorized");
  assert.equal(summary.authorizationLabel, "你可推进代发");
});

test("derivePayrollTransferRuntimeSummary exposes compensation repair action for failed downstream linkage", () => {
  const summary = derivePayrollTransferRuntimeSummary(
    [
      {
        id: "batch-2",
        company_id: "cmp-1",
        payroll_period: "2026-05",
        bank_account_id: null,
        bank_statement_id: null,
        total_amount: "9280.00",
        employee_count: 1,
        status: "disbursed",
        bank_transfer_ref: "BANK-202605-01",
        notes: "",
        retry_count: 2,
        last_error: "经营事项补偿失败，等待重新补偿。",
        last_attempt_at: new Date().toISOString(),
        next_retry_at: new Date().toISOString(),
        compensation_status: "failed",
        compensation_event_id: null,
        compensated_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as PayrollTransferRuntimeBatch
    ],
    {
      id: "batch-2",
      company_id: "cmp-1",
      payroll_period: "2026-05",
      bank_account_id: null,
      bank_statement_id: null,
      total_amount: "9280.00",
      employee_count: 1,
      status: "disbursed",
      bank_transfer_ref: "BANK-202605-01",
      notes: "",
      retry_count: 2,
      last_error: "经营事项补偿失败，等待重新补偿。",
      last_attempt_at: new Date().toISOString(),
      next_retry_at: new Date().toISOString(),
      compensation_status: "failed",
      compensation_event_id: null,
      compensated_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as PayrollTransferRuntimeBatch,
    ["role-finance-director"]
  );

  assert.equal(summary.executionState, "failed");
  assert.equal(summary.authorizationState, "authorized");
  assert.equal(summary.issue?.tone, "error");
  assert.equal(summary.actions?.[0]?.key, "compensate-transfer-batch");
  assert.equal(summary.actions?.[0]?.params?.batchId, "batch-2");
});
