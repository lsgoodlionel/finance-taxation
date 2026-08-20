/**
 * **页面指南护栏**（V15）。
 *
 * 每个导航能到达的页面都必须有指南。新页面漏写在这里失败，
 * 而不是等到用户点开「本页指南」发现是空的。
 *
 * 还检查指南本身的质量——三条要求写在 `page-guides.ts` 的文件头：
 * `purpose` 说这一页回答什么问题、`steps` 是按顺序做的事、
 * `caution` 只写做错了会怎样。**没有信息量的话要拦下来**，
 * 因为「请谨慎操作」这种句子会让读的人以后跳过整个注意事项区。
 */

import { PAGE_GUIDES, findPageGuide } from "./page-guides";
import { guidedNavItems, proNavItems } from "./nav-filter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 每个导航项都要有指南（两轨都算）────────────────────────────────────────
//
// guided 轨是扁平的（没有分组），pro 轨是分组的——两边都要覆盖，
// 因为业务人员看到的页面同样需要指南，甚至更需要。
function collectRoutes(items: readonly { key: string; children?: readonly { key: string }[] }[]) {
  return items.flatMap((item) =>
    item.children === undefined ? [item.key] : item.children.map((child) => child.key)
  );
}

const navRoutes = [
  ...new Set([...collectRoutes(proNavItems), ...collectRoutes(guidedNavItems)])
];
const guideRoutes = new Set(PAGE_GUIDES.map((guide) => guide.route));

const missing = navRoutes.filter((route) => !guideRoutes.has(route));
assert(
  missing.length === 0,
  `这些页面在左侧导航里、但没有写指南：${missing.join("、")}\n` +
    "补进 page-guides.ts。点开是空的「本页指南」比没有按钮更让人失望。"
);

// 反向：指南写了、导航里却没有的页面——通常是路由改了名而指南没跟着改。
const navSet = new Set(navRoutes);
const orphanGuides = PAGE_GUIDES.map((g) => g.route).filter((route) => !navSet.has(route));
assert(
  orphanGuides.length === 0,
  `这些指南对应的页面不在导航里：${orphanGuides.join("、")}\n` +
    "路由改名了就跟着改，页面下线了就删指南——过期的手册比没有手册更误导。"
);

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
