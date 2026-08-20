/**
 * 说明书的打印版 HTML（V15）。
 *
 * ## 为什么在前端生成而不是后端
 *
 * 项目里已有的 PDF（工资表、凭证、报表）都是后端出 HTML——因为那些数据在后端。
 * **说明书的内容全在前端**（`page-guides.ts`、`manual-content.ts`、
 * `terminology.ts`），拿到后端去等于把三份常量复制一遍，那必定漂移。
 *
 * 生成方式与后端那套一致：打印友好的 HTML + `@media print` 规则，
 * 用浏览器的「打印 → 存为 PDF」出片。**不引 PDF 库**——
 * 中文字体嵌入会让包大好几 MB，而浏览器自己就能排中文。
 *
 * ## 打印样式的几个必须
 *
 * - `@page` 定 A4 与页边距，否则默认边距会把表格挤断
 * - `page-break-inside: avoid` 保证一条指南不被拦腰截断
 * - 目录带页码占位不做——HTML 打印拿不到最终页码，写了就是假的
 */

import { PAGE_GUIDES } from "./page-guides";
import {
  ADMIN_SETUP,
  DATA_FLOWS,
  FAQ,
  RHYTHM,
  ROLE_MATRIX,
  TROUBLESHOOTING
} from "./manual-content";
import { TERMINOLOGY } from "./terminology";

/** HTML 转义。手册里有「≠」「→」这类符号，也有用户可能填过的内容。 */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 把正文里的 `**强调**` 转成 `<strong>`。
 *
 * 手册的内容是给人读的散文，强调标记用得不少。**先转义再转标记**——
 * 反过来会让转义把刚生成的标签也转掉。
 */
function inline(text: string): string {
  return esc(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

const PRINT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans", Arial, sans-serif;
  font-size: 12px; color: #111; padding: 28px; line-height: 1.7;
}
@media print {
  @page { margin: 14mm 12mm; size: A4; }
  .no-print { display: none !important; }
  .page-break { page-break-before: always; }
  h2 { page-break-after: avoid; }
  .guide, .faq-item, tr { page-break-inside: avoid; }
  table { page-break-inside: auto; }
}
h1 { font-size: 24px; margin-bottom: 4px; }
h2 { font-size: 17px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #333; }
h3 { font-size: 14px; margin: 16px 0 6px; }
p { margin-bottom: 8px; }
ol, ul { margin: 0 0 8px 22px; }
li { margin-bottom: 3px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11.5px; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #f2f2f2; font-weight: 600; }
.meta { color: #555; font-size: 11px; margin-bottom: 20px; }
.toc { columns: 2; font-size: 12px; margin-bottom: 8px; }
.toc a { color: #111; text-decoration: none; }
.guide { margin-bottom: 18px; padding-left: 12px; border-left: 3px solid #ddd; }
.guide-head { font-weight: 700; font-size: 13.5px; }
.route { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; color: #555; }
.audience { font-size: 11px; color: #555; }
.caution { color: #92400e; }
.caution li::marker { color: #92400e; }
.faq-item { margin-bottom: 12px; }
.faq-q { font-weight: 600; }
.faq-a { color: #333; }
.print-btn {
  position: fixed; bottom: 24px; right: 24px; padding: 12px 24px;
  background: #1e2a37; color: #fff; border: none; border-radius: 8px;
  cursor: pointer; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
}
@media print { .print-btn { display: none; } }
`;

function renderGuides(): string {
  return PAGE_GUIDES.map(
    (guide) => `
    <div class="guide">
      <div class="guide-head">${esc(guide.title)} <span class="route">${esc(guide.route)}</span></div>
      <div class="audience">适用对象：${inline(guide.audience)}</div>
      <p>${inline(guide.purpose)}</p>
      <ol>${guide.steps.map((step) => `<li>${inline(step)}</li>`).join("")}</ol>
      ${
        guide.caution !== undefined && guide.caution.length > 0
          ? `<ul class="caution">${guide.caution
              .map((item) => `<li>${inline(item)}</li>`)
              .join("")}</ul>`
          : ""
      }
      ${guide.flow !== undefined ? `<p class="audience">上下游：${inline(guide.flow)}</p>` : ""}
    </div>`
  ).join("");
}

function renderTable(
  headers: readonly string[],
  rows: ReadonlyArray<readonly string[]>
): string {
  return `<table>
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
      .join("")}</tbody>
  </table>`;
}

function renderFaq(items: readonly { question: string; answer: string }[]): string {
  return items
    .map(
      (item) => `
    <div class="faq-item">
      <div class="faq-q">Q：${inline(item.question)}</div>
      <div class="faq-a">A：${inline(item.answer)}</div>
    </div>`
    )
    .join("");
}

export interface ManualPrintInput {
  /** 公司名。写进封面，让打印出来的册子能认出是谁的。 */
  companyName: string;
  /** 生成时间。由调用方传入——纯函数不自己取时间，否则测不了。 */
  generatedAt: string;
}

/** 生成完整说明书的打印版 HTML。**纯函数**，可测。 */
export function buildManualHtml(input: ManualPrintInput): string {
  const sections = [
    { id: "setup", title: "一、管理员上手顺序" },
    { id: "roles", title: "二、谁能做什么" },
    { id: "rhythm", title: "三、日常节奏" },
    { id: "flows", title: "四、数据怎么流动" },
    { id: "pages", title: `五、逐页说明（${PAGE_GUIDES.length} 个页面）` },
    { id: "terms", title: `六、术语表（${TERMINOLOGY.length} 条）` },
    { id: "faq", title: "七、常见问题" },
    { id: "trouble", title: "八、故障排查" }
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(input.companyName)} 财税管理系统操作说明书</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<h1>财税管理系统 操作说明书</h1>
<div class="meta">
  ${esc(input.companyName)} · 系统版本 V15 · 生成于 ${esc(input.generatedAt)}<br>
  本说明书由系统实时生成，与界面上的每页指南读的是同一份数据。
</div>

<h2>目录</h2>
<div class="toc">
  <ol>${sections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join("")}</ol>
</div>

<h2 id="setup">一、管理员上手顺序</h2>
<p><strong>顺序是有意义的</strong>——跳步会让后面的步骤做不了。</p>
${ADMIN_SETUP.map(
  (item) => `<h3>${inline(item.step)}</h3><p>${inline(item.why)}</p>`
).join("")}

<h2 id="roles">二、谁能做什么</h2>
<p>「不能做」那一列比「能做」更重要——多数人查手册是因为某件事做不了，想知道为什么。</p>
${renderTable(
  ["角色", "能做", "不能做"],
  ROLE_MATRIX.map((r) => [r.role, r.scope, r.cannot])
)}
<p>除角色权限外，还有两条<strong>不受角色影响</strong>的硬约束：凭证的复核人 ≠ 过账人、过账人 ≠ 终审人。董事长也绕不过去。</p>

<h2 id="rhythm">三、日常节奏</h2>
${renderTable(["频率", "谁", "做什么"], RHYTHM.map((r) => [r.when, r.who, r.what]))}

<h2 id="flows">四、数据怎么流动</h2>
${DATA_FLOWS.map(
  (flow) =>
    `<h3>${esc(flow.title)}</h3><p>${inline(flow.chain)}</p><p>${inline(flow.note)}</p>`
).join("")}

<div class="page-break"></div>
<h2 id="pages">五、逐页说明（${PAGE_GUIDES.length} 个页面）</h2>
${renderGuides()}

<div class="page-break"></div>
<h2 id="terms">六、术语表（${TERMINOLOGY.length} 条）</h2>
${renderTable(
  ["术语", "白话", "说明"],
  TERMINOLOGY.map((t) => [t.term, t.plain, t.detail ? `${t.brief}。${t.detail}` : t.brief])
)}

<h2 id="faq">七、常见问题</h2>
${renderFaq(FAQ)}

<h2 id="trouble">八、故障排查</h2>
<p>这一节是「结果不对」而不是「用不了」的那类问题。</p>
${renderFaq(TROUBLESHOOTING)}

<button class="print-btn no-print" onclick="window.print()">打印 / 存为 PDF</button>
</body>
</html>`;
}
