import {
  SCENE_COMMANDS,
  filterSceneCommands,
  isCommandVisibleInMode,
  matchSceneCommand,
  sceneCommandDescription,
} from "./scene-commands";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 已知合法路由前缀清单（App.tsx 路由表 + V7 Stage K 待接线路由） ────────────
const KNOWN_ROUTE_PREFIXES = [
  "/home",
  "/inbox",
  "/dashboard/chairman",
  "/close",
  "/events",
  "/tasks",
  "/bills",
  "/vouchers",
  "/ledger",
  "/reports",
  "/export-center",
  "/tax",
  "/rnd",
  "/risk",
  "/contracts",
  "/payroll",
  "/assistant",
  "/audit",
  "/knowledge",
  "/settings",
  "/quick-entry",
];

for (const cmd of SCENE_COMMANDS) {
  const pathname = cmd.path.split("?")[0] ?? "";
  assert(
    KNOWN_ROUTE_PREFIXES.includes(pathname),
    `expected ${cmd.key} path ${cmd.path} to target a known route`
  );
}

// ── key 唯一性 ───────────────────────────────────────────────────────────────
const keys = SCENE_COMMANDS.map((cmd) => cmd.key);
assert(new Set(keys).size === keys.length, "expected scene command keys to be unique");

// ── guided 视角 ≥10 个业务动词 ───────────────────────────────────────────────
const guidedCommands = SCENE_COMMANDS.filter((cmd) => isCommandVisibleInMode(cmd, "guided"));
assert(
  guidedCommands.length >= 10,
  `expected >=10 guided commands, got ${guidedCommands.length}`
);

// guided 必备动词抽查（名称 → 路径）
const guidedExpectations: Array<[string, string]> = [
  ["记一笔", "/quick-entry"],
  ["传票据", "/bills"],
  ["查一笔钱去哪了", "/ledger?ledgerTab=journal"],
  ["给员工报销", "/quick-entry"],
  ["客户要发票", "/bills?tab=invoices"],
  ["看经营情况", "/dashboard/chairman"],
  ["发工资", "/payroll"],
];
for (const [label, path] of guidedExpectations) {
  const found = guidedCommands.find((cmd) => cmd.label.includes(label));
  assert(found, `expected guided command labelled ${label}`);
  assert(found.path === path, `expected ${label} to route to ${path}, got ${found.path}`);
}

// ── pro 专属财务动词 ≥3 个 ───────────────────────────────────────────────────
const proOnlyCommands = SCENE_COMMANDS.filter(
  (cmd) => cmd.modes !== undefined && cmd.modes.length === 1 && cmd.modes[0] === "pro"
);
assert(
  proOnlyCommands.length >= 3,
  `expected >=3 pro-only commands, got ${proOnlyCommands.length}`
);
assert(
  proOnlyCommands.some((cmd) => cmd.label.includes("结转损益") && cmd.path === "/close"),
  "expected pro command 结转损益 → /close"
);
assert(
  proOnlyCommands.some((cmd) => cmd.label.includes("锁账") && cmd.path === "/ledger?ledgerTab=periods"),
  "expected pro command 锁账 → /ledger?ledgerTab=periods"
);
assert(
  proOnlyCommands.some((cmd) => cmd.label.includes("申报底稿") && cmd.path === "/tax"),
  "expected pro command 出申报底稿 → /tax"
);

// ── pro 专属动词不出现在 guided ──────────────────────────────────────────────
for (const cmd of proOnlyCommands) {
  assert(
    !isCommandVisibleInMode(cmd, "guided"),
    `expected pro-only command ${cmd.key} to be hidden in guided mode`
  );
}

// ── 模式过滤：记一笔 在 guided → /quick-entry，在 pro → /events ─────────────
const guidedQuickEntry = filterSceneCommands("记一笔", "guided");
assert(
  guidedQuickEntry.some((cmd) => cmd.path === "/quick-entry"),
  "expected guided 记一笔 to reach /quick-entry"
);
assert(
  !guidedQuickEntry.some((cmd) => cmd.path === "/events"),
  "expected guided 记一笔 not to surface the pro events command"
);
const proQuickEntry = filterSceneCommands("记一笔", "pro");
assert(
  proQuickEntry.some((cmd) => cmd.path === "/events"),
  "expected pro 记一笔 keyword to reach /events"
);
assert(
  !proQuickEntry.some((cmd) => cmd.path === "/quick-entry"),
  "expected pro mode to hide the guided quick-entry command"
);

// ── 不传 mode 时保持旧行为：返回全部匹配命令 ─────────────────────────────────
assert(
  filterSceneCommands("").length === SCENE_COMMANDS.length,
  "expected empty query without mode to return all commands"
);

// ── 匹配逻辑（沿用 v2 行为） ─────────────────────────────────────────────────
const payroll = SCENE_COMMANDS.find((cmd) => cmd.key === "scene-payroll");
assert(payroll, "expected scene-payroll to exist");
assert(matchSceneCommand(payroll, "发工资"), "expected label match");
assert(matchSceneCommand(payroll, "payroll"), "expected keyword match");
assert(matchSceneCommand(payroll, "  "), "expected blank query to match all");
assert(!matchSceneCommand(payroll, "开发票"), "expected unrelated query not to match");

// ── guided 副标题：有白话版用白话版，否则回退 description ────────────────────
assert(
  sceneCommandDescription(payroll, "guided") === payroll.guidedDescription,
  "expected guided description to prefer guidedDescription"
);
assert(
  sceneCommandDescription(payroll, "pro") === payroll.description,
  "expected pro description to keep the professional wording"
);
const traceMoney = SCENE_COMMANDS.find((cmd) => cmd.key === "scene-trace-money");
assert(traceMoney, "expected scene-trace-money to exist");
assert(
  sceneCommandDescription(traceMoney, "guided") === traceMoney.description,
  "expected fallback to description when guidedDescription is absent"
);

console.log("scene-commands-ok");
