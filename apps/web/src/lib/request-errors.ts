import { describeLoadFailure } from "../components/ui/LoadErrorState";

export function isAuthRequiredError(error: unknown) {
  return error instanceof Error && error.message === "AUTH_REQUIRED";
}

/**
 * 把加载错误翻译成给用户看的一句话。
 *
 * ## 为什么要认 403
 *
 * 此前只认 401，403 落进 fallback「加载失败，请检查后端连接。」——
 * **这句话把权限问题说成了网络问题**，比不说更糟：用户会去 ping 服务器、
 * 找运维查网络，而真正要做的是找管理员开一项权限。
 *
 * 403 与网络故障，用户该做的事完全不同，所以不能共用一句话。
 *
 * 403 的识别复用 `describeLoadFailure`——那边已经有一份，
 * 在这里再写一份，两份迟早漂移。
 */
export function describePageLoadError(error: unknown, fallback = "加载失败，请检查后端连接。") {
  if (isAuthRequiredError(error)) {
    return "登录状态已失效，请重新登录后继续。";
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const failure = describeLoadFailure(message);
  if (failure.kind === "forbidden") {
    return failure.advice;
  }

  return fallback;
}
