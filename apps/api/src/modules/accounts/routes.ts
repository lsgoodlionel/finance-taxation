import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";

export type AccountCategory =
  | "asset"        // 资产
  | "liability"    // 负债
  | "equity"       // 所有者权益
  | "cost"         // 成本
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

const CHART_OF_ACCOUNTS: ChartAccount[] = [
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

export function listAccounts(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const category = url.searchParams.get("category") as AccountCategory | null;
  const q = url.searchParams.get("q")?.toLowerCase() ?? "";
  const leafOnly = url.searchParams.get("leafOnly") === "true";

  let items = CHART_OF_ACCOUNTS;
  if (category) {
    items = items.filter((item) => item.category === category);
  }
  if (q) {
    items = items.filter(
      (item) => item.code.includes(q) || item.name.toLowerCase().includes(q)
    );
  }
  if (leafOnly) {
    items = items.filter((item) => item.isLeaf);
  }
  return json(res, 200, { items, total: items.length });
}

export function getAccountByCode(req: ApiRequest, res: ServerResponse, code: string) {
  const account = CHART_OF_ACCOUNTS.find((item) => item.code === code);
  if (!account) {
    return json(res, 404, { error: "Account not found" });
  }
  return json(res, 200, account);
}
