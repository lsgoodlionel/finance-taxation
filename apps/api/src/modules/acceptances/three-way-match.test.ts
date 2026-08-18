/**
 * 三单匹配的测试（V13 残留 7）。
 *
 * 「三单」= 合同期次（约定要付多少）、验收（东西真的收到了多少）、
 * 发票（对方开了多少票）。
 *
 * ## 级别的分配：一条都不 block
 *
 * 三种不一致都有**完全正当**的业务解释：
 *
 * - 付款 > 验收 → 预付款、定金，合同里明明白白写着
 * - 开票 > 验收 → 供应商按合同节点开票，货还在路上
 * - 验收 > 开票 → 货到了票没来，月底常态
 *
 * 拦死任何一种都会让正常业务卡住。所以三单匹配的价值不是「拦」，
 * 是**让审批人看见**——他知道这单是预付还是正常结算，才判断得了。
 *
 * 这与 D 批次「只有重复报销是 block」是同一个判断标准：误报代价
 *（正常业务办不了）高于漏报代价（多看一眼）时，就不该 block。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { highestLevel } from "../controls/result.js";
import { matchThreeWay } from "./three-way-match.js";

const BASE = {
  scheduleAmountCents: 100000,
  acceptedAmountCents: 100000,
  invoicedAmountCents: 100000,
  paidAmountCents: 0,
  requestedPaymentCents: 100000
};

test("三单一致时不产生任何提示", () => {
  const findings = matchThreeWay(BASE);

  assert.equal(findings.length, 0);
  assert.equal(highestLevel(findings), "ok");
});

test("没有验收记录时不做验收相关判定", () => {
  // 不是所有合同都要验收（服务类、租赁类常常不需要）。没有验收单
  // 就不该报「未验收」——那会让不需要验收的合同永远带着一条告警。
  const findings = matchThreeWay({ ...BASE, acceptedAmountCents: null });

  assert.equal(
    findings.some((item) => item.code.includes("acceptance")),
    false
  );
});

test("付款超过已验收金额 → warn（预付款是合法安排）", () => {
  const findings = matchThreeWay({
    ...BASE,
    acceptedAmountCents: 40000,
    requestedPaymentCents: 100000
  });

  const finding = findings.find((item) => item.code === "match.payment_exceeds_acceptance");
  assert.ok(finding);
  assert.equal(finding.level, "warn", "预付款合法，不能 block");
  assert.match(finding.message, /400\.00/);
  assert.match(finding.message, /1000\.00/);
});

test("累计付款计入判定，不只看本次", () => {
  // 分批付款时，前几笔已经付掉的钱同样要算进「付了多少」。
  // 只看本次会让「已付 800、验收 400、本次再付 100」被判为正常。
  const findings = matchThreeWay({
    ...BASE,
    acceptedAmountCents: 40000,
    paidAmountCents: 80000,
    requestedPaymentCents: 10000
  });

  const finding = findings.find((item) => item.code === "match.payment_exceeds_acceptance");
  assert.ok(finding, "累计 900 > 验收 400，应当提示");
  assert.match(finding.message, /900\.00/);
});

test("付款恰好等于验收金额不提示", () => {
  const findings = matchThreeWay({
    ...BASE,
    acceptedAmountCents: 60000,
    requestedPaymentCents: 60000
  });

  assert.equal(
    findings.some((item) => item.code === "match.payment_exceeds_acceptance"),
    false
  );
});

test("开票超过已验收 → warn", () => {
  // 供应商按合同节点开票、货还在路上，是正常的。但税务上「先票后货」
  // 有进项抵扣的时点问题，审批人该知道。
  const findings = matchThreeWay({
    ...BASE,
    acceptedAmountCents: 50000,
    invoicedAmountCents: 100000
  });

  const finding = findings.find((item) => item.code === "match.invoice_exceeds_acceptance");
  assert.ok(finding);
  assert.equal(finding.level, "warn");
});

test("验收超过开票 → info 级别的提示，不是 warn", () => {
  // 货到了票没来是月底常态，提示的价值在于「记得催票」，
  // 而不是「这里有问题」。用 warn 会让它和真正的异常混在一起。
  const findings = matchThreeWay({
    ...BASE,
    acceptedAmountCents: 100000,
    invoicedAmountCents: 60000
  });

  const finding = findings.find((item) => item.code === "match.acceptance_exceeds_invoice");
  assert.ok(finding);
  // ControlLevel 没有 info——用 warn 但措辞明确是「待催票」而非「异常」。
  assert.equal(finding.level, "warn");
  assert.match(finding.message, /催/);
});

test("验收金额超过期次金额 → warn", () => {
  // 验收多于合同约定，通常是把别的期次的货算进来了，或者验收单填错。
  const findings = matchThreeWay({
    ...BASE,
    acceptedAmountCents: 150000
  });

  const finding = findings.find((item) => item.code === "match.acceptance_exceeds_schedule");
  assert.ok(finding);
  assert.equal(finding.level, "warn");
});

test("没有发票记录时不做发票相关判定", () => {
  const findings = matchThreeWay({ ...BASE, invoicedAmountCents: null });

  assert.equal(
    findings.some((item) => item.code.includes("invoice")),
    false
  );
});

test("多个问题同时存在时各报各的", () => {
  // 验收 400、开票 1000、付款 1000：开票超验收 + 付款超验收，两条都要报。
  const findings = matchThreeWay({
    ...BASE,
    acceptedAmountCents: 40000,
    invoicedAmountCents: 100000,
    requestedPaymentCents: 100000
  });

  assert.ok(findings.length >= 2);
  assert.equal(highestLevel(findings), "warn", "三单匹配一条都不 block");
});

test("金额必须是非负整数分", () => {
  assert.throws(() => matchThreeWay({ ...BASE, scheduleAmountCents: 1.5 }), /整数分/);
  assert.throws(() => matchThreeWay({ ...BASE, requestedPaymentCents: -1 }), /不得为负/);
});

test("可空字段传 null 不触发校验", () => {
  // null 表示「没有这类记录」，与 0（有记录但金额为零）是不同的语义。
  assert.doesNotThrow(() =>
    matchThreeWay({ ...BASE, acceptedAmountCents: null, invoicedAmountCents: null })
  );
});
