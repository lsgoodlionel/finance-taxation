/**
 * 科目主数据（会计科目表）——全系统科目分类的唯一权威来源。
 *
 * 此前这份常量与 HTTP 路由处理函数同住在 accounts/routes.ts，报表模块无法在不
 * 拖入路由依赖的前提下复用它，于是各自平行维护了一套「前缀表」判定科目性质，
 * 结果是同一个科目在利润表与资产负债表上被归入不同类别（V8-P 修复的错账根因）。
 * 现在把纯数据与查询函数抽到本模块，routes.ts 只保留 HTTP 处理并原样再导出，
 * 报表侧直接以 `category` 字段为准。
 *
 * ## 编码已国标化（V12-D3，迁移 070）
 *
 * 这里曾有一段警告：管理费用用 `6301e` 系列、主营业务成本用 `6001c`，两者分别与
 * 营业外收入 `6301`、主营业务收入 `6001` **前缀重叠**，所以凡是按前缀判定的地方
 * 都必须先把它们排除掉。那是一条靠人记得的规则，漏排一次就是利润表反向。
 *
 * 现在编码按《企业会计准则——应用指南》改成了 `6602` / `6401`，与收入编码再无
 * 前缀关系，那些「先排除」的分支已全部删除（见 reports/profit-accounts.ts、
 * tax-integration/consistency.routes.ts、ai-agents/anomaly/anomaly.routes.ts）。
 *
 * 仍未国标化的一处：`6201` 销售费用。它的国标编码 `6601` 被本系统的「职工薪酬
 * （成本）」占着。`6201` 不与任何编码冲突、不产生前缀陷阱，留着的代价仅是名义上
 * 不合规。
 *
 * ## `6601 职工薪酬（成本）` 已查清：待废弃，不要保留（D6）
 *
 * D3 当时把它标为「科目设置存疑、需独立立项」。**已经查过了，不必再查**：
 * 它不对应任何会计科目，是「工资计提的借方该挂哪里」这个判断的占位符。
 * 职工薪酬的贷方（`22110101`）本来就是对的，错的只有借方。
 *
 * 三条判据：真正的工资链路（`payroll/social-security-vouchers.ts`）从不用它；
 * 它 `name` 写「（成本）」而 `category` 是 `expense`，码名语义三者不一致；
 * 库里 `ledger_entries` / `voucher_lines` 等 8 个列的行数**全为 0**，唯一一条
 * 历史分录早在迁移 041 就被改到了 `6201`。
 *
 * 处置方案见 docs/v12-d6-payroll-cost-account-retirement-plan.md。它曾被残留 11
 *（管理费用明细名称错位）阻塞——方案要把工资改挂 `660201`，而那个编码在
 * `accounts` 表里叫「办公费」。**迁移 077 已解除阻塞**：名称按库改齐，并新增了
 * `660208` 管理费用-工资，D6 的借方落点现在是明确的。
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
  // 固定资产处置的过渡科目。处置完成后余额应结平，长期挂账说明有资产处置没走完流程。
  { code: "1606",    name: "固定资产清理",               category: "asset",     direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
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
  { code: "4103",    name: "本年利润",                  category: "equity",    direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "4104",    name: "利润分配",                  category: "equity",    direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  // ─── 成本 ───────────────────────────────────────────────
  { code: "4001",    name: "生产成本",                  category: "cost",      direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "4101",    name: "制造费用",                  category: "cost",      direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  // ─── 收入 ───────────────────────────────────────────────
  { code: "6001",    name: "主营业务收入",               category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "6051",    name: "其他业务收入",               category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "6111",    name: "投资收益",                  category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  // 6115 归 revenue 而非 expense：准则把「资产处置收益」列在营业利润的加项，
  // 与投资收益并列，损失时在同一行以负数列示。归成 expense 会让处置收益变成
  // 负费用——营业利润仍对，但利润表「资产处置收益」这一行永远是 0。
  // 它不进 REVENUE_ACCOUNT_PREFIXES：那份前缀表是「营业收入」口径。
  { code: "6115",    name: "资产处置损益",               category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  { code: "6301",    name: "营业外收入",                 category: "revenue",   direction: "credit",level: 1, parentCode: null,   isLeaf: true  },
  // ─── 费用 ───────────────────────────────────────────────
  { code: "6401",   name: "主营业务成本",               category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "6403",    name: "税金及附加",                 category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "6201",    name: "销售费用",                  category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: true  },
  { code: "6602",   name: "管理费用",                  category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: false },
  // 这七个明细的名称此前与 `account_templates` **整体错开一位**：常量表把 660201
  // 写成「工资」，办公费/差旅费/业务招待费顺次后移一格，库里的「租金」在常量表里
  // 根本不存在。041 的映射注释与这份常量一致，049 落库时写的却是另一套，两份在
  // 同一个月分头写成、谁也没对过谁；070 只换编码前缀不动名称，错位就原样保留。
  //
  // 后果是税务上的：差旅费按常量挂 660204，而库里 660204 是业务招待费——后者只能
  // 按 60% 扣除且不超营业收入 5‰，前者可全额扣除，记错让企业多缴税。
  //
  // 现已按库改齐（迁移 077）。**库是科目名称的事实来源**，这份常量跟随它，
  // 由 chart-parity.integration.test.ts 的名称比对守住。
  { code: "660201", name: "管理费用-办公费",            category: "expense",   direction: "debit", level: 2, parentCode: "6602",isLeaf: true  },
  { code: "660202", name: "管理费用-折旧",              category: "expense",   direction: "debit", level: 2, parentCode: "6602",isLeaf: true  },
  { code: "660203", name: "管理费用-差旅费",            category: "expense",   direction: "debit", level: 2, parentCode: "6602",isLeaf: true  },
  { code: "660204", name: "管理费用-业务招待费",         category: "expense",   direction: "debit", level: 2, parentCode: "6602",isLeaf: true  },
  { code: "660205", name: "管理费用-租金",              category: "expense",   direction: "debit", level: 2, parentCode: "6602",isLeaf: true  },
  { code: "660206", name: "管理费用-研发费用",           category: "expense",   direction: "debit", level: 2, parentCode: "6602",isLeaf: true  },
  // 6301e 本身是非叶子，凭证不能挂上去。通用「管理费用」场景（费用报销模板、进项
  // 发票入账、无法归类的采购报销）此前落在表外科目 6602，现统一落到本明细科目。
  { code: "660207", name: "管理费用-其他",              category: "expense",   direction: "debit", level: 2, parentCode: "6602",isLeaf: true  },
  // 迁移 077 新增。单位承担的社保与公积金此前挂 660201 并写名称「管理费用-工资」——
  // 挂错了科目（660201 是办公费），且那个名称在库里根本不存在。不并入 660207
  // 「其他」是因为研发费用加计扣除要按人工费用归集，混进杂项后只能靠摘要去拆。
  { code: "660208", name: "管理费用-工资",              category: "expense",   direction: "debit", level: 2, parentCode: "6602",isLeaf: true  },
  { code: "6603",    name: "财务费用",                  category: "expense",   direction: "debit", level: 1, parentCode: null,   isLeaf: false },
  { code: "660301", name: "财务费用-利息支出",          category: "expense",   direction: "debit", level: 2, parentCode: "6603", isLeaf: true  },
  { code: "660302", name: "财务费用-手续费",            category: "expense",   direction: "debit", level: 2, parentCode: "6603", isLeaf: true  },
  // V12-D5：期末调汇的对手方。借贷两个方向都会走——外币升值时资产类调汇产生
  // 收益（贷方），贬值时产生损失（借方）。direction 标 debit 是「余额通常在哪一方」
  // 的惯例，不表示它只走借方。
  { code: "660303", name: "财务费用-汇兑损益",          category: "expense",   direction: "debit", level: 2, parentCode: "6603", isLeaf: true  },
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
