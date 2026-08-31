import { describePageLoadError, isAuthRequiredError } from "./request-errors";

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

expect(isAuthRequiredError(new Error("AUTH_REQUIRED")) === true, "AUTH_REQUIRED should be recognized");
expect(isAuthRequiredError(new Error("Unauthorized")) === false, "Unauthorized should not be treated as normalized auth-required");
expect(describePageLoadError(new Error("AUTH_REQUIRED")) === "登录状态已失效，请重新登录后继续。", "auth-required message should be user-facing");
expect(describePageLoadError(new Error("boom")) === "加载失败，请检查后端连接。", "non-auth message should fall back");

// ── 403 不能落进「请检查后端连接」这句 ──────────────────────────────────
//
// **这句话把权限问题说成了网络问题**，比不说更糟：用户会去 ping 服务器、
// 找运维查网络，而真正要做的是找管理员开一项权限。
{
  const forbidden = describePageLoadError(new Error("Forbidden: missing permission payroll.view"));
  expect(
    !forbidden.includes("后端连接"),
    `403 不该说成连接问题，实际：${forbidden}`
  );
  expect(forbidden.includes("payroll.view"), "要指明缺哪个权限，用户才知道去找谁开");
  expect(forbidden.includes("管理员"), "要指路到管理员");
}

// 各种 403 写法都要认出来——认漏了就退回那句错误的「检查后端连接」。
for (const message of ["Forbidden", "403 Forbidden", "权限不足", "无权访问"]) {
  expect(
    !describePageLoadError(new Error(message)).includes("后端连接"),
    `这条应当被识别为权限问题：${message}`
  );
}

// 真正的网络问题仍然说网络。
expect(
  describePageLoadError(new Error("Failed to fetch")).includes("后端连接"),
  "网络故障还是要指向连接问题——不能反过来把所有错误都说成权限"
);
