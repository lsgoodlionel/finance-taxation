/**
 * 科目主数据（会计科目表）——全系统科目分类的唯一权威来源。
 *
 * 此前这份常量与 HTTP 路由处理函数同住在 accounts/routes.ts，报表模块无法在不
 * 拖入路由依赖的前提下复用它，于是各自平行维护了一套「前缀表」判定科目性质，
 * 结果是同一个科目在利润表与资产负债表上被归入不同类别（V8-P 修复的错账根因）。
 * 现在把纯数据与查询函数抽到本模块，routes.ts 只保留 HTTP 处理并原样再导出，
 * 报表侧直接以 `category` 字段为准。
 *
 * 注意本系统的编码约定与国标存在偏差，改动前务必先读懂：
 * - 管理费用用 `6301e` 系列（`6301e01`…`6301e06`），与营业外收入 `6301` 前缀重叠；
 * - 主营业务成本用 `6001c`，与主营业务收入 `6001` 前缀重叠；
 * - 因此凡是按前缀判定的地方，`6001c` / `6301e` 必须先于 `6001` / `6301` 排除。
 */

export type AccountCategory =
  | "asset"        // 资产
  | "liability"    // 负债
  | "equity"       // 所有者权益
  | "cost"         // 成本（生产成本/制造费用，需结转后才进损益）
  | "revenue"      // 收入
  | "expense";     // 费用

export type AccountDirection = "debit" | "credit";

export interface ChartAccount {
  code: string;
  name: string;
  category: AccountCategory;
  direction: AccountDirection;
  level: 1 | 2 | 3;
  parentCode: string | null;
  isLeaf: boolean;
}

export const CHART_OF_ACCOUNTS: ChartAccount[] = [
  // ─── 资产 ───────────────────────────────────────────────
  { code: "1001",    name: "库存现金",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1002",    name: "银行存款",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1012",    name: "其他货币资金",               category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1121",    name: "应收票据",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1122",    name: "应收账款",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1123",    name: "预付账款",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1131",    name: "应收利息",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1221",    name: "其他应收款",                 category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1401",    name: "原材料",                    category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1403",    name: "库存商品",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  // 1601 曾被标为 isLeaf: false，但科目表里没有任何 parentCode === "1601" 的子科目，
  // 于是「固定资产」既不能在科目选择器里被选中（accounts/routes.ts 只列叶子），
  // 也让固定资产采购凭证挂到一个不可记账的科目上。累计折旧 1602 是平级科目而非子科目，
  // 因此 1601 本身就是叶子。
  { code: "1601",    name: "固定资产",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1602",    name: "累计折旧",                  category: "asset",     direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "1701",    name: "无形资产",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1702",    name: "累计摊销",                  category: "asset",     direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "1801",    name: "长期待摊费用",               category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  // 研发支出。这两个科目此前挂在 1801「长期待摊费用」名下，但它们并不是长期待摊
  // 费用的明细（名称、用途都不同），而 1801 自身又标着 isLeaf: true——一个叶子科目
  // 带着子科目，树形展示与「叶子才可记账」的规则同时被破坏。改为独立一级科目。
  { code: "1801001", name: "研发支出-费用化支出",         category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1801002", name: "研发支出-资本化支出",         category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  // ─── 负债 ───────────────────────────────────────────────
  { code: "2001",    name: "短期借款",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2201",    name: "应付票据",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2202",    name: "应付账款",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2203",    name: "预收账款",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2211",    name: "应付职工薪酬",               category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: false },
  { code: "22110101",name: "应付职工薪酬-工资",           category: "liability", direction: "credit",level: 3, parentCode: "2211", isLeaf: true  },
  { code: "22110102",name: "应付职工薪酬-社保（单位）",    category: "liability", direction: "credit",level: 3, parentCode: "2211", isLeaf: true  },
  { code: "22110103",name: "应付职工薪酬-公积金（单位）",   category: "liability", direction: "credit",level: 3, parentCode: "2211", isLeaf: true  },
  { code: "2221",    name: "应交税费",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: false },
  { code: "222101",  name: "应交税费-应交增值税（销项）",  category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222102",  name: "应交税费-应交增值税（进项）",  category: "liability", direction: "debit", level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222103",  name: "应交税费-应交企业所得税",      category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222104",  name: "应交税费-应交个人所得税",      category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222105",  name: "应交税费-应交印花税",          category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222106",  name: "应交税费-城建税及附加",        category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  // 增值税专栏与二级明细（迁移 060）。这份常量是「已登记科目」的第二真相源
  // （account-code-guard.test.ts 用它做静态守卫），与 account_templates 表必须同步，
  // 否则守卫会把真实存在的科目判成未登记。
  { code: "222107",  name: "应交税费-应交增值税（进项税额转出）", category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222108",  name: "应交税费-应交增值税（已交税金）",     category: "liability", direction: "debit", level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222109",  name: "应交税费-应交增值税（转出未交增值税）", category: "liability", direction: "debit", level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222110",  name: "应交税费-应交增值税（转出多交增值税）", category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222111",  name: "应交税费-未交增值税",              category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222112",  name: "应交税费-预交增值税",              category: "liability", direction: "debit", level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222113",  name: "应交税费-待认证进项税额",           category: "liability", direction: "debit", level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222114",  name: "应交税费-待抵扣进项税额",           category: "liability", direction: "debit", level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222115",  name: "应交税费-简易计税",                category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "2231",    name: "应付利息",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2241",    name: "其他应付款",                 category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2401",    name: "长期借款",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  // ─── 所有者权益 ─────────────────────────────────────────
  { code: "3001",    name: "实收资本",                  category: "equity",    direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "3002",    name: "资本公积",                  category: "equity",    direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "3101",    name: "盈余公积",                  category: "equity",    direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "3131",    name: "本年利润",                  category: "equity",    direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "3141",    name: "利润分配",                  category: "equity",    direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  // ─── 成本 ───────────────────────────────────────────────
  { code: "4001",    name: "生产成本",                  category: "cost",      direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "4101",    name: "制造费用",                  category: "cost",      direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  // ─── 收入 ───────────────────────────────────────────────
  { code: "6001",    name: "主营业务收入",               category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "6051",    name: "其他业务收入",               category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "6111",    name: "投资收益",                  category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "6301",    name: "营业外收入",                 category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  // ─── 费用 ───────────────────────────────────────────────
  { code: "6001c",   name: "主营业务成本",               category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "6101",    name: "税金及附加",                 category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "6201",    name: "销售费用",                  category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "6301e",   name: "管理费用",                  category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: false },
  { code: "6301e01", name: "管理费用-工资",              category: "expense",   direction: "debit", level: 2, parentCode: "6301e",isLeaf: true  },
  { code: "6301e02", name: "管理费用-折旧",              category: "expense",   direction: "debit", level: 2, parentCode: "6301e",isLeaf: true  },
  { code: "6301e03", name: "管理费用-办公费",            category: "expense",   direction: "debit", level: 2, parentCode: "6301e",isLeaf: true  },
  { code: "6301e04", name: "管理费用-差旅费",            category: "expense",   direction: "debit", level: 2, parentCode: "6301e",isLeaf: true  },
  { code: "6301e05", name: "管理费用-业务招待费",         category: "expense",   direction: "debit", level: 2, parentCode: "6301e",isLeaf: true  },
  { code: "6301e06", name: "管理费用-研发费用",           category: "expense",   direction: "debit", level: 2, parentCode: "6301e",isLeaf: true  },
  // 6301e 本身是非叶子，凭证不能挂上去。通用「管理费用」场景（费用报销模板、进项
  // 发票入账、无法归类的采购报销）此前落在表外科目 6602，现统一落到本明细科目。
  { code: "6301e07", name: "管理费用-其他",              category: "expense",   direction: "debit", level: 2, parentCode: "6301e",isLeaf: true  },
  { code: "6401",    name: "财务费用",                  category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: false },
  { code: "6401001", name: "财务费用-利息支出",          category: "expense",   direction: "debit", level: 2, parentCode: "6401", isLeaf: true  },
  { code: "6401002", name: "财务费用-手续费",            category: "expense",   direction: "debit", level: 2, parentCode: "6401", isLeaf: true  },
  { code: "6601",    name: "职工薪酬（成本）",           category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "6711",    name: "营业外支出",                 category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "6801",    name: "所得税费用",                 category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  }
];

const ACCOUNT_BY_CODE: ReadonlyMap<string, ChartAccount> = new Map(
  CHART_OF_ACCOUNTS.map((account) => [account.code, account])
);

/** 按科目代码精确查找主数据；未登记的科目返回 undefined（由调用方决定兜底口径）。 */
export function findChartAccount(code: string): ChartAccount | undefined {
  return ACCOUNT_BY_CODE.get(code);
}
