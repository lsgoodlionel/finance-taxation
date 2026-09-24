/**
 * **帮助入口唯一性护栏**（V15）。
 *
 * ## 为什么需要
 *
 * 用户报「税务中心右上角有两个说明，一个 ? 一个本页指南」。原因是页面里
 * 手写的帮助按钮与 `PageHeader` 自带的「本页指南」并存——**两个问号会让人
 * 以为自己点错了，或者以为两个点开的是不同的东西**。
 *
 * 清理时发现有八个页面是这样。手工清完之后必须有护栏，
 * 否则下次加页面又会有人顺手写一个问号按钮。
 *
 * ## 判定：页面里不得出现旧的帮助形态
 *
 * 两类都拦：
 * 1. 引用 `HelpPanel` / `HelpTriggerButton`（旧的统一帮助组件）
 * 2. 手写一个内容是 `?` 的圆形按钮（那是没走组件、直接画的）
 *
 * 帮助的唯一入口是 `PageGuideButton`，内容来自 `page-guides` 注册表。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../pages");

/**
 * 允许仍然引用旧帮助组件的文件。
 *
 * `HelpPanel` 组件本身与它的测试要留着——**它还没有被删**，
 * 只是不再被页面使用。真要删要单独一次改动，混在这次清理里会让 diff 难读。
 */
const ALLOWED = new Set([
  "components/ui/HelpPanel.tsx",
  "components/ui/HelpPanel.test.tsx"
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const offenders = [];
const handwritten = [];

for (const file of walk(pagesRoot)) {
  const relative = file.slice(pagesRoot.length - "pages".length);
  if (ALLOWED.has(relative)) continue;
  const source = readFileSync(file, "utf8");

  if (/HelpPanel|HelpTriggerButton|HelpModal/.test(source)) {
    offenders.push(relative);
  }

  // 手写的问号按钮：一个 <button>，标题是「说明」，内容是单个 ?
  if (/<button[\s\S]{0,400}?>\s*\?\s*<\/button>/.test(source)) {
    handwritten.push(relative);
  }
}

assert(
  offenders.length === 0,
  `这些页面还在用旧的帮助组件：\n  ${offenders.join("\n  ")}\n` +
    "帮助的唯一入口是 PageGuideButton（PageHeader 会自动渲染），" +
    "内容写进 lib/guides/。两套帮助并存会让页面右上角出现两个说明入口。"
);

assert(
  handwritten.length === 0,
  `这些页面手写了「?」按钮：\n  ${handwritten.join("\n  ")}\n` +
    "删掉它——PageHeader 已经有「本页指南」了。"
);

console.log("single-help-entry passed（帮助入口唯一）");
