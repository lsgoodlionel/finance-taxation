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
 * **只列三类冲突项**，不动 `1002`、`2202`、`6001` 等本就合规的编码 ——
 * 动得越多回归面越大，而它们没有任何问题。
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
