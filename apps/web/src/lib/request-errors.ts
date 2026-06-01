export function isAuthRequiredError(error: unknown) {
  return error instanceof Error && error.message === "AUTH_REQUIRED";
}

export function describePageLoadError(error: unknown, fallback = "加载失败，请检查后端连接。") {
  if (isAuthRequiredError(error)) {
    return "登录状态已失效，请重新登录后继续。";
  }
  return fallback;
}
