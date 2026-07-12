import { createHash } from "node:crypto";
import {
  computeInvoiceTotals,
  type InvoiceProvider,
  type IssueInvoiceRequest,
  type IssueInvoiceResult,
  type QueryInvoiceResult
} from "./provider.js";

/**
 * 本地/测试用开票提供方——确定性沙箱：不联网，按幂等键确定生成发票号，
 * 校验必填项与金额，回显合计。行为对齐真实开票语义，便于系统内全流程测试与
 * E2E；生产切换为诺诺真实实现即可，应用层无需改动。
 */
export class MockInvoiceProvider implements InvoiceProvider {
  readonly name = "mock";

  async issue(request: IssueInvoiceRequest): Promise<IssueInvoiceResult> {
    if (!request.sellerTaxNo || !request.buyerTaxNo || !request.buyerName) {
      return { ok: false, status: "failed", error: "销方/购方税号与购方名称必填" };
    }
    if (!Array.isArray(request.items) || request.items.length === 0) {
      return { ok: false, status: "failed", error: "至少一条开票明细" };
    }
    if (request.items.some((i) => i.amountCents <= 0 || i.taxRate < 0)) {
      return { ok: false, status: "failed", error: "明细金额须为正、税率非负" };
    }

    const { amountCents, taxCents, totalCents } = computeInvoiceTotals(request.items);
    // 确定性发票号：同幂等键 → 同号（模拟去重开票）。
    const digest = createHash("sha256").update(request.idempotencyKey).digest("hex");
    const invoiceNumber = `MOCK${digest.slice(0, 16).toUpperCase()}`;

    return { ok: true, status: "issued", invoiceNumber, amountCents, taxCents, totalCents };
  }

  async query(invoiceNumber: string): Promise<QueryInvoiceResult> {
    if (typeof invoiceNumber === "string" && invoiceNumber.startsWith("MOCK")) {
      return { ok: true, invoiceNumber, status: "valid" };
    }
    return { ok: true, invoiceNumber, status: "not_found" };
  }
}
