import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TERMINOLOGY } from "./terminology.ts";

/**
 * V8 D5 术语强制层：把「高频术语必须挂 <Term> 释义」从抽样变成防回退约束。
 *
 * 背景：V7 蓝图声称术语 hover 释义覆盖 100%，实测 <Term> 仅 24 处 / 7 个文件，
 * 而术语字面量在 pages/components 中出现数百次，真实覆盖率不足 7%。
 *
 * 机制：扫描 pages/** 与 components/** 的 JSX 文本节点，若文件里出现术语字典中的
 * 专业原词，却全文都没有对应 key 的 <Term>，则视为该文件未覆盖该术语。
 * 存量违规按「文件级白名单」放行，白名单之外的任何新违规（新文件 / 老文件引入
 * 新术语）立即失败。
 *
 * 粒度选择：按「文件 × 术语」而非「每一次出现」。同一段文案里把同一个词重复挂
 * 三次释义，在 guided 模式下会变成「账目分类（科目）…账目分类（科目）」的噪音，
 * 反而促使团队关掉这条规则。只要页面对每个黑话至少给出一处释义即达成目标。
 *
 * 误报规避（宁可漏报也不误报）：
 * 1) 先剥离块注释与行注释（保留 https:// 这类非注释双斜杠）；
 * 2) 再剥离模板字符串——导出用的 HTML 字符串模板里同样有 >文字< 结构，
 *    但它不是 JSX，无法挂 <Term>；
 * 3) 再剥离 <Term ...>...</Term> 与 <Term ... /> 整块——已治理的部分不该复报；
 * 4) 再剥离 <button>/<Button> 的标签文本——Term 触发器本身是 tabIndex=0 +
 *    role="button" 的可聚焦元素，嵌进按钮里会构成 nested interactive，
 *    比缺一条释义更糟，因此按钮文案按设计不纳入强制范围；
 * 5) 只在「JSX 文本节点」中匹配，即 `>`/`}` 与 `<`/`{` 之间、且不含大括号与各类
 *    引号的片段。属性值（title="过账"）、普通字符串常量
 *    （message.success("过账成功")）因含引号被排除——它们本来也承载不了组件。
 *
 * 说明：本文件用 .mjs 而非 .ts，是因为 apps/web 的 tsconfig 只声明 vite/client
 * 类型、不含 @types/node，而本测试必须读文件系统。仓库已有同类先例
 * （pages/drilldown.test.mjs 等），同样由 tools/v4/run-web-tests.mjs 收集执行。
 */

const WEB_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["pages", "components"];

/**
 * 存量违规文件白名单（file-level）。
 *
 * 规则：逐页消化后必须从此表移除；新增文件一律不得入表。
 * 若某文件已治理干净却仍留在表里，本测试同样会失败，保证白名单只减不增。
 * 行末注释记录当前仍缺释义的术语，便于认领与排期。
 */
const LEGACY_UNCOVERED_FILES = [
  "pages/RiskPage.tsx", // 凭证、勾稽
  "pages/contracts/ContractDrawer.tsx", // 勾稽、凭证
  "pages/documents/DocumentAttachments.tsx", // 凭证
  "pages/documents/DocumentFormalView.tsx", // 凭证
  "pages/documents/DocumentRelationsPanel.tsx", // 凭证
  "pages/inbox/InboxAiDraftItem.tsx", // 借贷平衡、凭证
  "pages/inbox/InboxAiDraftsCard.tsx", // 分录
  "pages/reports/ReportsSidebar.tsx", // 资产负债表
  "pages/reports/panels/BudgetVariancePanel.tsx", // 科目
  "pages/risk/RiskWorkbenchHeader.tsx", // 勾稽
  "pages/risk/TaxConsistencyPanel.tsx", // 票税一致性
  "pages/rnd/RndCostWizard.tsx", // 研发费用归集
  "pages/settings/CompanyTab.tsx", // 过账、凭证
  "pages/vouchers/BalanceIndicator.tsx", // 借方、贷方
  "pages/vouchers/BatchBar.tsx", // 凭证
  "pages/vouchers/VoucherCreateModal.tsx", // 凭证
  "pages/vouchers/VoucherDetailPanel.tsx", // 凭证、过账
  "pages/vouchers/useVoucherBatch.tsx" // 过账、总账
];

/** 白名单预算：只减不增。想放宽必须同时改大这个数字，让扩容在代码评审里显形。 */
const LEGACY_BUDGET = 18;

/** JSX 文本节点：`>`/`}` 与 `<`/`{` 之间，且不含大括号、引号、反引号的片段。 */
const JSX_TEXT_PATTERN = /[>}]([^<>{}"'`]*)[<{]/g;
const HAN_PATTERN = /[一-鿿]/;
/** 文件中已挂载的 <Term k="..."> key 集合。 */
const TERM_KEY_PATTERN = /<Term\b[^>]*\bk="([^"]+)"/g;

function collectSourceFiles(directory, collected = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(entryPath, collected);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      collected.push(entryPath);
    }
  }
  return collected;
}

/** 剥离注释、模板字符串、已治理的 <Term> 块与按钮标签，只留下可判定的 JSX 文本。 */
function stripNonJsxText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, " ")
    .replace(/<Term\b[^>]*\/>/g, " ")
    .replace(/<Term\b[^>]*>[\s\S]*?<\/Term>/g, " ")
    .replace(/<(button|Button)\b[^>]*>[\s\S]*?<\/\1>/g, " ");
}

function collectMountedTermKeys(source) {
  return new Set([...source.matchAll(TERM_KEY_PATTERN)].map((match) => match[1]));
}

/** 返回该文件中「出现了原词但全文没有对应 <Term>」的术语列表。 */
export function findUncoveredTerms(source) {
  const mountedKeys = collectMountedTermKeys(source);
  const cleaned = stripNonJsxText(source);
  const uncovered = new Set();

  for (const match of cleaned.matchAll(JSX_TEXT_PATTERN)) {
    const text = match[1] ?? "";
    if (!HAN_PATTERN.test(text)) {
      continue;
    }
    for (const entry of TERMINOLOGY) {
      if (text.includes(entry.term) && !mountedKeys.has(entry.key)) {
        uncovered.add(entry.term);
      }
    }
  }

  return [...uncovered];
}

function toRelativePath(absolutePath) {
  return absolutePath.slice(WEB_SRC.length + 1).split(sep).join("/");
}

function scanViolations() {
  const violations = new Map();
  for (const dir of SCAN_DIRS) {
    for (const file of collectSourceFiles(join(WEB_SRC, dir))) {
      const uncovered = findUncoveredTerms(readFileSync(file, "utf8"));
      if (uncovered.length > 0) {
        violations.set(toRelativePath(file), uncovered);
      }
    }
  }
  return violations;
}

const violations = scanViolations();

test("术语强制：白名单之外不得出现未挂释义的高频术语", () => {
  const allowed = new Set(LEGACY_UNCOVERED_FILES);
  const newViolations = [...violations.entries()].filter(([file]) => !allowed.has(file));

  assert.deepEqual(
    newViolations.map(([file, terms]) => `${file} → ${terms.join("、")}`),
    [],
    "请用 <Term k=\"...\"> 包裹这些术语（key 见 lib/terminology.ts）；白名单只接受存量文件，不接受新增条目。"
  );
});

test("术语强制：白名单只减不增", () => {
  const stale = LEGACY_UNCOVERED_FILES.filter(
    (file) => !existsSync(join(WEB_SRC, file)) || !violations.has(file)
  );

  assert.deepEqual(stale, [], "以下文件已治理干净或已不存在，请从 LEGACY_UNCOVERED_FILES 移除");
  assert.ok(
    LEGACY_UNCOVERED_FILES.length <= LEGACY_BUDGET,
    `术语存量白名单只能收缩：当前 ${LEGACY_UNCOVERED_FILES.length} > 预算 ${LEGACY_BUDGET}`
  );
  assert.equal(
    new Set(LEGACY_UNCOVERED_FILES).size,
    LEGACY_UNCOVERED_FILES.length,
    "LEGACY_UNCOVERED_FILES 不应有重复路径"
  );
});

test("术语强制：扫描面覆盖真实页面目录", () => {
  const scanned = SCAN_DIRS.flatMap((dir) => collectSourceFiles(join(WEB_SRC, dir)));
  assert.ok(scanned.length > 100, `扫描面异常收缩，仅 ${scanned.length} 个文件`);
});

// ── 检测器自检：防止规则被悄悄改成永远通过，或退化成噪音源 ──────────────────
test("检测器自检：裸术语被检出、已挂释义与非 JSX 文本不误报", () => {
  const probe = (body) => findUncoveredTerms(body).sort();

  assert.deepEqual(probe("const A = () => <p>本月账目已完成。</p>;"), [], "无术语文本不应违规");
  assert.deepEqual(
    probe("const A = () => <p>本月凭证已全部过账。</p>;"),
    ["凭证", "过账"].sort(),
    "裸术语必须被检出"
  );
  assert.deepEqual(
    probe('const A = () => <p>本月<Term k="voucher">凭证</Term>已全部<Term k="posting">过账</Term>。</p>;'),
    [],
    "已挂 <Term> 的术语不应复报"
  );
  assert.deepEqual(
    probe('const tip = { title: "过账成功", note: "凭证已入账" };'),
    [],
    "普通字符串常量不应误报"
  );
  assert.deepEqual(
    probe("const html = `<div>过账凭证清单</div>`;"),
    [],
    "HTML 字符串模板不应误报"
  );
  assert.deepEqual(
    probe("const A = () => <p>{/* 过账说明 */}结果已生成。</p>;"),
    [],
    "注释不应误报"
  );
  assert.deepEqual(
    probe("const A = () => <Button>查看凭证</Button>;"),
    [],
    "按钮文案按设计不纳入强制范围"
  );
  assert.deepEqual(
    probe("const A = () => <p>当前分录数：{count}</p>;"),
    ["分录"],
    "紧跟 {表达式} 的 JSX 文本同样要被检出"
  );
  assert.deepEqual(
    probe('const A = () => <div><p>本月<Term k="posting">过账</Term>完成。</p><p>过账后不可直接修改。</p></div>;'),
    [],
    "同一术语在文件内挂过一次即视为已覆盖"
  );
  assert.deepEqual(
    probe('const A = () => <div><p>本月<Term k="posting">过账</Term>完成。</p><p>请复核分录。</p></div>;'),
    ["分录"],
    "覆盖了某术语不应豁免同文件其它未覆盖术语"
  );
});
