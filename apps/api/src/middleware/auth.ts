import type { ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { Department, PermissionKey, UserProfile } from "@finance-taxation/domain-model";
import type { ApiRequest, AuthContext } from "../types.js";
import { json } from "../utils/http.js";
import { readJson, writeJson } from "../services/jsonStore.js";
import { env } from "../config/env.js";

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

interface UserRecord extends UserProfile {
  password: string;
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

const usersFile = new URL("../data/users.v2.json", import.meta.url);
const sessionsFile = new URL("../data/sessions.v2.json", import.meta.url);
const departmentsFile = new URL("../data/departments.v2.json", import.meta.url);

const seedUsers: UserRecord[] = [
  {
    id: "usr-chairman-001",
    companyId: "cmp-tech-001",
    departmentId: "dept-board",
    username: "chairman",
    displayName: "创始人董事长",
    email: "chairman@example.com",
    phone: "13800000000",
    status: "active",
    roleIds: ["role-chairman"],
    password: "123456"
  },
  {
    id: "usr-fin-001",
    companyId: "cmp-tech-001",
    departmentId: "dept-finance",
    username: "finance",
    displayName: "财务负责人",
    email: "finance@example.com",
    phone: "13900000000",
    status: "active",
    roleIds: ["role-finance-director"],
    password: "123456"
  }
];

const seedSessions: SessionRecord[] = [];
const seedDepartments: Department[] = [
  {
    id: "dept-board",
    companyId: "cmp-tech-001",
    parentDepartmentId: null,
    name: "董事会",
    leaderUserId: "usr-chairman-001"
  },
  {
    id: "dept-finance",
    companyId: "cmp-tech-001",
    parentDepartmentId: null,
    name: "财务部",
    leaderUserId: "usr-fin-001"
  }
];

function buildSession(user: UserRecord): SessionRecord {
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

export async function login(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as { username?: string; password?: string };
  const users = await readJson(usersFile, seedUsers);
  const user = users.find(
    (item) =>
      item.username === body.username &&
      item.password === body.password &&
      item.status === "active"
  );

  if (!user) {
    return json(res, 401, { error: "Invalid credentials" });
  }

  const sessions = await readJson(sessionsFile, seedSessions);
  const session = buildSession(user);
  sessions.unshift(session);
  await writeJson(sessionsFile, sessions.slice(0, 200));

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

  const sessions = await readJson(sessionsFile, seedSessions);
  const current = sessions.find(
    (item) => item.refreshToken === body.refreshToken && item.status === "active"
  );
  if (!current) {
    return json(res, 401, { error: "Invalid refresh token" });
  }

  if (new Date(current.refreshExpiresAt).getTime() <= Date.now()) {
    return json(res, 401, { error: "Refresh token expired" });
  }

  const users = await readJson(usersFile, seedUsers);
  const user = users.find((item) => item.id === current.userId && item.status === "active");
  if (!user) {
    return json(res, 401, { error: "User not found" });
  }

  const nextSession = buildSession(user);
  const nextSessions = sessions.map((item) =>
    item.id === current.id ? { ...item, status: "revoked" as const } : item
  );
  nextSessions.unshift(nextSession);
  await writeJson(sessionsFile, nextSessions.slice(0, 200));

  return json(res, 200, {
    accessToken: nextSession.accessToken,
    refreshToken: nextSession.refreshToken
  });
}

export async function requireAuth(req: ApiRequest, res: ServerResponse) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    json(res, 401, { error: "Unauthorized" });
    return false;
  }

  const token = auth.slice(7).trim();
  const sessions = await readJson(sessionsFile, seedSessions);
  const session = sessions.find((item) => item.accessToken === token && item.status === "active");
  if (!session) {
    json(res, 401, { error: "Invalid session" });
    return false;
  }

  if (new Date(session.accessExpiresAt).getTime() <= Date.now()) {
    json(res, 401, { error: "Session expired" });
    return false;
  }

  const departments = await readJson(departmentsFile, seedDepartments);
  const departmentName =
    departments.find((item) => item.id === session.departmentId && item.companyId === session.companyId)
      ?.name || null;

  const authContext: AuthContext = {
    companyId: session.companyId,
    userId: session.userId,
    username: session.username,
    departmentId: session.departmentId,
    departmentName,
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
  const users = await readJson(usersFile, seedUsers);
  const user = users.find((item) => item.id === req.auth?.userId);
  if (!user) {
    return json(res, 404, { error: "User not found" });
  }
  return json(res, 200, {
    id: user.id,
    companyId: user.companyId,
    username: user.username,
    displayName: user.displayName,
    roleIds: user.roleIds
  });
}
