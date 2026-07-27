import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_APP_BASE_URL,
  buildAppUrl,
  buildDeepLink,
  readAppBaseUrl,
  resolveDeepLinkTarget
} from "./deep-link.js";

test("readAppBaseUrl 缺省回退默认站点，并去掉尾部斜杠", () => {
  assert.equal(readAppBaseUrl({}), DEFAULT_APP_BASE_URL);
  assert.equal(readAppBaseUrl({ APP_BASE_URL: "   " }), DEFAULT_APP_BASE_URL);
  assert.equal(readAppBaseUrl({ APP_BASE_URL: "https://ft.example.com/" }), "https://ft.example.com");
  assert.equal(readAppBaseUrl({ APP_BASE_URL: "https://ft.example.com///" }), "https://ft.example.com");
});

test("readAppBaseUrl 拒绝非 http(s) 基址，回退默认（边界校验）", () => {
  assert.equal(readAppBaseUrl({ APP_BASE_URL: "javascript:alert(1)" }), DEFAULT_APP_BASE_URL);
  assert.equal(readAppBaseUrl({ APP_BASE_URL: "not a url" }), DEFAULT_APP_BASE_URL);
  assert.equal(readAppBaseUrl({ APP_BASE_URL: "ftp://x.example.com" }), DEFAULT_APP_BASE_URL);
});

test("buildAppUrl 保留基址的路径前缀并按插入顺序拼查询串", () => {
  assert.equal(buildAppUrl("https://ft.example.com", { path: "/close" }), "https://ft.example.com/close");
  assert.equal(
    buildAppUrl("https://ft.example.com/ft", { path: "/risk", query: { finding: "r-1", event: "e-1" } }),
    "https://ft.example.com/ft/risk?finding=r-1&event=e-1"
  );
});

test("buildAppUrl 丢弃空值查询参数并对取值转义", () => {
  assert.equal(
    buildAppUrl("https://ft.example.com", { path: "/risk", query: { finding: "r 1", event: null, scope: undefined } }),
    "https://ft.example.com/risk?finding=r+1"
  );
});

test("resolveDeepLinkTarget: 风险发现 → /risk?finding=&event=（对齐 risk-url-state）", () => {
  assert.deepEqual(resolveDeepLinkTarget({ type: "risk_finding", findingId: "f-1", businessEventId: "e-1" }), {
    path: "/risk",
    query: { finding: "f-1", event: "e-1" }
  });
  assert.deepEqual(resolveDeepLinkTarget({ type: "risk_finding", findingId: "f-1" }), {
    path: "/risk",
    query: { finding: "f-1", event: undefined }
  });
});

test("resolveDeepLinkTarget: 凭证复核带事项 → /events?event=，否则退到 /vouchers 列表", () => {
  assert.deepEqual(resolveDeepLinkTarget({ type: "voucher_review", businessEventId: "e-9" }), {
    path: "/events",
    query: { event: "e-9" }
  });
  // VouchersPage 不读任何查询参数，只能落到列表页
  assert.deepEqual(resolveDeepLinkTarget({ type: "voucher_review" }), { path: "/vouchers" });
  assert.deepEqual(resolveDeepLinkTarget({ type: "voucher_review", businessEventId: null }), { path: "/vouchers" });
});

test("resolveDeepLinkTarget: 草稿队列 → /inbox，逾期任务 → /tasks?view=list，月结 → /close", () => {
  assert.deepEqual(resolveDeepLinkTarget({ type: "draft_queue" }), { path: "/inbox" });
  assert.deepEqual(resolveDeepLinkTarget({ type: "overdue_tasks" }), { path: "/tasks", query: { view: "list" } });
  assert.deepEqual(resolveDeepLinkTarget({ type: "close_period" }), { path: "/close" });
});

test("resolveDeepLinkTarget: 老板端（guided）→ /home", () => {
  assert.deepEqual(resolveDeepLinkTarget({ type: "boss_home" }), { path: "/home" });
});

test("buildDeepLink 端到端拼出可点击链接", () => {
  assert.equal(
    buildDeepLink({ type: "risk_finding", findingId: "over-budget-e1", businessEventId: "e1" }, {
      APP_BASE_URL: "https://ft.example.com"
    }),
    "https://ft.example.com/risk?finding=over-budget-e1&event=e1"
  );
  assert.equal(buildDeepLink({ type: "overdue_tasks" }, {}), `${DEFAULT_APP_BASE_URL}/tasks?view=list`);
});
