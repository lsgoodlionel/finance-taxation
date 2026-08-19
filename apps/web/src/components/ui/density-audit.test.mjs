/**
 * **页面密度护栏**（V15）。
 *
 * ## 为什么要量而不是凭感觉
 *
 * 「页面内容太多」是个主观判断，改起来容易变成一页页凭手感调。这条测试把它
 * 变成两个可量的指标：
 *
 * 1. **单张表的列数**——超过阈值就该给核心/全部切换（`useColumnPreset`）
 * 2. **常驻说明块数**——超过阈值就该折叠（`Explain`）
 *
 * ## 列数按「单张表」量，不按文件求和
 *
 * 我第一次量的时候按文件里 `title:` 的总数排序，得出「税率表 20 列、
 * 报销 21 列」——**那个口径是错的**：那些文件里是三四张各 5-7 列的表，
 * 加起来才 20。按它去改会把不宽的表也强行加上切换器。
 *
 * 现在按 `ColumnsType<...> = [` 到匹配的 `];` 之间数，一个数组就是一张表。
 *
 * ## 阈值是判断不是真理
 *
 * 12 列：横向滚动开始出现、一眼看不完的界限。
 * 3 个常驻说明块：再多就把真正的内容推到屏幕下半部分。
 * 例外要登记并说明为什么。
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../pages");

/** 单张表的列数上限。超过就该给核心/全部切换。 */
const MAX_COLUMNS_PER_TABLE = 12;
/** 单个文件里常驻说明块（`<Alert>`）的上限。超过就该折叠。 */
const MAX_STANDING_ALERTS = 3;

/**
 * 例外登记。**每条要说明为什么**，「还没来得及改」不是理由——
 * 那种情况应当直接改，机制（Explain / useColumnPreset）已经就位。
 */
const COLUMN_EXCEPTIONS = new Map();
const ALERT_EXCEPTIONS = new Map([
  [
    "rnd/RndCostWizard.tsx",
    "研发向导：6 个是分步骤出现的 success/warning（合规清单、政策风险、测算结果）," +
      "它们是结论与风险不是说明，折叠等于藏起提示。纯说明的两条已改用 Explain"
  ],
  [
    "tax/VatDeclarationWizard.tsx",
    "增值税向导：同上，剩下的是分步骤的申报状态与风险提示。纯说明的两条已改用 Explain"
  ],
  [
    "contracts/ContractCloseWizard.tsx",
    "合同关闭向导：剩下的是「终止不可撤销」这类确认提示，藏起来正是不该藏的那种"
  ],
  [
    "settings/IntegrationSettingsTab.tsx",
    "外部对接：每个服务商一条配置指引，它们互斥出现（选哪个显示哪条），不是同屏叠加"
  ],
  [
    "cost/CostCarryoverPage.tsx",
    "成本结转：5 条**全是结论与风险**——加载失败、有批次没结转、试算失败、" +
      "平衡校验结果、已结转过。没有一条是纯说明（那两条已改用 Explain）。" +
      "把「分配结果与投入对不上」折起来正是不该折的那种"
  ],
  [
    "reports/panels/TrialBalancePanel.tsx",
    "试算平衡表：4 条全是结论——加载失败、三组合计是否平衡、后端给的告警。" +
      "这张表的全部意义就是把不平衡摆出来，藏起来等于这张表白做"
  ],
  [
    "invoices/InvoiceEntryModals.tsx",
    "发票录入弹窗：四条分别属于四个互斥的录入方式（手工/OCR/导入/验真），不同屏"
  ]
]);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

/** 数一个 `ColumnsType<...> = [ ... ]` 数组里有几列。 */
function countColumnsInArrays(source) {
  const counts = [];
  const pattern = /ColumnsType<[^>]*>\s*=\s*\[/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    let columns = 0;
    let depthAtTop = depth;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === "[" || char === "{") depth += 1;
      else if (char === "]" || char === "}") depth -= 1;
      else if (source.startsWith("title:", index) && depth === depthAtTop + 1) columns += 1;
      index += 1;
    }
    counts.push(columns);
  }
  return counts;
}

const files = await walk(pagesRoot);
const wideTables = [];
const noisyPages = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const relative = file.slice(pagesRoot.length + 1);

  const widest = Math.max(0, ...countColumnsInArrays(source));
  if (widest > MAX_COLUMNS_PER_TABLE && !COLUMN_EXCEPTIONS.has(relative)) {
    // 已经用了列预设的不算超标——它有切换器，默认显示的是核心列。
    if (!source.includes("useColumnPreset")) {
      wideTables.push(`${relative}（单表 ${widest} 列）`);
    }
  }

  const alerts = (source.match(/<Alert/g) ?? []).length;
  if (alerts > MAX_STANDING_ALERTS && !ALERT_EXCEPTIONS.has(relative)) {
    noisyPages.push(`${relative}（${alerts} 个常驻说明块）`);
  }
}

assert(
  wideTables.length === 0,
  `这些表超过 ${MAX_COLUMNS_PER_TABLE} 列且没有核心/全部切换：\n  ` +
    wideTables.join("\n  ") +
    "\n用 useColumnPreset 给它一个核心列名单，或登记到 COLUMN_EXCEPTIONS 并说明为什么。"
);

assert(
  noisyPages.length === 0,
  `这些页面的常驻说明块超过 ${MAX_STANDING_ALERTS} 个：\n  ` +
    noisyPages.join("\n  ") +
    "\n纯说明改用 Explain 折叠（内容不删，只是不占位置）；" +
    "结论与风险类的 Alert 应当保持常驻，那种情况登记到 ALERT_EXCEPTIONS。"
);

// 例外清单不能有过期条目——过期的清单读起来还像回事，那比没有清单更误导。
for (const relative of ALERT_EXCEPTIONS.keys()) {
  const full = join(pagesRoot, relative);
  const source = await readFile(full, "utf8").catch(() => null);
  assert(source !== null, `ALERT_EXCEPTIONS 里的 ${relative} 已不存在`);
  const alerts = (source.match(/<Alert/g) ?? []).length;
  assert(
    alerts > MAX_STANDING_ALERTS,
    `${relative} 的说明块已降到 ${alerts} 个，请从 ALERT_EXCEPTIONS 里删掉`
  );
}

console.log("density-audit passed");
