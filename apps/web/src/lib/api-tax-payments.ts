/**
 * 税款缴纳记录（V17 阶段三批次 B）。
 *
 * 附加税以**实际缴纳**的增值税为计税依据。这个事实此前在系统里没有落点——
 * 申报批次的状态机到 submitted 就结束了，不含「已缴纳」，也不存金额。
 */
import { request } from "./api";

export interface TaxPaymentRecord {
  id: string;
  taxType: string;
  filingPeriod: string;
  /** 实缴金额（分）。界面按元显示。 */
  amountCents: number;
  paidOn: string;
  voucherId?: string | null;
  note?: string;
}

export async function listTaxPayments(filingPeriod: string) {
  return request<{ items: TaxPaymentRecord[]; total: number }>(
    `/api/tax/payments?filingPeriod=${encodeURIComponent(filingPeriod)}`
  );
}

export async function createTaxPayment(input: {
  taxType: string;
  filingPeriod: string;
  /** 分。元转分的换算在调用方一处做完。 */
  amountCents: number;
  paidOn: string;
  note?: string;
}) {
  return request<TaxPaymentRecord>("/api/tax/payments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
