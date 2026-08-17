import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import type { PermissionKey } from "@finance-taxation/domain-model";
import { hasPermission, requirePermission } from "../middleware/auth.js";
import { createAppRouter } from "./registry.js";
import type { RouteDef, RoutePermission } from "../router/router.js";
import type { ApiRequest } from "../types.js";

/**
 * 防回退断言（C2）：路由表是唯一的授权真相来源，任何"写操作"路由都必须显式声明
 * 权限，且不得被只读角色（role-viewer）通过。历史上 `PUT /api/settings/integrations/:type`
 * 挂 `dashboard.view`（每个角色都有），只读账号即可改写第三方通知凭证并劫持
 * 全公司的风险预警/待办提醒信道；整个 banking 模块与发票删除更是完全没有权限声明。
 *
 * 这三条断言的目的是让同类回退在评审前就红掉，而不是等下一次安全审计。
 *
 * 第四条断言把口径从「写操作」扩到**全部**认证路由：GET 也必须声明权限。
 * 此前 22 条读接口只写了 `auth: true`——银行账户与逐笔流水、发票列表、往来单位、
 * 订阅与付款流水、AI 全公司勾稽输出、导出历史与归档索引，任何登录账号（含
 * role-viewer）都能直接拉全量。读接口不改数据，但泄露的是同一批数据本身。
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 只读角色：任何写操作路由都不应让它通过（白名单除外）。 */
const READ_ONLY_ROLE = "role-viewer";

/**
 * 故意不挂权限的写路由：登录/刷新是未认证入口，登出只作用于调用者自己的会话。
 * 除这三条外，任何写路由缺 `permission` 都判为缺陷。
 */
const WRITE_ROUTES_WITHOUT_PERMISSION: ReadonlyMap<string, string> = new Map([
  ["POST /api/auth/login", "未认证公开入口，权限在此之前不存在"],
  ["POST /api/auth/refresh", "未认证公开入口，凭 refresh token 自证"],
  ["POST /api/auth/logout", "仅撤销调用者自己的会话，无跨主体影响"]
]);

/**
 * 允许挂 `*.view` 级权限的写路由。每条都必须属于以下三类之一，并写明理由——
 * 新增条目 = 一次显式的安全决策：
 *
 * 1. 「POST 当查询用」：不落业务数据；
 * 2. 取证 / 自助类提交：人群本就等同于查看者；
 * 3. **权限门 + handler 归属收敛的两层守护**：权限键只负责放基层角色进门，
 *    进来后由 handler 按数据归属判定能碰谁的东西。登记此类必须指明收敛点在哪，
 *    且该收敛点要有自己的测试 —— 否则等于把洞留在 handler 里。
 */
const WRITE_ROUTES_WITH_VIEW_PERMISSION: ReadonlyMap<string, string> = new Map([
  ["POST /api/assistant/chat", "POST 当查询用：AI 问答，不写业务数据"],
  ["POST /api/boss-qa/chat", "POST 当查询用：老板问答，不写业务数据"],
  ["POST /api/ai/automation/decide", "POST 当查询用：纯函数式分级判定，不落库"],
  ["POST /api/ai/audit/review", "只读勾稽复核输出，人群与审计查阅一致"],
  ["POST /api/feedback", "自助提交：任何登录用户都应能反馈问题"],
  ["POST /api/exports/jobs", "导出归档属取证类操作，与审计查阅同一人群"],
  ["POST /api/exports/jobs/:id/status", "同上，导出任务状态回写"],
  [
    "PUT /api/tasks/:id",
    "两层守护：anyOf(tasks.view, tasks.manage) 放基层角色进门，" +
      "再由 tasks/mutation-scope.ts 的 canMutateTask 按负责人收敛（见 mutation-scope.test.ts）。" +
      "只挂 tasks.manage 会让会计/员工/出纳连自己名下的任务都改不了"
  ],
  ["POST /api/tasks/:id/remind", "同上，催办与状态变更同一口径"],
  // V13-A：两个费控预检接口。用 POST 是因为入参是对象（日期 + 科目 + 部门 + 金额），
  // 塞进查询串既难读又有长度上限；语义上它们与 GET 无异——纯计算，不落库、不建单据。
  ["POST /api/budgets/check", "POST 当查询用：预算预检，只读三个数后算差额，不落库"],
  ["POST /api/expense-standards/check", "POST 当查询用：超标预检，匹配标准后比金额，不落库"],
  [
    "POST /api/requests/:id/precheck",
    "POST 当查询用：申请单的预算预检，读三个数后算差额，不落库、不改单据状态。" +
      "用 POST 而非 GET 只为与另外两个 check 接口保持一致的调用形态"
  ],
  // V13-A 审批：两层守护。workflow.view 只负责放基层角色进门——挂 manage
  // 会让员工连自己的待办都处理不了、连自己的单子都提不了。能不能动某一单
  // 由 handler 按数据归属收敛：
  [
    "POST /api/approval/instances",
    "两层守护：workflow.view 放行提交，submitter 固定取 req.auth.userId，" +
      "提交人永远是自己；同单据并发提交由 uq_approval_instance_pending 排他约束挡住"
  ],
  [
    "POST /api/approval/instances/:id/act",
    "两层守护：收敛点是 approval/store.ts 的 act —— 批准/驳回按 canActOnStep 判权" +
      "（role/user/manager 三种，见 engine.test.ts 的 canActOnStep 四条用例），" +
      "撤回只允许发起人本人。manager 类型的上级在 store 内部解析，" +
      "不接受调用方传入——传当前用户 id 会让判据恒真"
  ]
]);

/**
 * 允许被只读角色（role-viewer）**通过权限守护**的写路由：仅限「POST 当查询用」、
 * 自助提交，以及权限门之后另有 handler 归属收敛的两层守护路由。
 * 这是最硬的一条——它直接对应审计给出的越权利用路径。
 *
 * 注意末两条的语义差别：viewer 能过**权限门**，但过不了 handler ——
 * `canMutateTask` 对没有 `tasks.manage` 且不是负责人的调用者一律返回 false，
 * 而 viewer 永远不可能是任务负责人。放行点在 handler，不在这里。
 */
const WRITE_ROUTES_ALLOWED_FOR_READ_ONLY_ROLE: ReadonlySet<string> = new Set([
  ...WRITE_ROUTES_WITHOUT_PERMISSION.keys(),
  "POST /api/assistant/chat",
  "POST /api/boss-qa/chat",
  "POST /api/ai/automation/decide",
  "POST /api/feedback",
  "PUT /api/tasks/:id",
  "POST /api/tasks/:id/remind",
  // viewer 持有 expense.view（要看得到费用标准才知道自己能报多少），
  // 而超标预检是纯计算——能看标准的人本就能自己算出同样的结论。
  "POST /api/expense-standards/check",
  // 同理：预检只读不写。viewer 提不了单（提交要 expense.submit，它没有），
  // 但能看一眼某张单会不会超预算，这与它能查预算列表是同一层能力。
  "POST /api/requests/:id/precheck"
]);

/**
 * 允许「认证但不声明 permission」的路由。判据只有一条：**该路由的授权判定无法
 * 用权限键表达**，因为它要么就是权限判定本身的来源，要么只作用于调用者自己。
 * 三条都在 handler 内按 `req.auth` 收敛，不存在「拿到别人的东西」的路径。
 *
 * 任何新增条目都必须满足同一判据——「这个页面人人都要用」不是理由，
 * 那种情况应当挂一个全角色都持有的 `*.view`（如 dashboard.view / tasks.view），
 * 让路由表继续如实记录归口。
 *
 * 注：POST /api/auth/logout 同时出现在 WRITE_ROUTES_WITHOUT_PERMISSION 里；
 * 两张表回答的是不同问题（写操作口径 / 全量认证路由口径），故各自登记。
 */
const AUTH_ROUTES_WITHOUT_PERMISSION: ReadonlyMap<string, string> = new Map([
  ["GET /api/access/me", "返回调用者自己的身份与权限集，它是权限判定的来源，无法再被权限守护"],
  ["GET /api/access/menu", "按调用者自己的角色过滤导航项，handler 内已用 hasPermission 逐项收敛"],
  ["POST /api/auth/logout", "仅撤销调用者自己的会话，无跨主体影响"]
]);

function routeKey(route: RouteDef): string {
  return `${route.method} ${route.path}`;
}

function authenticatedRoutes(): readonly RouteDef[] {
  return createAppRouter()
    .routes()
    .filter((route) => route.auth === true);
}

function permissionKeys(permission: RoutePermission): readonly PermissionKey[] {
  return typeof permission === "object" && "anyOf" in permission ? permission.anyOf : [permission];
}

function writeRoutes(): readonly RouteDef[] {
  return createAppRouter()
    .routes()
    .filter((route) => WRITE_METHODS.has(route.method));
}

test("每个写操作路由都显式声明权限（缺 permission 即失败）", () => {
  const offenders = writeRoutes()
    .filter((route) => !route.permission && !WRITE_ROUTES_WITHOUT_PERMISSION.has(routeKey(route)))
    .map(routeKey);

  assert.deepEqual(
    offenders,
    [],
    `以下写操作路由未声明 permission，任何登录用户（含只读账号）均可调用：\n${offenders.join("\n")}`
  );
});

test("写操作路由不得只由 *.view 级权限守护（未列入白名单者）", () => {
  const offenders = writeRoutes()
    .filter((route) => {
      if (!route.permission) return false;
      if (WRITE_ROUTES_WITH_VIEW_PERMISSION.has(routeKey(route))) return false;
      return permissionKeys(route.permission).some((key) => key.endsWith(".view"));
    })
    .map((route) => `${routeKey(route)} → ${permissionKeys(route.permission!).join("|")}`);

  assert.deepEqual(
    offenders,
    [],
    `以下写操作路由挂了查看级权限（写操作配读权限）：\n${offenders.join("\n")}`
  );
});

test("只读角色 role-viewer 无法通过任何写操作路由的权限守护", () => {
  const offenders = writeRoutes()
    .filter((route) => !WRITE_ROUTES_ALLOWED_FOR_READ_ONLY_ROLE.has(routeKey(route)))
    .filter(
      (route) =>
        !route.permission ||
        permissionKeys(route.permission).some((key) => hasPermission([READ_ONLY_ROLE], key))
    )
    .map(routeKey);

  assert.deepEqual(
    offenders,
    [],
    `只读角色可执行以下写操作：\n${offenders.join("\n")}`
  );
});

test("每个认证路由都显式声明权限（读接口同样不许只写 auth: true）", () => {
  const offenders = authenticatedRoutes()
    .filter((route) => !route.permission && !AUTH_ROUTES_WITHOUT_PERMISSION.has(routeKey(route)))
    .map(routeKey);

  assert.deepEqual(
    offenders,
    [],
    `以下认证路由未声明 permission，任何登录用户（含只读账号）均可读取：\n${offenders.join("\n")}`
  );
});

test("白名单本身保持有效：不得为已删除或已收紧的路由留下豁免", () => {
  const existingWrites = new Set(writeRoutes().map(routeKey));
  const unguardedAuthed = new Set(
    authenticatedRoutes().filter((route) => !route.permission).map(routeKey)
  );
  const stale = [
    ...[
      ...WRITE_ROUTES_WITHOUT_PERMISSION.keys(),
      ...WRITE_ROUTES_WITH_VIEW_PERMISSION.keys(),
      ...WRITE_ROUTES_ALLOWED_FOR_READ_ONLY_ROLE
    ].filter((key) => !existingWrites.has(key)),
    // 这张表的豁免一旦路由被删除或被收紧（补上了 permission），就必须同步摘掉，
    // 否则下一条同名路由会白白继承一个没人再审视过的豁免。
    ...[...AUTH_ROUTES_WITHOUT_PERMISSION.keys()].filter((key) => !unguardedAuthed.has(key))
  ];

  assert.deepEqual(stale, [], `白名单残留了不存在或已收紧的路由：\n${stale.join("\n")}`);
});

/** 复现审计给出的利用路径：只读账号改写通知渠道凭证 → 劫持全公司预警信道。 */
test("只读账号 PUT /api/settings/integrations/notification 被 403 拒绝", async () => {
  const match = createAppRouter().match("PUT", "/api/settings/integrations/notification");
  assert.ok(match, "路由应存在");
  assert.ok(match.route.permission, "该路由必须声明权限");

  let statusCode = 0;
  let body = "";
  const res = {
    writeHead(code: number) {
      statusCode = code;
      return res;
    },
    end(chunk?: string) {
      if (chunk) body += chunk;
      return res;
    }
  } as unknown as ServerResponse;

  const req = {
    method: "PUT",
    url: "/api/settings/integrations/notification",
    body: { provider: "feishu", apiKey: "attacker-open-id" },
    auth: {
      companyId: "cmp-1",
      userId: "usr-viewer",
      username: "viewer",
      departmentId: null,
      departmentName: null,
      roleCodes: [READ_ONLY_ROLE],
      token: "t"
    }
  } as unknown as ApiRequest;

  const keys = permissionKeys(match.route.permission!);
  const allowed = await requirePermission(keys[0] as PermissionKey, req, res);

  assert.equal(allowed, false);
  assert.equal(statusCode, 403);
  assert.match(body, /Forbidden/);
});

/** 同根因的另外两组：公司资料（含 financeApproverRole 职责分离配置）与 AI 服务商凭证。 */
test("公司资料 / AI 配置 / 集成配置的写操作统一要求 settings.manage", () => {
  const router = createAppRouter();
  const guarded = [
    ["PUT", "/api/settings/company"],
    ["PUT", "/api/settings/ai"],
    ["POST", "/api/settings/ai/test"],
    ["PUT", "/api/settings/integrations/notification"],
    ["POST", "/api/settings/integrations/notification/test"]
  ] as const;

  for (const [method, path] of guarded) {
    const match = router.match(method, path);
    assert.ok(match, `${method} ${path} 应存在`);
    assert.deepEqual(
      permissionKeys(match.route.permission!),
      ["settings.manage"],
      `${method} ${path} 必须要求 settings.manage`
    );
  }
});

/**
 * banking 写操作的权限归属。
 *
 * 演进过程值得记住：这组路由最初**完全没有 permission**，任何登录用户（含只读的
 * role-viewer）都能导流水、确认对账；随后被收到 `ledger.post` 堵洞，但那是记账权、
 * 出纳并不持有 —— 等于把出纳挡在自己的本职工作外面。两次都不对，所以单开
 * `banking.manage` 一键，给董事长/财务负责人/会计/出纳。
 *
 * 这条断言防的是两个方向的回退：降回 `*.view`（只读账号又能导流水），
 * 或退回 `ledger.post`（出纳又做不了对账）。
 */
test("banking 写操作统一由 banking.manage 守护，且出纳持有该权限", () => {
  const bankingWrites = writeRoutes().filter((route) => route.path.startsWith("/api/banking/"));
  assert.ok(bankingWrites.length >= 8, `banking 写路由应至少 8 条，实际 ${bankingWrites.length}`);

  const offenders = bankingWrites
    .filter((route) => !route.permission || !permissionKeys(route.permission).includes("banking.manage"))
    .map((route) => `${routeKey(route)} → ${route.permission ? permissionKeys(route.permission).join("|") : "(无)"}`);
  assert.deepEqual(offenders, [], `以下 banking 写路由未挂 banking.manage：\n${offenders.join("\n")}`);

  // 出纳能做，只读账号不能做 —— 这一条同时钉住了权限键的两端。
  assert.equal(hasPermission(["role-cashier"], "banking.manage"), true, "出纳必须能做银行对账");
  assert.equal(hasPermission([READ_ONLY_ROLE], "banking.manage"), false, "只读账号不得导流水");
  // 会计与财务负责人同样要能做（银行对账是会计本职的一部分）
  assert.equal(hasPermission(["role-accountant"], "banking.manage"), true);
  assert.equal(hasPermission(["role-finance-director"], "banking.manage"), true);
});
