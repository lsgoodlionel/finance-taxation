import type {
  PayrollPeriodSummary,
  PayrollRecord,
  PayrollTaxReviewLedger,
  RiskFinding,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";
import { buildPayrollArtifactSummary } from "../payroll-closure";
import { buildPayrollRiskBuckets, buildPayrollVoucherSuggestions } from "../payroll-guidance";
import { buildPayrollLinkageSummary } from "../payroll-linkage";
import { buildPayrollTaxReviewSummary } from "../payroll-tax-review";
import { buildPayrollWorkflow } from "../payroll-workflow";
import { derivePayrollRuntimeSummary } from "../../features/runtime/workflow-runtime";

export interface PayrollPageSummariesInput {
  selectedPeriod: string;
  customPeriod: string;
  periods: PayrollPeriodSummary[];
  payrollRecords: PayrollRecord[];
  linkedEventId: string | null;
  linkedTaxItemCount: number;
  linkedVoucherCount: number;
  linkedTaxItems: TaxItem[];
  linkedVouchers: Voucher[];
  linkedRisks: RiskFinding[];
  reviewLedgers: PayrollTaxReviewLedger[];
  iitChecklist: string[];
  iitMaterialPeriod: string | null;
  roleIds: string[];
}

export function buildPayrollPageSummaries({
  selectedPeriod,
  customPeriod,
  periods,
  payrollRecords,
  linkedEventId,
  linkedTaxItemCount,
  linkedVoucherCount,
  linkedTaxItems,
  linkedVouchers,
  linkedRisks,
  reviewLedgers,
  iitChecklist,
  iitMaterialPeriod,
  roleIds
}: PayrollPageSummariesInput) {
  const payrollWorkflow = selectedPeriod
    ? buildPayrollWorkflow({
        period: selectedPeriod,
        records: payrollRecords,
        linkedEventId
      })
    : null;
  const payrollLinkage = selectedPeriod
    ? buildPayrollLinkageSummary({
        taxItemCount: linkedTaxItemCount,
        voucherCount: linkedVoucherCount,
        confirmedCount: payrollRecords.filter((record) => record.status === "confirmed").length,
        totalCount: payrollRecords.length,
        linkedEventId
      })
    : null;
  const payrollTaxReview = selectedPeriod
    ? buildPayrollTaxReviewSummary({
        period: selectedPeriod,
        records: payrollRecords,
        linkedEventId,
        taxItemCount: linkedTaxItemCount,
        iitMaterial: iitMaterialPeriod === selectedPeriod
          ? {
              companyId: "",
              filingPeriod: iitMaterialPeriod,
              payrollEventCount: linkedEventId ? 1 : 0,
              withholdingItemCount: linkedTaxItemCount,
              totalPayrollAmount: "0",
              checklist: iitChecklist
            }
          : null
      })
    : null;
  const payrollArtifactSummary = buildPayrollArtifactSummary({
    taxItems: linkedTaxItems,
    vouchers: linkedVouchers,
    risks: linkedRisks
  });
  const payrollVoucherSuggestions = buildPayrollVoucherSuggestions(payrollRecords, linkedVouchers);
  const payrollRiskBuckets = buildPayrollRiskBuckets(linkedRisks);
  const runtimePeriod = selectedPeriod || periods[0]?.period || customPeriod || "";
  const localRuntimeSummary = derivePayrollRuntimeSummary(
    runtimePeriod,
    payrollRecords,
    linkedEventId,
    reviewLedgers,
    linkedRisks.length,
    roleIds
  );

  return {
    payrollWorkflow,
    payrollLinkage,
    payrollTaxReview,
    payrollArtifactSummary,
    payrollVoucherSuggestions,
    payrollRiskBuckets,
    runtimePeriod,
    localRuntimeSummary
  };
}
