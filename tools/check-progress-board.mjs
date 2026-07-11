import { readFileSync } from "node:fs";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node tools/check-progress-board.mjs <file>");
  process.exit(1);
}

const content = readFileSync(filePath, "utf8");
const markerSets = [
  [
    "# V2 进度板",
    "## 2. 总览",
    "## 3. 当前优先任务",
    "Status",
    "Last Update",
    "Blocker"
  ],
  [
    "# V4 进度板",
    "目标：真实业务验收与生产可靠性",
    "基线：",
    "| 工作流 | 分支 | 状态 | 验收范围 |",
    "V4-0 基线与 E2E",
    "V4-5 安全与运维"
  ]
];

const matchingSet = markerSets.find((markers) =>
  markers.every((marker) => content.includes(marker))
);

if (!matchingSet) {
  console.error(`Progress board markers did not match any known schema: ${filePath}`);
  process.exit(1);
}

console.log(`progress-board-ok:${filePath}`);
