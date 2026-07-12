import type { InvoiceProvider } from "./provider.js";
import { MockInvoiceProvider } from "./mock-provider.js";

/**
 * 开票提供方工厂——按配置选择实现。默认 mock（本地/测试/E2E）；'nuonuo'
 * 为持牌真实开票预留槽：未配置凭证时返回明确报错的占位实现（不静默失败），
 * 待接入诺诺沙箱→生产（见部署清单的外部凭证项）。
 */
export type InvoiceProviderKind = "mock" | "nuonuo";

export interface InvoiceProviderConfig {
  kind?: InvoiceProviderKind;
  /** 诺诺等真实提供方所需凭证。 */
  credentials?: { appKey?: string; appSecret?: string; taxNo?: string };
}

class UnconfiguredProvider implements InvoiceProvider {
  constructor(readonly name: string) {}
  async issue() {
    return {
      ok: false as const,
      status: "failed" as const,
      error: `${this.name} 开票连接器未配置凭证：请在部署环境提供 appKey/appSecret/taxNo（见 V5 部署清单）`
    };
  }
  async query(invoiceNumber: string) {
    return { ok: false as const, invoiceNumber, status: "not_found" as const };
  }
}

export function createInvoiceProvider(config: InvoiceProviderConfig = {}): InvoiceProvider {
  const kind = config.kind ?? "mock";
  if (kind === "mock") {
    return new MockInvoiceProvider();
  }
  // nuonuo：凭证齐全才可实例化真实实现（当前仅预留占位，真实实现待接入）。
  const hasCreds = Boolean(config.credentials?.appKey && config.credentials?.appSecret);
  if (!hasCreds) {
    return new UnconfiguredProvider(kind);
  }
  // TODO(D1): 接入诺诺沙箱→生产真实实现；凭证齐全时暂仍占位以免误发。
  return new UnconfiguredProvider(kind);
}
