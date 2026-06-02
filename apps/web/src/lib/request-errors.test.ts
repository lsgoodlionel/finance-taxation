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
