/**
 * 科目编码国标化的映射表（V12-D3）。
 *
 * ## 为什么改
 *
 * FT 现用的 `6001c`（主营业务成本）与 `6001`（主营业务收入）**前缀重叠**，
 * `6301e`（管理费用）与 `6301`（营业外收入）同样重叠。于是全仓每一处按前缀
 * 判定科目性质的地方都必须「先排除 6001c / 6301e」——一条**靠人记得**的规则。
 *
 * 漏排一次的后果不是小错：主营业务成本被当成主营业务收入计入收入、管理费用
 * 被当成营业外收入，利润表直接反向。V8-P 修复的错账根因正是这一类。
 *
 * 换成国标编码后 `6401` 与 `6001`、`6602` 与 `6301` 不再有任何前缀关系，
 * 那些「先排除」的特例可以整体删掉。**这才是这次改动的真正收益**——
 * 不是名义上的合规，是消灭一整类陷阱。
 *
 * ## 这张表是唯一的事实来源
 *
 * 迁移、代码替换、护栏测试都读它。散成三份各写一遍，迟早有一份漏掉某一项，
 * 而那一项就是下一次错账。
 */

export interface AccountCodeMapping {
  /** 现用编码。 */
  legacy: string;
  /** 《企业会计准则——应用指南》的会计科目编号。 */
  standard: string;
  name: string;
  /** 为什么要改这一个。 */
  reason: string;
}

/**
 * 需要国标化的编码。
 *
 * ## 存在编码占用链，必须两阶段改写
 *
 * `6001c` 的国标编码是 `6401`，而 FT 已经把 `6401` 用作「财务费用」——
 * 直接改会撞唯一约束。所以 `6401 → 6603`（财务费用的国标编码）必须一起做，
 * 且迁移要先把全部受影响编码挪到临时值再落位（PostgreSQL 的唯一约束默认
 * `NOT DEFERRABLE`，逐行即时检查，同一条 UPDATE 里换不过来）。
 *
 * ## D3 当时刻意不改的两项，D6 已收尾
 *
 * - `6201` 销售费用：国标是 `6601`，但那个编码被「职工薪酬（成本）」占着；
 * - `6601` 职工薪酬（成本）：**国标里没有这样一个损益类科目**（应付职工薪酬是
 *   负债类 2211，生产相关的应进生产成本/制造费用）。D3 的判断是「科目设置本身
 *   存疑，在不清楚它承载什么业务的前提下动它风险太大」。
 *
 * 那件事后来查清了：`6601` 不承载任何业务，零分录零余额，只是「工资借方该挂
 * 哪里」这个判断的占位符。迁移 079 废弃它（借方统一到 `660208` 管理费用-工资），
 * 080 随即把 `6201` 改成 `6601`。**至此无遗留非国标编码。**
 *
 * 详见 docs/v12-d3-account-code-standardization-plan.md 第一节之二与
 * docs/v12-d6-payroll-cost-account-retirement-plan.md。
 */
export const ACCOUNT_CODE_MAPPINGS: readonly AccountCodeMapping[] = [
  {
    legacy: "6001c",
    standard: "6401",
    name: "主营业务成本",
    reason: "与 6001 主营业务收入前缀重叠，每处前缀判定都要先排除它"
  },
  {
    legacy: "6301e",
    standard: "6602",
    name: "管理费用",
    reason: "与 6301 营业外收入前缀重叠，同上"
  },
  // 管理费用的七个明细科目跟着父级走。国标下管理费用是 6602，
  // 明细编码沿用「父级 + 两位序号」的既有约定，只是父级变了。
  { legacy: "6301e01", standard: "660201", name: "管理费用-办公费", reason: "随父级 6301e→6602" },
  { legacy: "6301e02", standard: "660202", name: "管理费用-折旧", reason: "随父级 6301e→6602" },
  { legacy: "6301e03", standard: "660203", name: "管理费用-差旅费", reason: "随父级 6301e→6602" },
  { legacy: "6301e04", standard: "660204", name: "管理费用-业务招待费", reason: "随父级 6301e→6602" },
  { legacy: "6301e05", standard: "660205", name: "管理费用-租金", reason: "随父级 6301e→6602" },
  { legacy: "6301e06", standard: "660206", name: "管理费用-研发费用", reason: "随父级 6301e→6602" },
  { legacy: "6301e07", standard: "660207", name: "管理费用-其他", reason: "随父级 6301e→6602" },
  // ── 占用链：6001c 要用的 6401 被财务费用占着，两者必须一起改 ──
  {
    legacy: "6401",
    standard: "6603",
    name: "财务费用",
    reason: "国标财务费用是 6603；腾出 6401 给主营业务成本"
  },
  { legacy: "6401001", standard: "660301", name: "财务费用-利息支出", reason: "随父级 6401→6603" },
  { legacy: "6401002", standard: "660302", name: "财务费用-手续费", reason: "随父级 6401→6603" },
  {
    legacy: "6101",
    standard: "6403",
    name: "税金及附加",
    reason: "国标税金及附加是 6403；目标编码空闲，顺带做"
  },
  {
    legacy: "3131",
    standard: "4103",
    name: "本年利润",
    reason: "非国标编码；4103 是应用指南规定的本年利润科目号"
  },
  {
    legacy: "3141",
    standard: "4104",
    name: "利润分配",
    reason: "非国标编码；4104 是应用指南规定的利润分配科目号"
  },
  // ── D6（迁移 079 + 080）：6601 腾空后补上 D3 唯一未完成的一项 ──
  //
  // 注意 `6601` 现在也是「两头都在」的编码：它是本项的 standard，同时是被废弃的
  // 「职工薪酬（成本）」的旧码。**不要手工往 RETIRED_CODES 里塞它**——那个判据
  // （在 legacy 里且不在 standard 里）会自动算对：`6201` 判为 retired ✓、
  // `6601` 不判为 retired ✓。手工塞进去会让源码护栏把全部销售费用代码报成待改。
  // D3 在这个判据上已经栽过两次（迁移自检误报 2 处、源码护栏误报 12 个文件）。
  {
    legacy: "6201",
    standard: "6601",
    name: "销售费用",
    reason: "国标销售费用是 6601；D3 时被「职工薪酬（成本）」占着，079 废弃后解锁"
  }
];

const LEGACY_TO_STANDARD = new Map(
  ACCOUNT_CODE_MAPPINGS.map((item) => [item.legacy, item.standard])
);
const STANDARD_TO_LEGACY = new Map(
  ACCOUNT_CODE_MAPPINGS.map((item) => [item.standard, item.legacy])
);

/** 旧编码 → 国标编码；不在映射表里的原样返回。 */
export function toStandardCode(code: string): string {
  return LEGACY_TO_STANDARD.get(code) ?? code;
}

/**
 * 国标编码 → 旧编码。
 *
 * **只供迁移回滚与排查使用**，不供业务代码调用 —— 业务代码一旦开始双向翻译，
 * 就等于回到了「两套编码并存」，而那正是方案里明确否决的路线
 *（见 docs/v12-d3-account-code-standardization-plan.md 第三节）。
 */
export function toLegacyCode(code: string): string {
  return STANDARD_TO_LEGACY.get(code) ?? code;
}

export function isLegacyCode(code: string): boolean {
  return LEGACY_TO_STANDARD.has(code);
}

/** 全部旧编码，供迁移与护栏测试遍历。 */
export const LEGACY_CODES: readonly string[] = ACCOUNT_CODE_MAPPINGS.map((item) => item.legacy);

/** 全部国标编码。 */
export const STANDARD_CODES: readonly string[] = ACCOUNT_CODE_MAPPINGS.map((item) => item.standard);

/**
 * **真正退役**的编码——改完之后不该再出现在任何地方。
 *
 * 这不等于 `LEGACY_CODES`。占用链上的编码两头都在：`6401` 既是财务费用的旧码，
 * 又是主营业务成本的新码。按 `LEGACY_CODES` 判残留，会把正确落位的 `6401` 报成
 * 「没改干净」。
 *
 * 这个坑踩过两次：迁移 070 的零残留自检误报了 2 处，随后本模块的源码护栏又用
 * 同一个错判据把 12 个文件报成待改。所以把判据提炼到这里，让 SQL 侧与 TS 侧
 * 共用同一个概念，而不是各写一遍各错一遍。
 */
export const RETIRED_CODES: readonly string[] = ACCOUNT_CODE_MAPPINGS.filter(
  (item) => !STANDARD_CODES.includes(item.legacy)
).map((item) => item.legacy);

/**
 * 迁移要改写的全部「表.列」。
 *
 * 用 `information_schema` 实测扫出来的，不是凭印象列的。漏掉任何一处都会留下
 * 指向已不存在编码的数据 —— 那种数据不会报错，只会让科目查不到、报表少数据。
 *
 * `accounts.path` 是 ltree，由编码拼成，**必须整棵重建**而不是字符串替换：
 * 替换会在 `6301e01` → `660201` 这类长度变化时破坏 ltree 的层级结构。
 */
export const CODE_BEARING_COLUMNS: readonly { table: string; column: string }[] = [
  { table: "account_templates", column: "code" },
  { table: "account_templates", column: "parent_code" },
  { table: "accounts", column: "code" },
  { table: "accounts", column: "parent_code" },
  { table: "ledger_entries", column: "account_code" },
  { table: "voucher_lines", column: "account_code" },
  { table: "voucher_draft_lines", column: "account_code" },
  { table: "recurring_voucher_lines", column: "account_code" },
  { table: "bank_accounts", column: "account_code" },
  { table: "fixed_assets", column: "asset_account_code" },
  { table: "fixed_assets", column: "accumulated_account_code" },
  { table: "fixed_assets", column: "expense_account_code" }
];
