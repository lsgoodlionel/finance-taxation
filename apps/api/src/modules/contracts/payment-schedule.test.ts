/**
 * 合同付款计划的测试（V13-C1/C2）。
 *
 * 期次状态由**已付金额推导**，不存字段。与报销合计、借款余额同一原则：
 * 存一份冗余状态，迟早出现「状态写着已付、实际只付了一半」，而那时没人
 * 知道该信哪个。
 *
 * 质保金是付款计划里的**独立一期**，不是合同上的一个字段——不这么做，
 * 合同会永远显示「未付清」（因为质保金那部分一直没付）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  contractPaymentProgress,
  isRetentionReleasable,
  scheduleStatus,
  type PaymentScheduleRow
} from "./payment-schedule.js";

const BASE: PaymentScheduleRow = {
  id: "s1",
  contractId: "c1",
  periodNo: 1,
  title: "首付款",
  dueDate: "2026-06-30",
  amountCents: 100000,
  scheduleType: "normal",
  retentionReleaseDate: null,
  isCancelled: false
};

test("未付时状态是待付", () => {
  assert.equal(scheduleStatus(BASE, 0), "pending");
});

test("付满即已付", () => {
  assert.equal(scheduleStatus(BASE, 100000), "paid");
});

test("付了一部分是部分付款", () => {
  // 分批付同一期在工程类合同里很常见，不该显示成「未付」。
  assert.equal(scheduleStatus(BASE, 40000), "partial");
});

test("多付也算已付，不造一个「超付」状态", () => {
  // 超付通常是含税不含税弄错或多转了一笔，要在对账时发现——
  // 造一个状态出来会让它看起来是正常业务形态。
  assert.equal(scheduleStatus(BASE, 120000), "paid");
});

test("已作废的期次无论付没付都是作废", () => {
  const cancelled = { ...BASE, isCancelled: true };

  assert.equal(scheduleStatus(cancelled, 0), "cancelled");
  assert.equal(scheduleStatus(cancelled, 100000), "cancelled");
});

test("逾期判定：过了约定日且没付满", () => {
  assert.equal(scheduleStatus(BASE, 0, "2026-07-01"), "overdue");
  assert.equal(scheduleStatus(BASE, 40000, "2026-07-01"), "overdue");
});

test("约定日当天不算逾期", () => {
  // 闭区间，与预算期间、费用标准生效期一致。
  assert.equal(scheduleStatus(BASE, 0, "2026-06-30"), "pending");
});

test("付满之后不再逾期", () => {
  assert.equal(scheduleStatus(BASE, 100000, "2026-12-31"), "paid");
});

test("不传今天则不做逾期判定", () => {
  // 列表页要显示业务状态，逾期是可选的加强判断。不传就退回基本状态，
  // 而不是拿系统时间偷偷判——那会让同一份数据在不同机器上显示不同。
  assert.equal(scheduleStatus(BASE, 0), "pending");
});

test("质保金期次的状态判定与普通期一致", () => {
  const retention = { ...BASE, scheduleType: "retention" as const, title: "质保金" };

  assert.equal(scheduleStatus(retention, 0), "pending");
  assert.equal(scheduleStatus(retention, 100000), "paid");
});

test("质保金到期才可释放", () => {
  const retention: PaymentScheduleRow = {
    ...BASE,
    scheduleType: "retention",
    title: "质保金",
    retentionReleaseDate: "2027-06-30"
  };

  assert.equal(isRetentionReleasable(retention, "2027-06-29"), false);
  // 到期当天可释放——闭区间。
  assert.equal(isRetentionReleasable(retention, "2027-06-30"), true);
  assert.equal(isRetentionReleasable(retention, "2027-07-01"), true);
});

test("普通期次不参与质保金释放判定", () => {
  // 传普通期次进来是调用方的错，但返回 true 会让它被当成可释放的质保金。
  assert.equal(isRetentionReleasable(BASE, "2030-01-01"), false);
});

test("质保金没设到期日时不可释放", () => {
  // 没设到期日说明合同条款还没录全。默认可释放会让钱提前付出去。
  const retention = { ...BASE, scheduleType: "retention" as const, retentionReleaseDate: null };

  assert.equal(isRetentionReleasable(retention, "2030-01-01"), false);
});

test("合同进度：已付、待付与质保金分开算", () => {
  // 三个数要分开：质保金是「约定要延后付」的部分，混进待付里会让
  // 出纳以为现在就该付。
  const schedules: PaymentScheduleRow[] = [
    { ...BASE, id: "s1", periodNo: 1, amountCents: 600000 },
    { ...BASE, id: "s2", periodNo: 2, amountCents: 300000 },
    {
      ...BASE,
      id: "s3",
      periodNo: 3,
      amountCents: 100000,
      scheduleType: "retention",
      title: "质保金"
    }
  ];
  const paid = new Map([
    ["s1", 600000],
    ["s2", 100000],
    ["s3", 0]
  ]);

  const progress = contractPaymentProgress(schedules, paid);

  assert.equal(progress.totalCents, 1000000);
  assert.equal(progress.paidCents, 700000);
  assert.equal(progress.unpaidCents, 200000, "待付不含质保金");
  assert.equal(progress.retentionCents, 100000);
});

test("合同进度：作废的期次不计入任何口径", () => {
  const schedules: PaymentScheduleRow[] = [
    { ...BASE, id: "s1", amountCents: 500000 },
    { ...BASE, id: "s2", amountCents: 500000, isCancelled: true }
  ];

  const progress = contractPaymentProgress(schedules, new Map([["s1", 500000]]));

  assert.equal(progress.totalCents, 500000);
  assert.equal(progress.paidCents, 500000);
  assert.equal(progress.unpaidCents, 0);
});

test("合同进度：全部付清但质保金未释放时不算「已付清」", () => {
  // 这是质保金要做成独立一期的核心理由：不这么做，合同要么永远显示
  // 未付清，要么在质保金还没付时就显示已付清——两种都是错的。
  const schedules: PaymentScheduleRow[] = [
    { ...BASE, id: "s1", amountCents: 900000 },
    { ...BASE, id: "s2", amountCents: 100000, scheduleType: "retention", title: "质保金" }
  ];

  const progress = contractPaymentProgress(schedules, new Map([["s1", 900000]]));

  assert.equal(progress.isFullyPaid, false, "质保金没付就不算付清");
  assert.equal(progress.isMainPaid, true, "但主体款项已付清");
});

test("合同进度：空计划返回零，不抛错", () => {
  // 合同刚建、还没录付款计划是正常状态。
  const progress = contractPaymentProgress([], new Map());

  assert.equal(progress.totalCents, 0);
  assert.equal(progress.isFullyPaid, false, "没有计划不能算付清");
});
