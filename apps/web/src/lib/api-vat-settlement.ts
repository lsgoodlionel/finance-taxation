/**
 * 增值税期末结转的前端接口（V15 补的前台入口，后端是 V12-B8）。
 *
 * ## 每月必做，而前台一直没有入口
 *
 * 月末把「应交税费—应交增值税」各专栏轧平，该缴的转到「未交增值税」。
 * 不做的后果是应交增值税科目上的专栏一直累计，而报表上的应交税费
 * **是几个月的和**，报税时对不上。
 */

import { request } from "./api";

export type VatSettlementOutcome =
  /** 应交未交：本期该缴税，结转到未交增值税。 */
  | "payable"
  /** 多交：当月已缴超过应缴，转出多交增值税。 */
  | "overpaid"
  /** 留抵：进项大于销项，**不结转**，留抵继续挂在进项科目。 */
  | "credit_carried"
  /** 轧平：应交增值税专栏合计为零，无需结转。 */
  | "balanced"
  /** 不适用：小规模纳税人 / 一般纳税人简易计税，没有专栏可轧。 */
  | "not_applicable";

export interface VatSettlementLine {
  summary: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface VatSettlementPlan {
  companyId: string;
  period: string;
  outcome: VatSettlementOutcome;
  payableAmount: string;
  overpaidAmount: string;
  /** 留抵税额——只报告，不做分录。 */
  creditCarriedForward: string;
  prepaidTransferred: string;
  /** 空数组表示不生成凭证。**空不等于出错**。 */
  lines: VatSettlementLine[];
  /** 后端给会计看的一句话解释，直接可展示。 */
  reason: string;
  existingVoucherId?: string | null;
  existingVoucherStatus?: string | null;
}

export async function previewVatSettlement(period: string) {
  return request<VatSettlementPlan>(
    `/api/tax/vat-settlement?period=${encodeURIComponent(period)}`
  );
}

export async function createVatSettlementVoucher(period: string) {
  return request<VatSettlementPlan & { voucherId: string | null }>("/api/tax/vat-settlement", {
    method: "POST",
    body: JSON.stringify({ period })
  });
}
