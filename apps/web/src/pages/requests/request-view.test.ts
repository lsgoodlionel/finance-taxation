/**
 * 申请与借款展示逻辑的测试（V13-B8）。
 *
 * 按钮给多了会让人点了才发现不行，给少了会让人以为功能没做——
 * 两种错都不会崩，都只会让用户困惑。
 */

import {
  availableRequestActions,
  canEditRequest,
  isAdvanceOverdue,
} from "./request-view";
import type { AdvanceRow } from "../../lib/api-expense-control";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// 草稿：能提交、能作废
assert(
  availableRequestActions("draft").join(",") === "submit,cancel",
  "expected draft to allow submit and cancel"
);

// 审批中只能撤回——改内容要先撤回，这与服务端 canEdit 一致
assert(
  availableRequestActions("pending").join(",") === "cancel",
  "expected pending to only allow cancel"
);

// 被驳回后能改了再提。驳回不是终点：做成终点会逼用户为同一件事重开一张单
assert(
  availableRequestActions("rejected").includes("submit"),
  "expected rejected to allow resubmit"
);

// 已批准：能标记完成，也能作废（批了但没去成很常见）
assert(
  availableRequestActions("approved").join(",") === "complete,cancel",
  "expected approved to allow complete and cancel"
);

// 终态没有任何动作
assert(availableRequestActions("completed").length === 0, "expected completed to be terminal");
assert(availableRequestActions("cancelled").length === 0, "expected cancelled to be terminal");

// 编辑权限与服务端 canEdit 同一口径
assert(canEditRequest("draft"), "expected draft editable");
assert(canEditRequest("rejected"), "expected rejected editable");
assert(!canEditRequest("pending"), "expected pending not editable");
assert(!canEditRequest("approved"), "expected approved not editable");

const BASE_ADVANCE: AdvanceRow = {
  id: "a1",
  advanceNo: "ADV-202609-0001",
  requestId: null,
  borrowerUserId: "u1",
  counterpartyId: "cp1",
  amountCents: 500000,
  purpose: "出差备用金",
  expectedReturnDate: "2026-09-30",
  status: "paid",
  paymentVoucherId: "v1",
  note: null,
  outstandingCents: 500000,
};

// 过了归还日且账上仍有余额 → 逾期
assert(isAdvanceOverdue(BASE_ADVANCE, "2026-10-01"), "expected overdue when past due with balance");

// 归还日当天不算逾期——闭区间，与期间边界的处理一致
assert(
  !isAdvanceOverdue(BASE_ADVANCE, "2026-09-30"),
  "expected due date itself not to be overdue"
);

// 已还清就不算逾期，哪怕状态还写着 paid。
// 只看状态会漏掉「状态是 paid 但其实早还清了」的情况。
assert(
  !isAdvanceOverdue({ ...BASE_ADVANCE, outstandingCents: 0 }, "2026-12-31"),
  "expected settled balance not to be overdue"
);

// 没设归还日就无从判断逾期，不能默认算逾期
assert(
  !isAdvanceOverdue({ ...BASE_ADVANCE, expectedReturnDate: null }, "2026-12-31"),
  "expected no due date to never be overdue"
);

// 余额为负（公司欠员工，报销超过借款）同样不算逾期
assert(
  !isAdvanceOverdue({ ...BASE_ADVANCE, outstandingCents: -60000 }, "2026-12-31"),
  "expected negative balance not to be overdue"
);

console.log("request-view-ok");
