/**
 * 资产负债表的科目归类口径（V12-A5 / 蓝图 E4）。
 *
 * ## 修的是什么
 *
 * `buildBalanceSheetReport` 此前按首位数字分类，**只处理 `1`/`2`/`3` 开头**：
 *
 * ```ts
 * if (hasPrefix(code, ["1"]))      { ... 资产 }
 * else if (hasPrefix(code, ["2"])) { ... 负债 }
 * else if (hasPrefix(code, ["3"])) { ... 权益 }
 * // 没有 else —— 4 开头既不进资产也不进负债权益，被静默丢弃
 * ```
 *
 * 生产成本 `4001` / 制造费用 `4101` 因此从资产负债表上凭空消失。用这两个科目
 * 记账的制造业客户，**资产负债表直接不平**（借方挂了成本，贷方的应付/银行存款
 * 却照常入表）。
 *
 * ## 为什么把成本类归入资产，而不是丢进「未分类」
 *
 * 生产成本 / 制造费用的期末余额，会计含义就是**在产品**，属于存货，本就是资产。
 * 《企业会计准则》资产负债表「存货」项目的填列口径包含生产成本科目余额。所以这
 * 不是权宜之计，而是本来就该这么归——把一个类别明确的科目丢进「未分类」只会制造
 * 噪音，让真正需要人工介入的未知科目淹没在里面。
 *
 * **注意：这里不做成本结转**（4001/4101 → 6001c 主营业务成本）。结转需要产量与
 * 在产品数据，超出财税平台的范畴，蓝图「明确不引入清单」里已排除。本模块只保证
 * 未结转的成本余额以资产形态如实出现在表上，不再凭空蒸发。
 *
 * ## 防呆：任何科目都不会被静默丢弃
 *
 * `classifyBalanceSheetAccount` 是**全函数**——对任意字符串都返回一个明确的
 * section，没有「掉到 else 外面」的可能。真正无法归类的走 `unclassified`，由
 * 报表显式列出并告警，而不是悄悄消失。
 *
 * 这条不变式比上面那个 4001 的修复更重要：它防止将来新增科目段位（5xxx 成本类、
 * 7xxx、8xxx 或国标化迁移后的编码）时重蹈覆辙。对应断言见 balance-sheet-accounts.test.ts
 * 与 summary.test.ts。
 */

import type { AccountCategory } from "../accounts/chart-of-accounts.js";
import { findChartAccount } from "../accounts/chart-of-accounts.js";

/**
 * 科目在资产负债表上的去向。
 *
 * `profitAndLoss` 表示**已被显式处理但不单独成行**：损益类科目的净额经
 * `summarizeProfitTotals` 汇总后并入权益的「本年利润」3131 行，再单列一次就是
 * 重复计量。它与 `unclassified` 的区别是——前者是有意为之，后者需要人工介入。
 */
export type BalanceSheetSection =
  | "asset"
  | "liability"
  | "equity"
  | "profitAndLoss"
  | "unclassified";

/** 科目主数据 category → 资产负债表去向。 */
function fromAccountCategory(category: AccountCategory): BalanceSheetSection {
  switch (category) {
    case "asset":
      return "asset";
    case "liability":
      return "liability";
    case "equity":
      return "equity";
    // 生产成本 4001 / 制造费用 4101：期末余额即在产品，属于存货 → 资产。
    case "cost":
      return "asset";
    case "revenue":
    case "expense":
      return "profitAndLoss";
    default: {
      // 穷尽性检查：AccountCategory 新增取值时这里会直接编译失败，
      // 而不是在运行时静默落到 unclassified。
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}

/**
 * 科目表未登记时的编码段兜底。
 *
 * ## 4xxx 段混住了两类科目，顺序不能调换
 *
 * 本系统的成本类沿用旧《企业会计制度》编码（4001 生产成本、4101 制造费用），
 * 而 V12-D3 把本年利润改成了国标的 `4103`、利润分配改成 `4104`——两者都是
 * **所有者权益类**。于是 4xxx 段里同时住着成本类与权益类，纯 `["4", "asset"]`
 * 会把本年利润判成资产。
 *
 * 所以 `4103` / `4104` 必须排在 `4` 之前。这是一条顺序敏感的规则，正是 D3 想
 * 消灭的那类东西——但它只在**兜底路径**上生效（科目表登记了的科目走不到这里，
 * 而 4103/4104 都是模板科目），真正的修法是把成本类改成国标的 5001 / 5101，
 * 已记入 D3 方案文档第九节。
 *
 * 顺带更正：D3 当时 grep `startsWith("4")` 与 `like '4%'` 确认「全仓没有按 4
 * 前缀判定科目性质的代码」，漏了这张表——它是数据驱动的，两个 grep 都命不中。
 */
const CODE_PREFIX_SECTIONS: ReadonlyArray<readonly [string, BalanceSheetSection]> = [
  ["1", "asset"],
  ["2", "liability"],
  ["3", "equity"],
  ["4103", "equity"],
  ["4104", "equity"],
  ["4", "asset"],
  ["6", "profitAndLoss"]
];

/**
 * 把任意科目代码归入资产负债表的某一去向。**永不返回 undefined。**
 *
 * 优先级：调用方传入的 `category`（来自 `accounts` 表）> 硬编码科目表 > 编码段
 * 兜底 > `unclassified`。
 *
 * 第一档是 V12 残留 7 加的事实来源：分录经 `listCompanyLedgerEntries` 取出时已随
 * 行带上 `accountCategory`。第二档降级为兜底——`chart-parity` 护栏保证它与库不
 * 漂移，不一致时以库为准，因为库才是用户能改的那份。
 *
 * 前两档都优先于前缀判定，是因为编码段与会计性质并非一一对应（4xxx 段同时住着
 * 成本类与权益类，见 CODE_PREFIX_SECTIONS 的说明）。
 */
export function classifyBalanceSheetAccount(
  code: string,
  category?: AccountCategory | null
): BalanceSheetSection {
  if (category) return fromAccountCategory(category);

  const account = findChartAccount(code);
  if (account) return fromAccountCategory(account.category);

  for (const [prefix, section] of CODE_PREFIX_SECTIONS) {
    if (code.startsWith(prefix)) return section;
  }

  return "unclassified";
}
