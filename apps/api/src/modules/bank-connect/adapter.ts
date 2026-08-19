/**
 * 银企直连适配器契约（V14-A）。
 *
 * ## 这一层只定形状，不实现任何一家银行
 *
 * V13 曾把银企直连列入「明确不做」，理由是「各行协议差异极大，抽象层写早了
 * 必定返工」。那个担心是对的——所以这里的接口不是凭空设计的，而是从主流
 * 银企直连（工行、建行、招行、平安）的**共性**倒推出来的四件事：
 *
 * 1. **认证**：证书 + 签名。差别在算法（RSA/SM2）与证书格式，不在「要不要签名」
 * 2. **付款**：报文里都有付款账号、收款账号、金额、用途
 * 3. **查状态**：异步回执，靠流水号关联
 * 4. **查余额与明细**
 *
 * 各行的差异落在**实现**里而不是接口上。V14 只提供 `mock` 实现，
 * 真实实现留给有对接需求时再写——那时这套契约测试就是验收标准。
 *
 * ## 返回值一律是 Result 而不抛异常
 *
 * 银行接口失败是常态（网银证书过期、限额、系统维护窗口），把它当异常处理
 * 会让每个调用点都要 try/catch，而漏掉一处就是一笔付款状态不明。
 */

/** 银行返回的处理状态。**不映射成布尔** —— 「处理中」既不是成功也不是失败。 */
export type BankTransferStatus = "accepted" | "processing" | "succeeded" | "failed" | "unknown";

export interface BankCredential {
  /** 证书引用（文件路径或密钥库别名）。**不存证书内容本身**。 */
  certRef: string;
  /** 签名算法。国内银行以 RSA 与 SM2 为主。 */
  signAlgorithm: "RSA" | "SM2";
  /** 企业在银行侧的客户号 / 签约编号。 */
  customerNo: string;
  /** 接口地址。各行不同，且同一家的测试与生产环境也不同。 */
  endpoint: string;
}

export interface BankTransferRequest {
  /** 我方付款账号。 */
  payerAccount: string;
  payeeAccount: string;
  payeeName: string;
  /** 收款行名称。跨行转账必填，同行可空。 */
  payeeBankName: string | null;
  /** **整数分**。与全系统一致——各行报文里是元，转换在适配器实现里做。 */
  amountCents: number;
  /** 用途/摘要。银行侧通常有长度限制，具体限制由实现校验。 */
  purpose: string;
  /**
   * 我方流水号，幂等键。
   *
   * 同一个流水号重复提交时，银行应当返回首次的结果而不是再付一笔——
   * 这是银企直连最重要的一条约定，也是契约测试里必测的一项。
   */
  clientRef: string;
}

export interface BankTransferResult {
  status: BankTransferStatus;
  /** 银行侧流水号，供后续查询。失败时可能为空。 */
  bankRef: string | null;
  /** 银行返回的原始消息，排查时要看。 */
  message: string;
}

export interface BankBalanceResult {
  account: string;
  /** 整数分。 */
  availableCents: number;
  currency: string;
}

/**
 * 银企直连适配器。
 *
 * 实现方负责：报文组装、签名、网络调用、错误码到 `BankTransferStatus` 的映射。
 * 调用方只依赖这个接口，不感知任何一家银行的细节。
 */
export interface BankAdapter {
  /** 适配器标识，如 `mock` / `icbc` / `cmb`。 */
  readonly provider: string;

  /**
   * 连通性与凭据校验。
   *
   * **不发起任何资金操作**——它的作用是让用户在配置页点一下就知道证书对不对，
   * 而不是等到真的要付款时才发现。
   */
  testConnection(credential: BankCredential): Promise<{ ok: boolean; message: string }>;

  /** 发起付款。幂等由 `clientRef` 保证。 */
  transfer(
    credential: BankCredential,
    request: BankTransferRequest
  ): Promise<BankTransferResult>;

  /** 按我方流水号查状态。异步回执场景下靠它轮询。 */
  queryStatus(credential: BankCredential, clientRef: string): Promise<BankTransferResult>;

  /** 查余额。 */
  queryBalance(credential: BankCredential, account: string): Promise<BankBalanceResult>;
}

/** 适配器注册表。真实实现接入时在这里注册，调用方按 provider 取。 */
const REGISTRY = new Map<string, BankAdapter>();

export function registerBankAdapter(adapter: BankAdapter): void {
  REGISTRY.set(adapter.provider, adapter);
}

/**
 * 取适配器；未注册时返回 null 而不抛错。
 *
 * 配置里写了一个还没实现的银行（比如用户先填了「工行」但实现还没接）
 * 是正常状态——调用方据此提示「该银行尚未接入」，而不是崩一个未捕获异常。
 */
export function getBankAdapter(provider: string): BankAdapter | null {
  return REGISTRY.get(provider) ?? null;
}

export function listRegisteredProviders(): string[] {
  return [...REGISTRY.keys()].sort();
}
