/**
 * 报销单待审批时，谁看得到「批准/驳回」（V16）。
 *
 * ## 缺陷
 *
 * 申请单、借款单、报销单三种**全部只能「提交」**，前端不存在任何批准/驳回入口，
 * 提交后永久停在 `pending`。员工在角色实验里提交完就卡住了，
 * 而配好的审批流也没人推得动。
 *
 * ## 这里测的是判定，不是渲染
 *
 * 「谁该看到审批按钮」是一条业务判断，独立于表格怎么画。
 * 把它抽成纯函数，比断言 HTML 片段稳定得多——表格改版不该让这条规则失去覆盖。
 *
 * ## 两层防线
 *
 * 界面上不显示**不等于**点不了：服务端还会独立校验一次
 * （`expense.manage` + 审批人 ≠ 申请人，见 `self-approval.integration.test.ts`）。
 * 这一层只负责不给用户看必然点不动的按钮。
 */

import { canShowApprovalActions } from "./approval-actions";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const MANAGER = { userId: "usr-manager", permissions: ["expense.view", "expense.manage"] };
const EMPLOYEE = { userId: "usr-employee", permissions: ["expense.view", "expense.submit"] };

// ── 有审批权、且不是自己的单：显示 ──────────────────────────────────────────
assert(
  canShowApprovalActions({ status: "pending", applicantUserId: "usr-employee" }, MANAGER),
  "有 expense.manage 的人应当能审批别人的单"
);

// ── 有审批权，但这是自己的单：不显示 ────────────────────────────────────────
//
// 内控底线：任何角色都不能审批自己提交的单据。
assert(
  !canShowApprovalActions({ status: "pending", applicantUserId: "usr-manager" }, MANAGER),
  "不能审批自己提交的报销单，按钮也不该出现"
);

// ── 没有审批权：不显示 ──────────────────────────────────────────────────────
assert(
  !canShowApprovalActions({ status: "pending", applicantUserId: "usr-other" }, EMPLOYEE),
  "普通员工没有费用审批权"
);

// ── 不是待审批状态：不显示 ──────────────────────────────────────────────────
for (const status of ["draft", "approved", "rejected", "paid"]) {
  assert(
    !canShowApprovalActions({ status, applicantUserId: "usr-employee" }, MANAGER),
    `${status} 状态不该有审批按钮——只有 pending 才等着人批`
  );
}

// ── 权限清单缺失时按「没有权限」处理 ────────────────────────────────────────
//
// `/api/access/me` 还没返回、或旧后端不带 permissions 字段时，
// 宁可少显示一个按钮，也不要显示一个点下去弹 403 的按钮。
assert(
  !canShowApprovalActions(
    { status: "pending", applicantUserId: "usr-employee" },
    { userId: "usr-manager", permissions: undefined }
  ),
  "权限未知时不显示审批按钮"
);

console.log("approval-actions: 9 assertions passed");
