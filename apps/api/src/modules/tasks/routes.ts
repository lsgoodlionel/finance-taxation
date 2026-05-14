import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "../../utils/http.js";

export function handleTasksMeta(_req: IncomingMessage, res: ServerResponse) {
  return json(res, 200, {
    module: "tasks",
    plannedEndpoints: [
      "GET /api/tasks",
      "POST /api/tasks",
      "GET /api/tasks/:id",
      "PUT /api/tasks/:id",
      "POST /api/tasks/:id/approve",
      "POST /api/tasks/:id/block"
    ]
  });
}
