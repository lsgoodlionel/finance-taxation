import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { appConfig } from "../../config/app.js";
import { readRequestBody, sendJson } from "../../utils/http.js";
import { readJson, writeJson } from "../../services/json-store.js";

const usersFile = new URL("users.json", appConfig.dataDir);
const sessionsFile = new URL("sessions.json", appConfig.dataDir);

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHash, "hex"));
}

const seedUsers = [
  {
    id: "demo-user",
    companyId: "demo-company",
    username: "admin",
    displayName: "系统管理员",
    role: "admin",
    passwordSalt: "finance-taxation-demo-salt",
    passwordHash: hashPassword("123456", "finance-taxation-demo-salt"),
    status: "active"
  }
];

const seedSessions = [];

export async function login(req, res) {
  const body = await readRequestBody(req);
  const users = await readJson(usersFile, seedUsers);
  const sessions = await readJson(sessionsFile, seedSessions);
  const user = users.find((item) => item.username === body.username && item.status !== "disabled");
  if (!user || !verifyPassword(body.password || "", user.passwordSalt, user.passwordHash)) {
    return sendJson(res, 401, { error: "Invalid credentials" });
  }
  const accessToken = randomBytes(24).toString("hex");
  const refreshToken = randomBytes(32).toString("hex");
  const now = Date.now();
  const nextSession = {
    id: `sess-${now}`,
    accessToken,
    refreshToken,
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
    createdAt: new Date(now).toISOString(),
    accessExpiresAt: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
    refreshExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active"
  };
  sessions.unshift(nextSession);
  await writeJson(sessionsFile, sessions.slice(0, 100));
  return sendJson(res, 200, {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      companyId: user.companyId
    }
  });
}

export async function me(req, res) {
  const users = await readJson(usersFile, seedUsers);
  const user = users.find((item) => item.id === req.auth.userId);
  if (!user) {
    return sendJson(res, 404, { error: "User not found" });
  }
  return sendJson(res, 200, {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    companyId: user.companyId
  });
}

export async function logout(req, res) {
  const auth = req.headers.authorization || "";
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const sessions = await readJson(sessionsFile, seedSessions);
  const nextSessions = sessions.map((session) =>
    session.accessToken === accessToken
      ? { ...session, status: "revoked", revokedAt: new Date().toISOString() }
      : session
  );
  await writeJson(sessionsFile, nextSessions);
  return sendJson(res, 200, { ok: true });
}
