/**
 * Mock 银企适配器（V14-A）。
 *
 * **不发起任何网络请求**——V14 的约束就是「框架就位、不做实际验证」。
 *
 * 它的价值有两个：
 *
 * 1. 让整条链路（配置 → 生成指令 → 提交 → 查状态 → 回写）在没有真银行的
 *    情况下能跑通、能测；
 * 2. 作为契约的**参照实现**——将来接真银行时，那套契约测试就是验收标准。
 *
 * ## 幂等用内存表模拟
 *
 * 真银行按 `clientRef` 去重。这里用一个 Map 模拟同样的行为，让调用方的
 * 幂等逻辑在开发期就能被验证——而不是等接了真银行才发现自己重复提交。
 *
 * 内存表**不持久化**：进程重启就清空。这是 mock 的正确行为——它不是数据库，
 * 假装持久化反而会让人以为这里能当真用。
 */

import type {
  BankAdapter,
  BankBalanceResult,
  BankCredential,
  BankTransferRequest,
  BankTransferResult
} from "./adapter.js";

/** 按 clientRef 记住已受理的付款，模拟银行侧的幂等。 */
const acceptedByClientRef = new Map<string, BankTransferResult>();

/** 生成一个像模像样的银行流水号，便于在日志里辨认。 */
function makeBankRef(clientRef: string): string {
  // 取 clientRef 的哈希后八位——同一个 clientRef 永远得到同一个 bankRef，
  // 这样重复提交返回的结果完全一致，与真银行的幂等行为吻合。
  let hash = 0;
  for (const char of clientRef) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return `MOCK${Math.abs(hash).toString().padStart(10, "0").slice(0, 10)}`;
}

export const mockBankAdapter: BankAdapter = {
  provider: "mock",

  async testConnection(credential: BankCredential) {
    // 校验必填项。真适配器这里会做证书解析与签名试算，mock 只查形状——
    // 但**校验本身不能省**：配置页点「测试连接」得到「成功」，
    // 而实际连证书路径都没填，那个成功比失败更有害。
    if (credential.certRef.trim() === "") {
      return { ok: false, message: "未配置证书引用" };
    }
    if (credential.customerNo.trim() === "") {
      return { ok: false, message: "未配置客户号" };
    }
    if (!/^https?:\/\//.test(credential.endpoint)) {
      return { ok: false, message: "接口地址应以 http:// 或 https:// 开头" };
    }
    return {
      ok: true,
      message: `模拟适配器连通性正常（${credential.signAlgorithm} 签名，未发起真实请求）`
    };
  },

  async transfer(credential: BankCredential, request: BankTransferRequest) {
    const existing = acceptedByClientRef.get(request.clientRef);
    if (existing) {
      // 幂等：同一流水号返回首次结果，不再「付」一笔。
      return existing;
    }

    if (!Number.isInteger(request.amountCents) || request.amountCents <= 0) {
      return {
        status: "failed",
        bankRef: null,
        message: `金额必须是正整数分，收到 ${request.amountCents}`
      };
    }
    if (request.payeeAccount.trim() === "" || request.payeeName.trim() === "") {
      // 收款账号或户名为空在真银行会被直接退回，mock 也要拒——
      // 否则开发期看不出「导出的账号列是空的」这个问题。
      return { status: "failed", bankRef: null, message: "收款账号与户名不能为空" };
    }

    const result: BankTransferResult = {
      // 受理不等于成功：真银行大多是异步的，先给「已受理」再回执。
      // mock 也这么做，让调用方的轮询逻辑在开发期就被走到。
      status: "accepted",
      bankRef: makeBankRef(request.clientRef),
      message: "模拟受理成功，未发起真实请求"
    };
    acceptedByClientRef.set(request.clientRef, result);
    return result;
  },

  async queryStatus(_credential: BankCredential, clientRef: string) {
    const existing = acceptedByClientRef.get(clientRef);
    if (!existing) {
      // 查不到不等于失败——可能是还没同步过来。返回 unknown 让调用方继续等，
      // 而不是把一笔可能成功的付款标记成失败。
      return { status: "unknown", bankRef: null, message: "未查到该流水号" };
    }
    // 模拟异步回执：受理过的单子在查询时变成成功。
    return { ...existing, status: "succeeded", message: "模拟处理完成" };
  },

  async queryBalance(_credential: BankCredential, account: string) {
    return {
      account,
      // 固定值。**不随机**——随机余额会让测试无法断言，而 mock 的用途就是被测试。
      availableCents: 100_000_00,
      currency: "CNY"
    };
  }
};

/** 供测试重置内存态。生产代码不该调用它。 */
export function __resetMockAdapter(): void {
  acceptedByClientRef.clear();
}
