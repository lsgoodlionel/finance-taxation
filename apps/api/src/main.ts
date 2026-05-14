import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

app.listen(env.port, env.host, () => {
  console.log(`V2 API listening on http://${env.host}:${env.port}`);
});
