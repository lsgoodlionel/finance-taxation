import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "../../utils/http.js";

export function handleAuthMeta(_req: IncomingMessage, res: ServerResponse) {
  return json(res, 200, {
    module: "auth",
    plannedEndpoints: [
      "POST /api/auth/login",
      "POST /api/auth/refresh",
      "POST /api/auth/logout",
      "GET /api/access/me",
      "GET /api/access/menu"
    ]
  });
}
