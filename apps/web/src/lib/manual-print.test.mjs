/**
 * 说明书打印版的断言（V15）。
 *
 * ## 两类风险
 *
 * **内容漏了**：某一节忘了渲染，而 HTML 生成不会报错——它只是少一段。
 * 每一节都断言它的标志性内容真的出现了。
 *
 * **转义顺序错了**：手册正文用 `**强调**` 标记，先转标记再转义会把刚生成的
 * `<strong>` 也转掉，页面上直接看到尖括号。这条单独测。
 */

import { buildManualHtml } from "./manual-print.ts";
import { PAGE_GUIDES } from "./page-guides.ts";
import { TERMINOLOGY } from "./terminology.ts";
import { ADMIN_SETUP, FAQ, ROLE_MATRIX, TROUBLESHOOTING } from "./manual-content.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const html = buildManualHtml({
  companyName: "测试公司",
  generatedAt: "2026-08-20 10:00:00"
});

/**
 * 把 HTML 还原成纯文本再比对。
 *
 * 直接拿原文切片去 `includes` 是错的：`**不能记账**（没有 ledger.post）` 在
 * HTML 里变成 `<strong>不能记账</strong>（没有 ledger.post）`，
 * **强调标记在中间插入了标签**，任何跨越那个边界的切片都对不上。
 *
 * 第一次写这条断言时就栽在这里，而它报的「缺出纳的不能做」完全是误导的——
 * 内容在，只是形态变了。比对形态而不是比对内容，就会得到这种假失败。
 */
function toPlainText(source) {
  return source
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const plainHtml = toPlainText(html);

// ── 骨架 ────────────────────────────────────────────────────────────────────
assert(html.startsWith("<!doctype html>"), "应当是完整的 HTML 文档");
assert(html.includes('lang="zh-CN"'), "应当声明中文，否则浏览器可能用错断行规则");
assert(html.includes("@page"), "缺 @page 规则——默认页边距会把表格挤断");
assert(html.includes("page-break-inside: avoid"), "缺分页保护，一条指南会被拦腰截断");
assert(html.includes("测试公司"), "封面应当带公司名");
assert(html.includes("2026-08-20 10:00:00"), "应当带生成时间");

// 打印按钮本身不能被打印出来。
assert(html.includes('class="print-btn no-print"'), "打印按钮要带 no-print");
assert(html.includes("@media print { .print-btn { display: none; } }"), "打印时要隐藏按钮");

// ── 八节内容都在 ────────────────────────────────────────────────────────────
for (const anchor of ["setup", "roles", "rhythm", "flows", "pages", "terms", "faq", "trouble"]) {
  assert(html.includes(`id="${anchor}"`), `缺第「${anchor}」节`);
  assert(html.includes(`href="#${anchor}"`), `目录里缺「${anchor}」的链接`);
}

// ── 每一节的实际内容都渲染了，不只是标题 ────────────────────────────────────
for (const guide of PAGE_GUIDES) {
  assert(html.includes(guide.title), `逐页说明里缺「${guide.title}」`);
  assert(html.includes(guide.route), `逐页说明里缺路由 ${guide.route}`);
}
for (const term of TERMINOLOGY) {
  assert(html.includes(term.term), `术语表里缺「${term.term}」`);
}
for (const item of FAQ) {
  assert(plainHtml.includes(item.question), `常见问题里缺「${item.question}」`);
  assert(
    plainHtml.includes(item.answer.replace(/\*\*/g, "")),
    `常见问题「${item.question}」缺答案`
  );
}
for (const item of TROUBLESHOOTING) {
  assert(plainHtml.includes(item.question), `故障排查里缺「${item.question}」`);
}
for (const role of ROLE_MATRIX) {
  assert(html.includes(role.role), `角色表里缺「${role.role}」`);
  assert(
    plainHtml.includes(role.cannot.replace(/\*\*/g, "")),
    `角色表里缺「${role.role}」的「不能做」`
  );
  assert(
    plainHtml.includes(role.scope.replace(/\*\*/g, "")),
    `角色表里缺「${role.role}」的「能做」`
  );
}
assert(plainHtml.includes(ADMIN_SETUP[0].step), "上手顺序缺第一步");

// ── 转义与强调：顺序不能反 ──────────────────────────────────────────────────
// 手册正文里有 `**这是最关键的一步。**`，要变成 <strong> 而不是字面星号。
assert(html.includes("<strong>"), "强调标记没有被转成 <strong>");
assert(!html.includes("**"), "还有没被转换的强调标记，页面上会看到裸星号");

// 而真正的尖括号要被转义。角色表里有「复核人 ≠ 过账人」，找一个带尖括号的场景：
const escaped = buildManualHtml({
  companyName: '<script>alert("x")</script>',
  generatedAt: "2026-08-20"
});
assert(!escaped.includes("<script>alert"), "公司名没有被转义——那是一个注入口");
assert(escaped.includes("&lt;script&gt;"), "公司名应当被转义成实体");

// ── 纯函数：同样的入参得同样的结果 ──────────────────────────────────────────
// 生成时间由调用方传入，函数自己不取 Date.now——否则这条断言不可能成立，
// 而不可测的生成器出了问题只能靠肉眼看。
const again = buildManualHtml({ companyName: "测试公司", generatedAt: "2026-08-20 10:00:00" });
assert(again === html, "同样的入参应当得到完全相同的输出");

console.log(
  `manual-print passed（${PAGE_GUIDES.length} 页指南 + ${TERMINOLOGY.length} 条术语 + ` +
    `${FAQ.length} 条问答 + ${TROUBLESHOOTING.length} 条排查，共 ${html.length} 字符）`
);
