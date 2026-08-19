/**
 * 银企适配器的**契约测试**（V14-A，护栏 1）。
 *
 * ## 这套测试是给未来的真实适配器写的
 *
 * 它不测 mock 的内部实现，测的是**任何一个适配器都必须满足的行为**。
 * 将来接工行、招行时，把那个适配器塞进 `runAdapterContract` 就能验收——
 * 通不过说明实现有问题，而不是「银行就是这样的」。
 *
 * V13 把银企直连列入「明确不做」时说过「抽象层写早了必定返工」。
 * 这套契约就是对冲那个风险的方式：**接口的形状由行为约定固定下来**，
 * 而不是由第一个实现的偶然细节固定下来。
 *
 * ## 五条约定
 *
 * 1. `testConnection` 校验凭据完整性，缺项必须报错而不是假成功
 * 2. `transfer` 按 `clientRef` 幂等——重复提交返回首次结果，不重复付款
 * 3. 金额非法、收款信息缺失时返回 `failed` 而不是抛异常
 * 4. `queryStatus` 查不到时返回 `unknown` 而不是 `failed`
 * 5. 所有方法都返回 Result，任何情况下不抛异常
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { BankAdapter, BankCredential } from "./adapter.js";
import { __resetMockAdapter, mockBankAdapter } from "./mock-adapter.js";

const VALID_CREDENTIAL: BankCredential = {
  certRef: "/certs/company.pfx",
  signAlgorithm: "RSA",
  customerNo: "CUST-0001",
  endpoint: "https://bank.example.com/api"
};

const VALID_REQUEST = {
  payerAccount: "6222020000000001",
  payeeAccount: "6222029999999999",
  payeeName: "某某供应商",
  payeeBankName: "工商银行深圳分行",
  amountCents: 100000,
  purpose: "货款",
  clientRef: "PAY-CONTRACT-0001"
};

/**
 * 契约套件。任何 `BankAdapter` 实现都应当通过。
 *
 * 接新银行时这样用：
 * ```ts
 * runAdapterContract("icbc", icbcAdapter, () => resetIcbcSandbox());
 * ```
 */
function runAdapterContract(
  name: string,
  adapter: BankAdapter,
  reset: () => void | Promise<void>
): void {
  test(`[契约] ${name}：凭据缺项时 testConnection 必须失败`, async () => {
    await reset();
    // 配置页点「测试连接」得到「成功」，而实际证书都没填——
    // 那个成功比失败更有害：用户会以为配好了。
    const noCert = await adapter.testConnection({ ...VALID_CREDENTIAL, certRef: "" });
    assert.equal(noCert.ok, false);
    assert.match(noCert.message, /证书/);

    const noCustomer = await adapter.testConnection({ ...VALID_CREDENTIAL, customerNo: "" });
    assert.equal(noCustomer.ok, false);

    const badEndpoint = await adapter.testConnection({
      ...VALID_CREDENTIAL,
      endpoint: "bank.example.com"
    });
    assert.equal(badEndpoint.ok, false, "地址缺协议头应当被拒");
  });

  test(`[契约] ${name}：凭据完整时 testConnection 成功`, async () => {
    await reset();
    const result = await adapter.testConnection(VALID_CREDENTIAL);
    assert.equal(result.ok, true);
  });

  test(`[契约] ${name}：transfer 按 clientRef 幂等`, async () => {
    await reset();
    // **银企直连最重要的一条约定**：同一流水号重复提交返回首次结果，
    // 而不是再付一笔。网络重试在支付链路上是常态。
    const first = await adapter.transfer(VALID_CREDENTIAL, VALID_REQUEST);
    const second = await adapter.transfer(VALID_CREDENTIAL, VALID_REQUEST);

    assert.equal(second.bankRef, first.bankRef, "同一流水号必须返回同一银行流水号");
    assert.equal(second.status, first.status);
  });

  test(`[契约] ${name}：不同 clientRef 是不同的付款`, async () => {
    await reset();
    const a = await adapter.transfer(VALID_CREDENTIAL, VALID_REQUEST);
    const b = await adapter.transfer(VALID_CREDENTIAL, {
      ...VALID_REQUEST,
      clientRef: "PAY-CONTRACT-0002"
    });

    assert.notEqual(b.bankRef, a.bankRef);
  });

  test(`[契约] ${name}：金额非法返回 failed 而不是抛异常`, async () => {
    await reset();
    for (const amount of [0, -100, 1.5]) {
      const result = await adapter.transfer(VALID_CREDENTIAL, {
        ...VALID_REQUEST,
        amountCents: amount,
        clientRef: `PAY-BAD-${amount}`
      });
      assert.equal(result.status, "failed", `金额 ${amount} 应当被拒`);
    }
  });

  test(`[契约] ${name}：收款信息缺失返回 failed`, async () => {
    await reset();
    // 真银行会直接退回。mock 也要拒——否则开发期看不出「导出的账号列是空的」。
    const noAccount = await adapter.transfer(VALID_CREDENTIAL, {
      ...VALID_REQUEST,
      payeeAccount: "",
      clientRef: "PAY-NO-ACCOUNT"
    });
    assert.equal(noAccount.status, "failed");

    const noName = await adapter.transfer(VALID_CREDENTIAL, {
      ...VALID_REQUEST,
      payeeName: "",
      clientRef: "PAY-NO-NAME"
    });
    assert.equal(noName.status, "failed");
  });

  test(`[契约] ${name}：queryStatus 查不到时返回 unknown 而非 failed`, async () => {
    await reset();
    // 查不到不等于失败——可能只是还没同步。把它当失败会让一笔可能成功的
    // 付款被错误地标记，而那种错误在对账时最难查。
    const result = await adapter.queryStatus(VALID_CREDENTIAL, "PAY-NEVER-SUBMITTED");
    assert.equal(result.status, "unknown");
  });

  test(`[契约] ${name}：受理过的付款能查到状态`, async () => {
    await reset();
    await adapter.transfer(VALID_CREDENTIAL, VALID_REQUEST);
    const result = await adapter.queryStatus(VALID_CREDENTIAL, VALID_REQUEST.clientRef);

    assert.notEqual(result.status, "unknown");
    assert.ok(result.bankRef);
  });

  test(`[契约] ${name}：queryBalance 返回整数分`, async () => {
    await reset();
    const balance = await adapter.queryBalance(VALID_CREDENTIAL, VALID_REQUEST.payerAccount);

    assert.equal(Number.isInteger(balance.availableCents), true, "余额必须是整数分");
    assert.equal(balance.account, VALID_REQUEST.payerAccount);
  });

  test(`[契约] ${name}：任何情况下不抛异常`, async () => {
    await reset();
    // 银行接口失败是常态（证书过期、限额、维护窗口）。把它当异常处理会让
    // 每个调用点都要 try/catch，而漏掉一处就是一笔付款状态不明。
    await assert.doesNotReject(() =>
      adapter.transfer(VALID_CREDENTIAL, {
        ...VALID_REQUEST,
        amountCents: -1,
        payeeAccount: "",
        clientRef: "PAY-ALL-BAD"
      })
    );
    await assert.doesNotReject(() => adapter.queryStatus(VALID_CREDENTIAL, ""));
    await assert.doesNotReject(() =>
      adapter.testConnection({ certRef: "", signAlgorithm: "SM2", customerNo: "", endpoint: "" })
    );
  });
}

// V14 只有 mock 实现。接真银行时在这里加一行。
runAdapterContract("mock", mockBankAdapter, __resetMockAdapter);

test("适配器注册表：未注册的银行返回 null 而不抛错", async () => {
  const { getBankAdapter, registerBankAdapter, listRegisteredProviders } = await import(
    "./adapter.js"
  );

  // 配置里写了一个还没实现的银行是正常状态——用户先填了「工行」但实现还没接。
  // 调用方据此提示「该银行尚未接入」，而不是崩一个未捕获异常。
  assert.equal(getBankAdapter("icbc-not-implemented"), null);

  registerBankAdapter(mockBankAdapter);
  assert.equal(getBankAdapter("mock"), mockBankAdapter);
  assert.ok(listRegisteredProviders().includes("mock"));
});
