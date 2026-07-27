import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCloseDraftsNotification,
  buildOverdueTasksNotification,
  buildRiskAlertNotification,
  buildVoucherApprovalNotification
} from "./events.js";

// ── 风险告警：只推高危，且只推「本次新增」的 ─────────────────────────────────

test("buildRiskAlertNotification: 只对新增的 high 风险发通知", () => {
  const message = buildRiskAlertNotification({
    companyId: "c-1",
    eventLabel: "采购合同 A",
    findings: [
      { id: "f-high", severity: "high", title: "合同金额超预算", businessEventId: "e-1" },
      { id: "f-med", severity: "medium", title: "缺少附件", businessEventId: "e-1" }
    ],
    knownFindingIds: []
  });

  assert.ok(message);
  assert.equal(message.kind, "risk_alert");
  assert.equal(message.companyId, "c-1");
  assert.match(message.title, /高风险/);
  assert.match(message.body, /合同金额超预算/);
  assert.doesNotMatch(message.body, /缺少附件/, "中低风险不应进入正文");
  assert.deepEqual(message.deepLink, { type: "risk_finding", findingId: "f-high", businessEventId: "e-1" });
});

test("buildRiskAlertNotification: 无高危 → null（不推噪音）", () => {
  assert.equal(
    buildRiskAlertNotification({
      companyId: "c-1",
      eventLabel: "采购合同 A",
      findings: [{ id: "f-low", severity: "low", title: "提示", businessEventId: "e-1" }],
      knownFindingIds: []
    }),
    null
  );
  assert.equal(
    buildRiskAlertNotification({ companyId: "c-1", eventLabel: "x", findings: [], knownFindingIds: [] }),
    null
  );
});

test("buildRiskAlertNotification: 重复扫描出的旧高危不再重推（幂等去重）", () => {
  const findings = [{ id: "f-high", severity: "high" as const, title: "超预算", businessEventId: "e-1" }];
  assert.equal(
    buildRiskAlertNotification({ companyId: "c-1", eventLabel: "x", findings, knownFindingIds: ["f-high"] }),
    null
  );
  assert.ok(
    buildRiskAlertNotification({ companyId: "c-1", eventLabel: "x", findings, knownFindingIds: ["f-other"] })
  );
});

test("buildRiskAlertNotification: 多条高危时汇总计数，深链指向第一条", () => {
  const message = buildRiskAlertNotification({
    companyId: "c-1",
    eventLabel: "采购合同 A",
    findings: [
      { id: "f-1", severity: "high", title: "超预算", businessEventId: "e-1" },
      { id: "f-2", severity: "high", title: "无合同", businessEventId: "e-1" }
    ],
    knownFindingIds: []
  });
  assert.ok(message);
  assert.match(message.title, /2/);
  assert.equal(message.deepLink?.type === "risk_finding" ? message.deepLink.findingId : null, "f-1");
});

// ── 凭证送审 ──────────────────────────────────────────────────────────────────

test("buildVoucherApprovalNotification: 带事项 → 深链到事项，否则到凭证列表", () => {
  const withEvent = buildVoucherApprovalNotification({
    companyId: "c-1",
    voucherId: "v-1",
    summary: "购入办公用品",
    submittedBy: "张三",
    businessEventId: "e-1"
  });
  assert.equal(withEvent.kind, "approval_request");
  assert.match(withEvent.body, /张三/);
  assert.match(withEvent.body, /购入办公用品/);
  assert.deepEqual(withEvent.deepLink, { type: "voucher_review", businessEventId: "e-1" });

  const without = buildVoucherApprovalNotification({
    companyId: "c-1",
    voucherId: "v-1",
    summary: "购入办公用品",
    submittedBy: "张三",
    businessEventId: null
  });
  assert.deepEqual(without.deepLink, { type: "voucher_review", businessEventId: null });
});

// ── AI 草稿批量 ───────────────────────────────────────────────────────────────

test("buildCloseDraftsNotification: 汇总一次，不按草稿逐条推送", () => {
  const message = buildCloseDraftsNotification({ companyId: "c-1", period: "2026-05", generated: 7 });
  assert.ok(message);
  assert.equal(message.kind, "approval_request");
  assert.match(message.title, /7/);
  assert.match(message.body, /2026-05/);
  assert.deepEqual(message.deepLink, { type: "draft_queue" });
});

test("buildCloseDraftsNotification: 本次未生成任何草稿 → null", () => {
  assert.equal(buildCloseDraftsNotification({ companyId: "c-1", period: "2026-05", generated: 0 }), null);
});

// ── 逾期任务 ──────────────────────────────────────────────────────────────────

test("buildOverdueTasksNotification: 达到阈值才推，深链到任务列表", () => {
  const message = buildOverdueTasksNotification({ companyId: "c-1", overdue: 3 });
  assert.ok(message);
  assert.equal(message.kind, "task_overdue");
  assert.match(message.title, /3/);
  assert.deepEqual(message.deepLink, { type: "overdue_tasks" });
});

test("buildOverdueTasksNotification: 0 条逾期 → null", () => {
  assert.equal(buildOverdueTasksNotification({ companyId: "c-1", overdue: 0 }), null);
  assert.equal(buildOverdueTasksNotification({ companyId: "c-1", overdue: -1 }), null);
});
