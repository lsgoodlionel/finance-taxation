import { buildApp } from "./app.js";
import { env } from "./config/env.js";

// Last-resort process guards so a stray async error never silently kills the
// API (the request-level boundary in buildApp handles per-request failures;
// these cover anything that escapes it). Log loudly but keep the server alive.
process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandledRejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[api] uncaughtException:", error);
});

const app = buildApp();

app.listen(env.port, env.host, () => {
  console.log(`V2 API listening on http://${env.host}:${env.port}`);
});
