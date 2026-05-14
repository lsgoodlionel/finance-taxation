import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "../../utils/http.js";

export function handleEventsMeta(_req: IncomingMessage, res: ServerResponse) {
  return json(res, 200, {
    module: "events",
    plannedEndpoints: [
      "GET /api/events",
      "POST /api/events",
      "GET /api/events/:id",
      "PUT /api/events/:id",
      "POST /api/events/:id/analyze",
      "POST /api/events/:id/relations"
    ]
  });
}
