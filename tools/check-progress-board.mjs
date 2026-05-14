import { readFileSync } from "node:fs";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node tools/check-progress-board.mjs <file>");
  process.exit(1);
}

const content = readFileSync(filePath, "utf8");

const requiredMarkers = [
  "# V2 进度板",
  "## 2. 总览",
  "## 3. 当前优先任务",
  "Status",
  "Last Update",
  "Blocker"
];

for (const marker of requiredMarkers) {
  if (!content.includes(marker)) {
    console.error(`Missing marker: ${marker}`);
    process.exit(1);
  }
}

console.log(`progress-board-ok:${filePath}`);
