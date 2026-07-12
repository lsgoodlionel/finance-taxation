/**
 * 票税一致性核对（金税四期「以数治税」产品楔子）。
 *
 * 纯函数：给定某属期的发票汇总、增值税申报数、账面收入，比对
 *   - 销项税额：发票销项 vs 申报销项
 *   - 进项税额：发票进项 vs 申报进项
 *   - 票账收入：发票销售额 vs 账面收入（利润表主营+其他业务收入）
 * 超过容差即产出预警，供「票 ↔ 税 ↔ 账」自动勾稽。金额一律以最小单位（分）
 * 的整数比较，避免浮点误差；容差同为整数分。
 */

export type ConsistencySeverity = "ok" | "warning" | "alert";

export interface ConsistencyInput {
  /** 属期，如 "2026-05"。 */
  period: string;
  /** 发票端销项税额合计（分）。 */
  invoiceOutputTaxCents: number;
  /** 发票端进项税额合计（分）。 */
  invoiceInputTaxCents: number;
  /** 发票端不含税销售额合计（分）。 */
  invoiceSalesAmountCents: number;
  /** 增值税申报表销项税额（分）。 */
  declaredOutputTaxCents: number;
  /** 增值税申报表进项税额（分）。 */
  declaredInputTaxCents: number;
  /** 账面收入（利润表主营+其他业务收入，分）。 */
  ledgerRevenueCents: number;
  /** 告警容差（分）；|差异| ≤ 容差为一致。默认 0（严格）。 */
  toleranceCents?: number;
  /** 达到告警级的差异阈值（分）；超过为 alert，否则 warning。默认容差的 10 倍。 */
  alertThresholdCents?: number;
}

export interface ConsistencyCheck {
  key: "output_tax" | "input_tax" | "invoice_vs_ledger_revenue";
  label: string;
  invoiceValueCents: number;
  comparedValueCents: number;
  differenceCents: number;
  severity: ConsistencySeverity;
}

export interface ConsistencyReport {
  period: string;
  checks: ConsistencyCheck[];
  /** 整体：任一 alert → alert；任一 warning → warning；否则 ok。 */
  overall: ConsistencySeverity;
}

function classify(
  difference: number,
  tolerance: number,
  alertThreshold: number
): ConsistencySeverity {
  const abs = Math.abs(difference);
  if (abs <= tolerance) {
    return "ok";
  }
  return abs > alertThreshold ? "alert" : "warning";
}

function rollUp(checks: readonly ConsistencyCheck[]): ConsistencySeverity {
  if (checks.some((c) => c.severity === "alert")) {
    return "alert";
  }
  if (checks.some((c) => c.severity === "warning")) {
    return "warning";
  }
  return "ok";
}

export function checkTaxConsistency(input: ConsistencyInput): ConsistencyReport {
  const tolerance = Math.max(0, input.toleranceCents ?? 0);
  const alertThreshold = Math.max(tolerance, input.alertThresholdCents ?? tolerance * 10);

  const draft: Array<Omit<ConsistencyCheck, "severity">> = [
    {
      key: "output_tax",
      label: "销项税额（发票 vs 申报）",
      invoiceValueCents: input.invoiceOutputTaxCents,
      comparedValueCents: input.declaredOutputTaxCents,
      differenceCents: input.invoiceOutputTaxCents - input.declaredOutputTaxCents
    },
    {
      key: "input_tax",
      label: "进项税额（发票 vs 申报）",
      invoiceValueCents: input.invoiceInputTaxCents,
      comparedValueCents: input.declaredInputTaxCents,
      differenceCents: input.invoiceInputTaxCents - input.declaredInputTaxCents
    },
    {
      key: "invoice_vs_ledger_revenue",
      label: "收入（发票销售额 vs 账面收入）",
      invoiceValueCents: input.invoiceSalesAmountCents,
      comparedValueCents: input.ledgerRevenueCents,
      differenceCents: input.invoiceSalesAmountCents - input.ledgerRevenueCents
    }
  ];
  const checks: ConsistencyCheck[] = draft.map((check) => ({
    ...check,
    severity: classify(check.differenceCents, tolerance, alertThreshold)
  }));

  return { period: input.period, checks, overall: rollUp(checks) };
}
