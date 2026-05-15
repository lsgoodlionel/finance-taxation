import type { ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { PermissionKey, UserProfile } from "@finance-taxation/domain-model";
import type { ApiRequest, AuthContext } from "../types.js";
import { env } from "../config/env.js";
import { queryOne, withTransaction } from "../db/client.js";
import { json } from "../utils/http.js";

const ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  "role-chairman": [
    "dashboard.view", "events.view", "events.create", "events.assign",
    "tasks.view", "tasks.manage", "documents.view", "documents.manage",
    "ledger.view", "ledger.post", "tax.view", "tax.manage",
    "rnd.view", "rnd.manage", "risk.view", "risk.manage", "settings.manage"
  ],
  "role-finance-director": [
    "dashboard.view", "events.view", "events.create", "events.assign",
    "tasks.view", "tasks.manage", "documents.view", "documents.manage",
    "ledger.view", "ledger.post", "tax.view", "tax.manage",
    "rnd.view", "rnd.manage", "risk.view", "risk.manage"
  ],
  "role-accountant": [
    "dashboard.view", "events.view",
    "tasks.view", "documents.view", "documents.manage",
    "ledger.view", "ledger.post", "tax.view", "tax.manage"
  ],
  "role-viewer": [
    "dashboard.view", "events.view", "tasks.view",
    "documents.view", "ledger.view", "tax.view"
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
  password_hash: string;
  role_codes: string[] | null;
}

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

function buildSession(user: UserProfile): SessionRecord {
  const now = Date.now();
  return {
    id: `sess-${now}`,
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
        up.password_hash
    `,
    [username]
  );
}

async function loadUserById(userId: string): Promise<AuthUserRow | null> {
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
        coalesce(array_agg(r.code order by r.code) filter (where r.code is not null), '{}') as role_codes
      from users u
      join user_passwords up on up.user_id = u.id
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
        u.status,
        up.password_hash
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

export async function login(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as { username?: string; password?: string };
  if (!body.username || !body.password) {
    return json(res, 400, { error: "username and password are required" });
  }

  const userRow = await loadUserByUsername(body.username);
  if (!userRow || userRow.status !== "active" || userRow.password_hash !== body.password) {
    return json(res, 401, { error: "Invalid credentials" });
  }

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
          up.password_hash,
          coalesce(array_agg(r.code order by r.code) filter (where r.code is not null), '{}') as role_codes
        from users u
        join user_passwords up on up.user_id = u.id
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
          u.status,
          up.password_hash
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
    roleIds: user.roleIds
  });
}
