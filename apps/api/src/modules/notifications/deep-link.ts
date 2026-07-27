/**
 * 通知深链构造（纯函数，无 I/O）。
 *
 * 深链必须落在前端「真实存在且真的会读取」的路由与查询参数上，否则用户点开是空页。
 * 下列映射已逐条核对 apps/web/src/App.tsx 的路由表与各页的参数读取点：
 *
 *   /risk    ← pages/risk/risk-url-state.ts 读 finding / event / scope / view
 *   /events  ← pages/EventsPage.tsx 读 event（inbox 的 AI 草稿卡片也是这么跳的）
 *   /tasks   ← pages/TasksPage.tsx 读 view（list | kanban）
 *   /inbox   ← pages/MyDayPage.tsx，不读任何查询参数
 *   /close   ← pages/MonthEndClosePage.tsx，不读任何查询参数
 *   /home    ← 引导（guided）模式的老板工作台，不读任何查询参数
 *   /vouchers← pages/VouchersPage.tsx **不读任何查询参数**（只认 location.state），
 *              因此无法深链到某一张凭证，只能落到列表页。带业务事项时优先走 /events。
 *
 * 新增深链前请回到上述页面确认参数确实被读取，不要臆造。
 */

/** 未配置 APP_BASE_URL 时的默认站点（本地 web dev server）。 */
export const DEFAULT_APP_BASE_URL = "http://localhost:5173";

export interface DeepLinkTarget {
  readonly path: string;
  readonly query?: Readonly<Record<string, string | null | undefined>>;
}

/** 可深链的业务场景。每个分支都对应上面注释里核对过的前端路由。 */
export type DeepLinkEvent =
  | { readonly type: "risk_finding"; readonly findingId: string; readonly businessEventId?: string | null }
  | { readonly type: "voucher_review"; readonly businessEventId?: string | null }
  | { readonly type: "draft_queue" }
  | { readonly type: "overdue_tasks" }
  | { readonly type: "close_period" }
  | { readonly type: "boss_home" };

/**
 * 读取站点基址。非法或缺省一律回退默认值 —— 深链是要发给用户点击的，
 * 必须校验协议，避免把错配的配置直接拼进外发消息。
 */
export function readAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.APP_BASE_URL ?? "").trim();
  if (raw === "") {
    return DEFAULT_APP_BASE_URL;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return DEFAULT_APP_BASE_URL;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return DEFAULT_APP_BASE_URL;
  }
  return raw.replace(/\/+$/, "");
}

/**
 * 拼接绝对 URL。基址可能带路径前缀（如 https://host/ft），因此用字符串拼接而非
 * `new URL(path, base)` —— 后者会把前缀吃掉。
 */
export function buildAppUrl(baseUrl: string, target: DeepLinkTarget): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(target.query ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const base = baseUrl.replace(/\/+$/, "");
  return search === "" ? `${base}${target.path}` : `${base}${target.path}?${search}`;
}

/** 业务场景 → 前端路由与查询参数。 */
export function resolveDeepLinkTarget(event: DeepLinkEvent): DeepLinkTarget {
  switch (event.type) {
    case "risk_finding":
      return { path: "/risk", query: { finding: event.findingId, event: event.businessEventId ?? undefined } };
    case "voucher_review":
      // 凭证页不接受查询参数；有业务事项时改走事项页，那里能真正下钻到这张凭证。
      return event.businessEventId
        ? { path: "/events", query: { event: event.businessEventId } }
        : { path: "/vouchers" };
    case "draft_queue":
      return { path: "/inbox" };
    case "overdue_tasks":
      return { path: "/tasks", query: { view: "list" } };
    case "close_period":
      return { path: "/close" };
    case "boss_home":
      return { path: "/home" };
  }
}

/** 业务场景 → 可点击的绝对 URL。 */
export function buildDeepLink(event: DeepLinkEvent, env: NodeJS.ProcessEnv = process.env): string {
  return buildAppUrl(readAppBaseUrl(env), resolveDeepLinkTarget(event));
}
