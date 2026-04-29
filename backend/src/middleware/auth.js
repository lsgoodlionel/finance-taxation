import { appConfig } from "../config/app.js";
import { readJson } from "../services/json-store.js";
import { sendJson } from "../utils/http.js";

const sessionsFile = new URL("sessions.json", appConfig.dataDir);
const usersFile = new URL("users.json", appConfig.dataDir);

export async function requireAuth(req, res) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    sendJson(res, 401, { error: "Unauthorized" });
    return false;
  }
  const accessToken = auth.slice(7).trim();
  const sessions = await readJson(sessionsFile, []);
  const users = await readJson(usersFile, []);
  const session = sessions.find((item) => item.accessToken === accessToken && item.status === "active");
  if (!session) {
    sendJson(res, 401, { error: "Invalid session" });
    return false;
  }
  if (new Date(session.accessExpiresAt).getTime() <= Date.now()) {
    sendJson(res, 401, { error: "Session expired" });
    return false;
  }
  const user = users.find((item) => item.id === session.userId && item.status !== "disabled");
  if (!user) {
    sendJson(res, 401, { error: "User disabled or missing" });
    return false;
  }
  req.auth = {
    companyId: session.companyId,
    userId: session.userId,
    role: user.role,
    sessionId: session.id
  };
  return true;
}

export function requireRole(allowedRoles) {
  return async (req, res) => {
    if (!(await requireAuth(req, res))) return false;
    if (!allowedRoles.includes(req.auth.role)) {
      sendJson(res, 403, { error: "Forbidden" });
      return false;
    }
    return true;
  };
}
