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
  { code: "1601",    name: "固定资产",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: false },
  { code: "1602",    name: "累计折旧",                  category: "asset",     direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "1701",    name: "无形资产",                  category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "1702",    name: "累计摊销",                  category: "asset",     direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "1801",    name: "长期待摊费用",               category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  // 研发支出
  { code: "1801001", name: "研发支出-费用化支出",         category: "asset",     direction: "debit", level: 3, parentCode: "1801", isLeaf: true  },
  { code: "1801002", name: "研发支出-资本化支出",         category: "asset",     direction: "debit", level: 3, parentCode: "1801", isLeaf: true  },
  // ─── 负债 ───────────────────────────────────────────────
  { code: "2001",    name: "短期借款",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2201",    name: "应付票据",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2202",    name: "应付账款",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2203",    name: "预收账款",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "2211",    name: "应付职工薪酬",               category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: false },
  { code: "22110101",name: "应付职工薪酬-工资",           category: "liability", direction: "credit",level: 3, parentCode: "2211", isLeaf: true  },
  { code: "22110102",name: "应付职工薪酬-社保（单位）",    category: "liability", direction: "credit",level: 3, parentCode: "2211", isLeaf: true  },
  { code: "2221",    name: "应交税费",                  category: "liability", direction: "credit",level: 1, parentCode: null,   isLeaf: false },
  { code: "222101",  name: "应交税费-应交增值税（销项）",  category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222102",  name: "应交税费-应交增值税（进项）",  category: "liability", direction: "debit", level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222103",  name: "应交税费-应交企业所得税",      category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222104",  name: "应交税费-应交个人所得税",      category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222105",  name: "应交税费-应交印花税",          category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
  { code: "222106",  name: "应交税费-城建税及附加",        category: "liability", direction: "credit",level: 2, parentCode: "2221", isLeaf: true  },
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
