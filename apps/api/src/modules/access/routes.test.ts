import test from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { getMenu } from "./routes.js";
import type { ApiRequest } from "../../types.js";

interface MenuPayload {
  companyId?: string;
  roleCodes: string[];
  items: Array<{
    key: string;
    label: string;
    route: string;
    permissionKey: string;
    groupKey: string;
    groupLabel: string;
  }>;
}

/** Minimal ServerResponse stub capturing status + body written by json(). */
function fakeRes(): { res: ServerResponse; status: () => number; body: () => MenuPayload } {
  let statusCode = 0;
  let payload = "";
  const res = {
    writeHead(code: number) {
      statusCode = code;
      return res;
    },
    end(chunk?: string) {
      if (chunk) payload = chunk;
      return res;
    }
  } as unknown as ServerResponse;
  return { res, status: () => statusCode, body: () => JSON.parse(payload) as MenuPayload };
}

function reqWithRoles(roleCodes: string[]): ApiRequest {
  return { auth: { companyId: "company-1", roleCodes } } as unknown as ApiRequest;
}

function routesOf(payload: MenuPayload): string[] {
  return payload.items.map((item) => item.route);
}

const NAV_ROUTES = [
  "/inbox", "/assistant", "/events", "/dashboard/chairman",
  "/contracts", "/payroll",
  "/bills", "/vouchers", "/ledger", "/reports", "/export-center",
  "/tax", "/rnd", "/risk", "/audit", "/knowledge", "/settings"
];

test("getMenu returns the full 17-route nav set (plus legacy aliases) for role-chairman", () => {
  const { res, status, body } = fakeRes();
  getMenu(reqWithRoles(["role-chairman"]), res);
  assert.equal(status(), 200);
  const routes = routesOf(body());
  for (const route of NAV_ROUTES) {
    assert.ok(routes.includes(route), `expected chairman menu to include ${route}`);
  }
  // 旧路由兼容项仍在，供流程卡片深链权限判断
  assert.ok(routes.includes("/tasks"));
  assert.ok(routes.includes("/documents"));
});

test("getMenu carries group metadata aligned with the frontend sidebar groups", () => {
  const { res, body } = fakeRes();
  getMenu(reqWithRoles(["role-chairman"]), res);
  const payload = body();
  for (const item of payload.items) {
    assert.ok(item.groupKey.startsWith("g-"), `expected groupKey on ${item.key}`);
    assert.ok(item.groupLabel.length > 0, `expected groupLabel on ${item.key}`);
  }
  const bills = payload.items.find((item) => item.route === "/bills");
  assert.equal(bills?.groupKey, "g-finance");
  assert.equal(bills?.groupLabel, "财务运营");
});

test("getMenu filters out settings/audit/rnd/risk for role-viewer but keeps everyone-entries", () => {
  const { res, body } = fakeRes();
  getMenu(reqWithRoles(["role-viewer"]), res);
  const routes = routesOf(body());
  assert.ok(routes.includes("/inbox"));
  assert.ok(routes.includes("/assistant"));
  assert.ok(routes.includes("/events"));
  assert.ok(routes.includes("/reports"));
  assert.equal(routes.includes("/settings"), false);
  assert.equal(routes.includes("/audit"), false);
  assert.equal(routes.includes("/rnd"), false);
  assert.equal(routes.includes("/risk"), false);
});

test("getMenu keeps audit but drops contracts/settings for role-accountant", () => {
  const { res, body } = fakeRes();
  getMenu(reqWithRoles(["role-accountant"]), res);
  const routes = routesOf(body());
  assert.ok(routes.includes("/audit"));
  assert.ok(routes.includes("/vouchers"));
  assert.equal(routes.includes("/contracts"), false);
  assert.equal(routes.includes("/settings"), false);
});

test("getMenu returns an empty item list when the request has no auth context", () => {
  const { res, status, body } = fakeRes();
  getMenu({} as unknown as ApiRequest, res);
  assert.equal(status(), 200);
  assert.deepEqual(body().items, []);
});
