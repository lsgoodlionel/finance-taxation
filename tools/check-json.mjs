import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const targetDir = process.argv[2];

if (!targetDir) {
  console.error("Usage: node tools/check-json.mjs <dir>");
  process.exit(1);
}

for (const name of readdirSync(targetDir)) {
  const fullPath = path.join(targetDir, name);
  if (!statSync(fullPath).isFile() || !name.endsWith(".json")) {
    continue;
  }
  JSON.parse(readFileSync(fullPath, "utf8"));
}

console.log(`json-ok:${targetDir}`);
