/**
 * 以前年度亏损台账（V17 阶段三批次 C）。
 *
 * 台账的第一批数据来自系统上线之前——企业换系统时，前几年的亏损
 * 还在结转期内，而自动生成覆盖不了历史。
 */
import { request } from "./api";

export interface LossLedgerRecord {
  id: string;
  lossYear: number;
  /** 当年亏损额（分）。 */
  lossCents: number;
  /** 已弥补额（分）。 */
  offsetCents: number;
  /** 剩余可弥补额（分）。服务端算好的，前端不重算——重算会与它漂移。 */
  remainingCents: number;
  note?: string;
}

export async function listLossLedger() {
  return request<{ items: LossLedgerRecord[]; total: number }>("/api/tax/loss-ledger");
}

export async function createLossLedgerEntry(input: {
  lossYear: number;
  /** 分。元转分的换算在调用方一处做完。 */
  lossCents: number;
  offsetCents?: number;
  note?: string;
}) {
  return request<LossLedgerRecord>("/api/tax/loss-ledger", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
