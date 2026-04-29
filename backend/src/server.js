import http from "node:http";
import { appConfig } from "./config/app.js";
import { router } from "./routes/index.js";
import { sendJson } from "./utils/http.js";

const server = http.createServer(async (req, res) => {
  try {
    await router(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal Server Error", detail: error.message });
  }
});

server.listen(appConfig.port, () => {
  console.log(`Backend listening on http://127.0.0.1:${appConfig.port}`);
});
