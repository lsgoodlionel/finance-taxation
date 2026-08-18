/**
 * 费用分摊的测试（V13-B7）。
 *
 * 一张报销单的一行费用要拆给多个部门。与外币分摊、折旧排程同一套做法：
 * **整数分计算 + 末项扫尾**，保证各部分之和严格等于总额。
 *
 * 不扫尾的后果不是「差一分」——是分摊出来的凭证借贷不平，过不了账。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { allocateByRatio, allocateByAmount, type AllocationInput } from "./allocation.js";

test("按比例分摊，各部分之和等于总额", () => {
  // Arrange：1000 元分给三个部门，各 1/3
  const shares: AllocationInput[] = [
    { costCenterId: "a", ratioBp: 3333 },
    { costCenterId: "b", ratioBp: 3333 },
    { costCenterId: "c", ratioBp: 3334 }
  ];

  // Act
  const result = allocateByRatio(100000, shares);

  // Assert
  assert.equal(result.reduce((sum, item) => sum + item.amountCents, 0), 100000);
});

test("除不尽时末项扫尾，不是每项四舍五入", () => {
  // 100 分给 3 份：33.33 + 33.33 + 33.34。每项独立四舍五入会得到
  // 33+33+33=99，凭空少一分——而那一分会让凭证借贷不平、过不了账。
  const result = allocateByRatio(100, [
    { costCenterId: "a", ratioBp: 3333 },
    { costCenterId: "b", ratioBp: 3333 },
    { costCenterId: "c", ratioBp: 3334 }
  ]);

  assert.equal(result.reduce((sum, item) => sum + item.amountCents, 0), 100);
  // 前两项按比例截断，末项拿走余数
  assert.equal(result[2]!.amountCents, 100 - result[0]!.amountCents - result[1]!.amountCents);
});

test("单个部门拿全额", () => {
  const result = allocateByRatio(12345, [{ costCenterId: "a", ratioBp: 10000 }]);

  assert.equal(result.length, 1);
    assert.equal(result[0]!.amountCents, 12345);
});

test("比例合计必须是 10000 基点", () => {
  // 不足 100% 会让一部分费用无声地不归任何部门；超过 100% 会让分摊金额
  // 大于报销金额。两者都要拒。
  assert.throws(
    () => allocateByRatio(100, [{ costCenterId: "a", ratioBp: 5000 }]),
    /10000/
  );
  assert.throws(
    () =>
      allocateByRatio(100, [
        { costCenterId: "a", ratioBp: 6000 },
        { costCenterId: "b", ratioBp: 5000 }
      ]),
    /10000/
  );
});

test("比例必须为正", () => {
  // 0% 的分摊行没有意义，负数更是。留着会在报表上出现一个金额为 0 的部门行。
  assert.throws(
    () =>
      allocateByRatio(100, [
        { costCenterId: "a", ratioBp: 10000 },
        { costCenterId: "b", ratioBp: 0 }
      ]),
    /必须为正/
  );
});

test("总额必须是非负整数分", () => {
  assert.throws(() => allocateByRatio(1.5, [{ costCenterId: "a", ratioBp: 10000 }]), /整数分/);
  assert.throws(() => allocateByRatio(-1, [{ costCenterId: "a", ratioBp: 10000 }]), /不得为负/);
});

test("空分摊列表被拒绝", () => {
  // 没有分摊对象时应当不分摊（整笔归「未指定」），而不是分摊到零个部门。
  // 让调用方显式处理，比在这里返回空数组更安全。
  assert.throws(() => allocateByRatio(100, []), /至少一项/);
});

test("重复的成本中心被拒绝", () => {
  // 同一个部门出现两行，报表上会看到它被分了两次——这是配置错误，
  // 而合并它们是在替用户猜意图。
  assert.throws(
    () =>
      allocateByRatio(100, [
        { costCenterId: "a", ratioBp: 5000 },
        { costCenterId: "a", ratioBp: 5000 }
      ]),
    /重复/
  );
});

test("按金额直接分摊时校验合计相符", () => {
  // 另一种录入方式：用户直接填每个部门多少钱，而不是填比例。
  const result = allocateByAmount(100000, [
    { costCenterId: "a", amountCents: 60000 },
    { costCenterId: "b", amountCents: 40000 }
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0]!.amountCents, 60000);
});

test("按金额分摊时合计不符直接拒绝，不自动调平", () => {
  // 自动把差额塞给某一行是在替用户改数字——他填错了应当知道，
  // 而不是发现凭证上的部门金额与自己填的不一样。
  assert.throws(
    () =>
      allocateByAmount(100000, [
        { costCenterId: "a", amountCents: 60000 },
        { costCenterId: "b", amountCents: 30000 }
      ]),
    /合计/
  );
});

test("按金额分摊算出的比例可回溯", () => {
  // 存比例是为了金额变更时能重算。60/40 应当得到 6000/4000 基点。
  const result = allocateByAmount(100000, [
    { costCenterId: "a", amountCents: 60000 },
    { costCenterId: "b", amountCents: 40000 }
  ]);

  assert.equal(result[0]!.ratioBp, 6000);
  assert.equal(result[1]!.ratioBp, 4000);
});

test("按金额分摊的比例除不尽时同样末项扫尾", () => {
  // 100 分成 33/33/34 → 3300/3300/3400 基点，合计必须是 10000。
  const result = allocateByAmount(100, [
    { costCenterId: "a", amountCents: 33 },
    { costCenterId: "b", amountCents: 33 },
    { costCenterId: "c", amountCents: 34 }
  ]);

  assert.equal(result.reduce((sum, item) => sum + item.ratioBp, 0), 10000);
});

test("零元报销行的分摊：比例保留，金额全零", () => {
  // 报销行金额是 0 但仍指定了分摊部门——这在「先建行后填金额」的录入
  // 顺序下会出现。不该抛错，各部门分到 0 是正确答案。
  const result = allocateByRatio(0, [
    { costCenterId: "a", ratioBp: 5000 },
    { costCenterId: "b", ratioBp: 5000 }
  ]);

  assert.equal(result.every((item) => item.amountCents === 0), true);
  assert.equal(result.length, 2);
});
