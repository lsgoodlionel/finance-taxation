import type { ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { UserProfile } from "@finance-taxation/domain-model";
import type { PermissionKey } from "../access/permission-catalog.js";
import type { ApiRequest, AuthContext } from "../types.js";
import { env } from "../config/env.js";
import { query, queryOne, withTransaction } from "../db/client.js";
import { json } from "../utils/http.js";
import { hashPassword, needsRehash, verifyPassword } from "./password.js";
import { validateObject, type ObjectSchema } from "../utils/validate.js";

const LOGIN_SCHEMA: ObjectSchema = {
  username: { type: "string", required: true, min: 1, max: 64 },
  password: { type: "string", required: true, min: 1, max: 200 }
};

const ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  "role-chairman": [
    "dashboard.view", "events.view", "events.create", "events.assign",
    "tasks.view", "tasks.manage", "documents.view", "documents.manage",
    "ledger.view", "ledger.post", "banking.manage", "tax.view", "tax.manage",
    "rnd.view", "rnd.manage", "risk.view", "risk.manage", "settings.manage",
    "contracts.view", "contracts.manage",
    "payroll.view", "payroll.manage",
    "audit.view", "workflow.view", "workflow.manage",
    "knowledge.view", "knowledge.manage",
    "budget.view", "budget.manage", "expense.view", "expense.submit", "expense.manage"
  ],
  // V15：财务负责人补 `settings.manage`。
  //
  // 此前只有董事长有这个权限，后果是**一家没有董事长账号的公司谁都进不了
  // 系统中心**——配不了发票服务商、配不了银企直连、看不到公司信息。
  // 而这些恰恰是财务负责人的职责范围：签银企直连协议、选发票服务商、
  // 定会计政策的就是他。
  //
  // 风险是实的：`settings.manage` 能改银企直连的证书路径，而那等于付款能力。
  // 但把它锁在董事长一个人身上并不更安全——现实里董事长会把账号给财务用，
  // 那比多给一个角色更糟（审计日志上全是董事长做的）。
  "role-finance-director": [
    "dashboard.view", "events.view", "events.create", "events.assign",
    "tasks.view", "tasks.manage", "documents.view", "documents.manage",
    "ledger.view", "ledger.post", "banking.manage", "tax.view", "tax.manage",
    "rnd.view", "rnd.manage", "risk.view", "risk.manage", "settings.manage",
    "contracts.view", "contracts.manage",
    "payroll.view", "payroll.manage",
    "audit.view", "workflow.view", "workflow.manage",
    "knowledge.view",
    "budget.view", "budget.manage", "expense.view", "expense.submit", "expense.manage"
  ],
  "role-accountant": [
    "dashboard.view", "events.view",
    "tasks.view", "documents.view", "documents.manage",
    "ledger.view", "ledger.post", "banking.manage", "tax.view", "tax.manage",
    "payroll.view",
    "audit.view", "workflow.view", "workflow.manage",
    "knowledge.view",
    "budget.view", "budget.manage", "expense.view", "expense.submit", "expense.manage"
  ],
  "role-employee": [
    "dashboard.view", "events.view", "events.create",
    "tasks.view", "documents.view", "documents.manage",
    "ledger.view", "tax.view", "contracts.view",
    "payroll.view", "knowledge.view",
    "expense.view", "expense.submit"
  ],
  "role-cashier": [
    "dashboard.view", "events.view",
    "tasks.view", "documents.view", "documents.manage",
    // 出纳管银行账户、导流水、做对账 —— 这是本职，但不含记账权 ledger.post。
    //
    // contracts.view（只读）是 V16 角色实验补的：付款按合同期次付，
    // 而「本月应付」列表、付款单列表、左侧「付款中心」菜单项**全部挂在这个权限上**。
    // 缺了它，出纳登进来看不到任何应付信息，深链进去整页 403——
    // 而那段代码的注释写着「出纳每天要看的第一个东西」。
    // 只给 view 不给 manage：合同条款的维护不是出纳的事。
    "ledger.view", "banking.manage", "tax.view", "contracts.view",
    "payroll.view", "knowledge.view",
    "expense.view", "expense.submit"
  ],
  "role-tax-specialist": [
    "dashboard.view", "events.view", "events.create",
    "tasks.view", "documents.view", "documents.manage",
    "ledger.view", "tax.view", "tax.manage",
    // rnd.view / risk.view 是 V16 角色实验补的，两件都是税务专员的**本职**：
    //   - 研发费用加计扣除要归集研发项目的费用
    //   - 风险引擎里的规则本身就是税务规则（「收入已入账但未形成增值税事项」这类）
    // 缺了它们，这两件工作在页面上被渲染成「还没有研发项目」「0 条风险」——
    // 不是报错，是**看起来一切正常**，比报错更容易误导人。
    // 只给 view：立项与关闭风险不是税务专员的决定。
    "rnd.view", "risk.view",
    "contracts.view", "payroll.view",
    "audit.view", "workflow.view", "workflow.manage", "knowledge.view",
    "expense.view", "expense.submit"
  ],
  "role-auditor": [
    "dashboard.view", "events.view",
    "tasks.view", "documents.view",
    "ledger.view", "tax.view",
    "contracts.view", "payroll.view",
    "audit.view", "workflow.view", "knowledge.view",
    "budget.view", "expense.view"
  ],
  "role-viewer": [
    "dashboard.view", "events.view", "tasks.view",
    "documents.view", "ledger.view", "tax.view",
    "contracts.view", "payroll.view", "knowledge.view",
    "expense.view"
  ]
};

interface AuthUserRow {
  id: string;
  company_id: string;
  department_id: string | null;
  username: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  status: UserProfile["status"];
  // Only selected on the login path; omitted elsewhere to avoid pulling the
  // credential into memory on flows that never verify it (/me, refresh).
  password_hash?: string;
  role_codes: string[] | null;
  failed_attempts?: number;
  locked_until?: string | Date | null;
}

// Fixed hash used to equalize verify timing when a username is unknown, so login
// latency does not reveal whether an account exists (mitigates timing-based
// user enumeration). Computed once at module load; a Promise because hashing is
// async (await it at the use site).
const TIMING_EQUALIZER_HASH = hashPassword("timing-equalizer-not-a-real-secret");

interface SessionRow {
  id: string;
  company_id: string;
  user_id: string;
  username: string;
  department_id: string | null;
  role_codes: string[] | null;
  access_token: string;
  refresh_token: string;
  created_at: string | Date;
  access_expires_at: string | Date;
  refresh_expires_at: string | Date;
  status: "active" | "revoked";
}

interface SessionWithDepartmentRow extends SessionRow {
  department_name: string | null;
}

interface SessionRecord {
  id: string;
  companyId: string;
  userId: string;
  username: string;
  departmentId: string | null;
  roleCodes: string[];
  accessToken: string;
  refreshToken: string;
  createdAt: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  status: "active" | "revoked";
}

function normalizeRoleCodes(roleCodes: string[] | null | undefined): string[] {
  return Array.isArray(roleCodes) ? roleCodes.filter(Boolean) : [];
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapUserProfile(row: AuthUserRow): UserProfile {
  return {
    id: row.id,
    companyId: row.company_id,
    departmentId: row.department_id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    roleIds: normalizeRoleCodes(row.role_codes)
  };
}

function mapSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    username: row.username,
    departmentId: row.department_id,
    roleCodes: normalizeRoleCodes(row.role_codes),
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    createdAt: toIsoString(row.created_at),
    accessExpiresAt: toIsoString(row.access_expires_at),
    refreshExpiresAt: toIsoString(row.refresh_expires_at),
    status: row.status
  };
}

export function createSessionId(): string {
  return `sess-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function buildSession(user: UserProfile): SessionRecord {
  const now = Date.now();
  return {
    id: createSessionId(),
    companyId: user.companyId,
    userId: user.id,
    username: user.username,
    departmentId: user.departmentId,
    roleCodes: user.roleIds,
    accessToken: randomBytes(24).toString("hex"),
    refreshToken: randomBytes(32).toString("hex"),
    createdAt: new Date(now).toISOString(),
    accessExpiresAt: new Date(now + env.accessTokenTtlMs).toISOString(),
    refreshExpiresAt: new Date(now + env.refreshTokenTtlMs).toISOString(),
    status: "active"
  };
}

async function loadUserByUsername(username: string): Promise<AuthUserRow | null> {
  return queryOne<AuthUserRow>(
    `
      select
        u.id,
        u.company_id,
        u.department_id,
        u.username,
        u.display_name,
        u.email,
        u.phone,
        u.status,
        up.password_hash,
        up.failed_attempts,
        up.locked_until,
        coalesce(array_agg(r.code order by r.code) filter (where r.code is not null), '{}') as role_codes
      from users u
      join user_passwords up on up.user_id = u.id
      left join user_roles ur on ur.user_id = u.id
      left join roles r on r.id = ur.role_id
      where u.username = $1
      group by
        u.id,
        u.company_id,
        u.department_id,
        u.username,
        u.display_name,
        u.email,
        u.phone,
        u.status,
        up.password_hash,
        up.failed_attempts,
        up.locked_until
    `,
    [username]
  );
}

async function loadUserById(userId: string): Promise<AuthUserRow | null> {
  // Note: password_hash is intentionally not selected here — the /me path never
  // needs it, so we avoid pulling the credential into memory (least privilege).
  return queryOne<AuthUserRow>(
    `
      select
        u.id,
        u.company_id,
        u.department_id,
        u.username,
        u.display_name,
        u.email,
        u.phone,
        u.status,
        coalesce(array_agg(r.code order by r.code) filter (where r.code is not null), '{}') as role_codes
      from users u
      left join user_roles ur on ur.user_id = u.id
      left join roles r on r.id = ur.role_id
      where u.id = $1
      group by
        u.id,
        u.company_id,
        u.department_id,
        u.username,
        u.display_name,
        u.email,
        u.phone,
        u.status
    `,
    [userId]
  );
}

async function insertSession(session: SessionRecord) {
  await queryOne(
    `
      insert into sessions (
        id,
        company_id,
        user_id,
        username,
        department_id,
        role_codes,
        access_token,
        refresh_token,
        status,
        created_at,
        access_expires_at,
        refresh_expires_at
      ) values ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      returning id
    `,
    [
      session.id,
      session.companyId,
      session.userId,
      session.username,
      session.departmentId,
      session.roleCodes,
      session.accessToken,
      session.refreshToken,
      session.status,
      session.createdAt,
      session.accessExpiresAt,
      session.refreshExpiresAt
    ]
  );
}

/**
 * 一组角色实际持有的全部权限键（去重）。
 *
 * 给 `/api/access/me` 用：前端据此决定显示哪些按钮。
 * **这不是权限边界**——每条路由仍然独立校验；这里只是为了不给用户看
 * 必然点不动的按钮。
 */
export function resolvePermissions(roleCodes: readonly string[]): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const code of roleCodes) {
    for (const key of ROLE_PERMISSIONS[code] ?? []) set.add(key);
  }
  return [...set];
}

export function hasPermission(roleCodes: string[], permissionKey: PermissionKey): boolean {
  return roleCodes.some((code) => ROLE_PERMISSIONS[code]?.includes(permissionKey) ?? false);
}

export async function requirePermission(
  permissionKey: PermissionKey,
  req: ApiRequest,
  res: ServerResponse
): Promise<boolean> {
  if (!req.auth) {
    json(res, 401, { error: "Unauthorized" });
    return false;
  }
  if (!hasPermission(req.auth.roleCodes, permissionKey)) {
    json(res, 403, { error: "Forbidden", requiredPermission: permissionKey });
    return false;
  }
  return true;
}

export async function requireAnyPermission(
  permissionKeys: readonly PermissionKey[],
  req: ApiRequest,
  res: ServerResponse
): Promise<boolean> {
  if (!req.auth) {
    json(res, 401, { error: "Unauthorized" });
    return false;
  }
  if (!permissionKeys.some((permissionKey) => hasPermission(req.auth!.roleCodes, permissionKey))) {
    json(res, 403, { error: "Forbidden", requiredPermission: permissionKeys });
    return false;
  }
  return true;
}

function isLocked(lockedUntil: string | Date | null | undefined): boolean {
  if (!lockedUntil) {
    return false;
  }
  return new Date(lockedUntil).getTime() > Date.now();
}

async function registerFailedLogin(userId: string): Promise<void> {
  // Increment atomically in SQL so concurrent failed logins cannot lose an
  // update; the row is locked once the incremented count crosses the threshold.
  await query(
    `
      update user_passwords
      set failed_attempts = failed_attempts + 1,
          locked_until = case
            when failed_attempts + 1 >= $2
              then now() + ($3 || ' milliseconds')::interval
            else locked_until
          end,
          updated_at = now()
      where user_id = $1
    `,
    [userId, env.loginMaxFailedAttempts, env.loginLockoutMs]
  );
}

async function clearLockAndUpgrade(
  userId: string,
  plainPassword: string,
  storedHash: string
): Promise<void> {
  const nextHash = needsRehash(storedHash) ? await hashPassword(plainPassword) : storedHash;
  await query(
    `
      update user_passwords
      set failed_attempts = 0,
          locked_until = null,
          password_hash = $2,
          updated_at = now()
      where user_id = $1
    `,
    [userId, nextHash]
  );
}

export async function login(req: ApiRequest, res: ServerResponse) {
  const parsed = validateObject<{ username: string; password: string }>(req.body, LOGIN_SCHEMA);
  if (!parsed.ok || !parsed.value) {
    return json(res, 400, { error: "Invalid request", details: parsed.errors });
  }
  const { username, password } = parsed.value;

  const userRow = await loadUserByUsername(username);

  // Unknown / inactive user: run an equivalent-cost dummy verify so this path
  // takes the same time as a real password check, then return the same generic
  // 401. (Account existence can still be inferred from the lockout response
  // below; IP-level throttling + full enumeration hardening is Stage B / B1.)
  if (!userRow || userRow.status !== "active") {
    await verifyPassword(password, await TIMING_EQUALIZER_HASH);
    return json(res, 401, { error: "Invalid credentials" });
  }

  if (isLocked(userRow.locked_until)) {
    return json(res, 423, {
      error: "Account temporarily locked due to repeated failed logins. Please try again later."
    });
  }

  const storedHash = userRow.password_hash ?? "";
  if (!(await verifyPassword(password, storedHash))) {
    await registerFailedLogin(userRow.id);
    return json(res, 401, { error: "Invalid credentials" });
  }

  // Successful login: reset the failure counter and lazily upgrade legacy
  // plaintext / outdated hashes to the current scrypt scheme.
  await clearLockAndUpgrade(userRow.id, password, storedHash);

  const user = mapUserProfile(userRow);
  const session = buildSession(user);
  await insertSession(session);

  return json(res, 200, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: {
      id: user.id,
      companyId: user.companyId,
      username: user.username,
      displayName: user.displayName,
      roleIds: user.roleIds
    }
  });
}

export async function refresh(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as { refreshToken?: string };
  if (!body.refreshToken) {
    return json(res, 400, { error: "refreshToken is required" });
  }

  const result = await withTransaction(async (client) => {
    const sessionResult = await client.query<SessionRow>(
      `
        select
          id,
          company_id,
          user_id,
          username,
          department_id,
          role_codes,
          access_token,
          refresh_token,
          created_at,
          access_expires_at,
          refresh_expires_at,
          status
        from sessions
        where refresh_token = $1 and status = 'active'
        for update
      `,
      [body.refreshToken]
    );
    const current = sessionResult.rows[0];
    if (!current) {
      return { error: "Invalid refresh token" as const };
    }

    const currentSession = mapSessionRecord(current);
    if (new Date(currentSession.refreshExpiresAt).getTime() <= Date.now()) {
      return { error: "Refresh token expired" as const };
    }

    // password_hash is not selected here — refresh authenticates via the refresh
    // token, so the credential is never needed on this path (least privilege).
    const userResult = await client.query<AuthUserRow>(
      `
        select
          u.id,
          u.company_id,
          u.department_id,
          u.username,
          u.display_name,
          u.email,
          u.phone,
          u.status,
          coalesce(array_agg(r.code order by r.code) filter (where r.code is not null), '{}') as role_codes
        from users u
        left join user_roles ur on ur.user_id = u.id
        left join roles r on r.id = ur.role_id
        where u.id = $1
        group by
          u.id,
          u.company_id,
          u.department_id,
          u.username,
          u.display_name,
          u.email,
          u.phone,
          u.status
      `,
      [current.user_id]
    );
    const userRow = userResult.rows[0];
    if (!userRow || userRow.status !== "active") {
      return { error: "User not found" as const };
    }

    const nextSession = buildSession(mapUserProfile(userRow));

    await client.query(
      `
        update sessions
        set status = 'revoked'
        where id = $1
      `,
      [current.id]
    );

    await client.query(
      `
        insert into sessions (
          id,
          company_id,
          user_id,
          username,
          department_id,
          role_codes,
          access_token,
          refresh_token,
          status,
          created_at,
          access_expires_at,
          refresh_expires_at
        ) values ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      `,
      [
        nextSession.id,
        nextSession.companyId,
        nextSession.userId,
        nextSession.username,
        nextSession.departmentId,
        nextSession.roleCodes,
        nextSession.accessToken,
        nextSession.refreshToken,
        nextSession.status,
        nextSession.createdAt,
        nextSession.accessExpiresAt,
        nextSession.refreshExpiresAt
      ]
    );

    return { session: nextSession };
  });

  if ("error" in result) {
    return json(res, 401, { error: result.error });
  }

  return json(res, 200, {
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken
  });
}

export async function requireAuth(req: ApiRequest, res: ServerResponse) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    json(res, 401, { error: "Unauthorized" });
    return false;
  }

  const token = auth.slice(7).trim();
  const sessionRow = await queryOne<SessionWithDepartmentRow>(
    `
      select
        s.id,
        s.company_id,
        s.user_id,
        s.username,
        s.department_id,
        s.role_codes,
        s.access_token,
        s.refresh_token,
        s.created_at,
        s.access_expires_at,
        s.refresh_expires_at,
        s.status,
        d.name as department_name
      from sessions s
      left join departments d
        on d.id = s.department_id
       and d.company_id = s.company_id
      where s.access_token = $1
        and s.status = 'active'
    `,
    [token]
  );

  if (!sessionRow) {
    json(res, 401, { error: "Invalid session" });
    return false;
  }

  const session = mapSessionRecord(sessionRow);
  if (new Date(session.accessExpiresAt).getTime() <= Date.now()) {
    json(res, 401, { error: "Session expired" });
    return false;
  }

  const authContext: AuthContext = {
    companyId: session.companyId,
    userId: session.userId,
    username: session.username,
    departmentId: session.departmentId,
    departmentName: sessionRow.department_name,
    roleCodes: session.roleCodes,
    token
  };
  req.auth = authContext;
  return true;
}

export async function me(req: ApiRequest, res: ServerResponse) {
  if (!req.auth) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const userRow = await loadUserById(req.auth.userId);
  if (!userRow || userRow.status !== "active") {
    return json(res, 404, { error: "User not found" });
  }

  const user = mapUserProfile(userRow);
  return json(res, 200, {
    id: user.id,
    companyId: user.companyId,
    username: user.username,
    displayName: user.displayName,
    roleIds: user.roleIds,
    /**
     * 这个人实际持有的权限键。
     *
     * V16 补的：前端要按权限决定显示什么按钮（比如报销单的「批准/驳回」
     * 只给有 `expense.manage` 的人看）。此前 `me` 只返回 roleIds，
     * 前端要判断权限就得把 ROLE_PERMISSIONS 复制一份——
     * 两份权限表迟早漂移，而漂移的方向通常是前端把不该显示的按钮显示出来。
     *
     * 这不是权限边界本身：服务端每条路由仍然独立校验。
     * 前端用它只是为了不给用户看必然点不动的按钮。
     */
    permissions: resolvePermissions(user.roleIds),
    departmentName: req.auth.departmentName
  });
}

export async function logout(req: ApiRequest, res: ServerResponse) {
  const token = req.auth?.token;
  if (token) {
    await queryOne(
      `update sessions set status = 'revoked' where access_token = $1 returning id`,
      [token]
    );
  }
  return json(res, 200, { ok: true });
}
