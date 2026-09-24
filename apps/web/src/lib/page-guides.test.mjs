/**
 * **页面指南护栏**（V15）。
 *
 * 每个**用户能到达的页面**都必须有指南。新页面漏写在这里失败，
 * 而不是等到用户点开「本页指南」发现按钮根本不出现。
 *
 * ## 覆盖口径改过一次
 *
 * 第一版只检查左侧导航里的页面，于是 26 个导航项全过——而 `App.tsx` 里有
 * **40 条路由**，导航到不了但深链和页内跳转能到的（月末结账、任务中心、
 * 银行余额调节表）一个都没覆盖。用户报「很多页面没有看到指南」时，
 * 护栏是绿的。
 *
 * 现在按 `App.tsx` 的路由表算，那才是「用户能到达的页面」的真实定义。
 *
 * 还检查指南本身的质量——三条要求写在 `page-guides.ts` 的文件头：
 * `purpose` 说这一页回答什么问题、`steps` 是按顺序做的事、
 * `caution` 只写做错了会怎样。**没有信息量的话要拦下来**，
 * 因为「请谨慎操作」这种句子会让读的人以后跳过整个注意事项区。
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_GUIDES, findPageGuide, guideAnchorId } from "./page-guides.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 每个用户能到达的页面都要有指南 ────────────────────────────────────────
//
// 从 `App.tsx` 的路由表算，不是从导航算——导航到不了的页面（月末结账、
// 任务中心、银行余额调节表）用户照样能通过深链与页内跳转进去。
const appSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../App.tsx"),
  "utf8"
);
const appRoutes = [...appSource.matchAll(/\{\s*path:\s*"([^"]*)"/g)]
  .map((match) => match[1])
  .filter((path) => path !== "" && path !== "*")
  .map((path) => (path.startsWith("/") ? path : `/${path}`));

assert(appRoutes.length > 20, `路由解析失败，只解析出 ${appRoutes.length} 条`);

/**
 * 不需要指南的路由，**每条要说明为什么**。
 *
 * 只有两类是正当的：重定向（落地页有指南就够）、以及不面向业务的入口。
 */
const NO_GUIDE_NEEDED = new Map([
  ["/", "根路径：按 pro / guided 轨重定向到各自的首页"],
  ["/documents", "重定向到 /bills?tab=documents"],
  ["/invoices", "重定向到 /bills?tab=invoices"],
  ["/banking", "重定向到 /bills?tab=banking"],
  ["/pdf-export", "重定向到 /export-center"],
  ["/archive-package", "重定向到 /export-center"],
  ["/counterparties", "重定向到 /contracts?tab=counterparties"],
  ["/payroll/transfer", "重定向到 /payroll?tab=transfer"],
  ["/boss-qa", "重定向到旧入口别名"],
  ["/billing", "重定向到 /settings?tab=billing"],
  ["/feedback", "重定向到 /settings?tab=feedback"]
]);

const guideRoutes = new Set(PAGE_GUIDES.map((guide) => guide.route));

const missing = appRoutes.filter(
  (route) => !guideRoutes.has(route) && !NO_GUIDE_NEEDED.has(route)
);
assert(
  missing.length === 0,
  `这些页面用户能到达、但没有写指南：${missing.join("、")}\n` +
    "补进 page-guides.ts，或登记到 NO_GUIDE_NEEDED 并说明为什么（只有重定向算正当理由）。\n" +
    "按钮不出现比点开是空的更让人困惑——用户不知道这一页是没有指南还是他没找到。"
);

// 反向：指南写了、路由表里却没有——通常是路由改名而指南没跟着改。
const appRouteSet = new Set(appRoutes);
const orphanGuides = PAGE_GUIDES.map((guide) => guide.route).filter(
  (route) => !appRouteSet.has(route)
);
assert(
  orphanGuides.length === 0,
  `这些指南对应的路由在 App.tsx 里不存在：${orphanGuides.join("、")}\n` +
    "路由改名了就跟着改，页面下线了就删指南——过期的手册比没有手册更误导。"
);

// 登记的重定向必须真的还在，否则清单会越读越不可信。
for (const route of NO_GUIDE_NEEDED.keys()) {
  assert(appRouteSet.has(route), `NO_GUIDE_NEEDED 里的 ${route} 在 App.tsx 里已不存在`);
}

// ── 指南本身要有信息量 ──────────────────────────────────────────────────────
/** 没有信息量的套话。写了等于没写，还会让读的人以后跳过整个区块。 */
const EMPTY_PHRASES = ["请谨慎操作", "请注意", "仅供参考", "根据实际情况", "详见文档"];

for (const guide of PAGE_GUIDES) {
  assert(guide.title.trim().length > 0, `${guide.route} 缺标题`);
  assert(guide.audience.trim().length > 0, `${guide.route} 缺适用对象`);
  assert(
    guide.purpose.trim().length >= 10,
    `${guide.route} 的 purpose 太短（${guide.purpose.length} 字）——` +
      "它要说清这一页回答什么问题，不是罗列有哪些按钮"
  );
  assert(guide.steps.length > 0, `${guide.route} 一步操作都没写`);

  for (const step of guide.steps) {
    assert(step.trim().length >= 4, `${guide.route} 有一条步骤太短：「${step}」`);
  }

  for (const text of [guide.purpose, ...guide.steps, ...(guide.caution ?? [])]) {
    for (const phrase of EMPTY_PHRASES) {
      assert(
        !text.includes(phrase),
        `${guide.route} 里出现了没有信息量的套话「${phrase}」：${text}\n` +
          "说清楚做错了具体会怎样，而不是让人「注意」。"
      );
    }
  }

  // audience 写「所有人」是允许的（有些页面确实是），但不能只写这三个字加句号了事。
  assert(
    guide.audience.trim() !== "所有",
    `${guide.route} 的适用对象写得太含糊`
  );
}

// ── 相关页面必须指向真实存在的指南（双向链接的基础）────────────────────────
//
// 写错一个路由的表现是「点了没反应」——不报错，因为跳转目标只是不存在。
const routeSet = new Set(PAGE_GUIDES.map((guide) => guide.route));
for (const guide of PAGE_GUIDES) {
  for (const route of guide.related ?? []) {
    assert(
      routeSet.has(route),
      `${guide.route} 的「相关页面」指向了不存在的 ${route}——点了会没反应`
    );
    assert(route !== guide.route, `${guide.route} 的「相关页面」指向了自己`);
  }
}

// ── 锚点 id 唯一且合法 ─────────────────────────────────────────────────────
//
// 页面指南跳手册、手册内部跳转都靠它。重复的 id 会让跳转落到第一个，
// 而「跳错了」在界面上看起来像「跳转坏了」。
const anchors = new Set();
for (const guide of PAGE_GUIDES) {
  const id = guideAnchorId(guide.route);
  assert(/^[a-zA-Z][\w-]*$/.test(id), `${guide.route} 生成的锚点 id 不合法：${id}`);
  assert(!anchors.has(id), `锚点 id 重复：${id}`);
  anchors.add(id);
}

// ── 新增字段的质量 ─────────────────────────────────────────────────────────
for (const guide of PAGE_GUIDES) {
  for (const field of guide.fields ?? []) {
    assert(field.name.trim().length > 0, `${guide.route} 有字段缺名字`);
    assert(
      field.meaning.trim().length >= 6,
      `${guide.route} 的字段「${field.name}」说明太短——要说清它是什么意思`
    );
    if (field.note !== undefined) {
      assert(
        field.note.trim().length >= 10,
        `${guide.route} 的字段「${field.name}」的提示太短。` +
          "note 是写「填错会怎样」的，没有真实后果就不要写。"
      );
    }
  }

  for (const pitfall of guide.pitfalls ?? []) {
    assert(
      pitfall.symptom.trim().length >= 6,
      `${guide.route} 有一条问题的症状太短——要从用户看到的现象写起`
    );
    assert(pitfall.cause.trim().length >= 6, `${guide.route} 的「${pitfall.symptom}」缺原因`);
    assert(
      pitfall.fix.trim().length >= 8,
      `${guide.route} 的「${pitfall.symptom}」缺解决办法——只说原因不说怎么办等于没说`
    );
  }

  for (const item of guide.prerequisites ?? []) {
    assert(item.trim().length >= 6, `${guide.route} 有一条前置条件太短`);
  }
}

// ── 核心业务页面必须有字段说明与相关页面 ───────────────────────────────────
//
// 这几页是**用户最常卡住**的地方：填错字段或漏了前置配置，界面上只报一句
// 「提交失败」。指南里没有这两节，用户就只能猜。
const MUST_BE_DETAILED = [
  "/reimbursements",
  "/requests",
  "/payments",
  "/vouchers",
  "/ledger",
  "/cost-carryover",
  "/contracts",
  "/budget"
];
for (const route of MUST_BE_DETAILED) {
  const guide = PAGE_GUIDES.find((item) => item.route === route);
  assert(guide !== undefined, `缺 ${route} 的指南`);
  assert(
    (guide.fields ?? []).length > 0,
    `${route} 缺「关键字段怎么填」——这是用户最常卡住的页面之一`
  );
  assert((guide.related ?? []).length > 0, `${route} 缺「相关页面」，用户做完不知道去哪`);
}

// ── 最长前缀匹配：/dashboard/chairman 要匹配到它自己 ────────────────────────
const chairman = findPageGuide("/dashboard/chairman");
assert(chairman !== null, "找不到董事长驾驶舱的指南");
assert(chairman.route === "/dashboard/chairman", "应当精确匹配到自己");

// 子路径回退到父页面：/ledger?task=opening 与 /ledger/xxx 都该找到总账中心。
const ledgerSub = findPageGuide("/ledger/anything");
assert(ledgerSub !== null && ledgerSub.route === "/ledger", "子路径应当回退到父页面的指南");

// 完全不认识的路径返回 null，让按钮不显示，而不是给一个随便的指南。
assert(findPageGuide("/nowhere") === null, "未知路径应当返回 null");

console.log(`page-guides passed（${PAGE_GUIDES.length} 个页面全部有指南）`);
