import type { PoolClient } from "pg";
import { query } from "../../db/client.js";

/**
 * 增值税科目的**语义解析**（V12-B8 / 蓝图 F4）。
 *
 * 结转逻辑一律按 `accounts.account_type` 取科目，**不硬编码 222101 这类编码**。
 * 049 引入 account_type 正是为了这件事：编码体系当前是三套准则混搭，蓝图 D3
 * 已把国标化迁移单独立项；那一天到来时，只要迁移把 account_type 带过去，
 * 本模块与结转逻辑一行都不用改。
 *
 * 科目清单与语义见 `migrations/060_vat_account_chain.sql` 的注释。
 */

/**
 * 参与月末轧差的科目角色。
 *
 * 前四个 + 销项/进项构成「应交增值税」的**专栏**：它们的合计余额就是
 * 本期增值税的真实状态。`unpaid`/`prepaid` 是与「应交增值税」并列的二级明细，
 * 是轧差的**去向**而不是轧差的**对象** —— 把它们混进专栏合计会让结转自我抵消。
 */
export const VAT_ACCOUNT_ROLES = {
  /** 销项税额（贷方）。 */
  outputTax: "liability_tax_vat_output",
  /** 进项税额（借方）。 */
  inputTax: "liability_tax_vat_input",
  /** 进项税额转出（贷方）：已抵扣的进项因非正常损失等原因冲回。 */
  inputTaxTransferOut: "liability_tax_vat_input_transfer_out",
  /** 已交税金（借方）：当月缴纳**当月**增值税。缴上月的税走 unpaid，不在这里。 */
  taxPaid: "liability_tax_vat_paid",
  /** 转出未交增值税（借方）：月末把应交未交额转出。 */
  transferUnpaid: "liability_tax_vat_transfer_unpaid",
  /** 转出多交增值税（贷方）：月末把多缴额转出。 */
  transferOverpaid: "liability_tax_vat_transfer_overpaid",
  /** 未交增值税：结转的落脚点，贷方余额 = 本月应缴未缴。 */
  unpaid: "liability_tax_vat_unpaid",
  /** 预交增值税（借方）：月末转入未交增值税。 */
  prepaid: "liability_tax_vat_prepaid"
} as const;

export type VatAccountRole = keyof typeof VAT_ACCOUNT_ROLES;

/**
 * 「应交增值税」的专栏。月末轧差取的就是这六个科目的**累计**余额合计。
 *
 * 为什么是累计而不是本期发生额：留抵税额要跨月结转。上月进项 300 / 销项 100
 * 留抵 200 且不做凭证，这 200 就一直躺在进项科目的借方；本月销项 500 时应缴的是
 * 300 而不是 500。只看本期发生额会把留抵吃掉，纳税人多缴税。
 *
 * 包含 transferUnpaid / transferOverpaid 是必需的：往期结转分录恰好把往期的
 * 应缴额冲平，所以「累计余额」剩下的正是「还没结转的部分」。排除它们会让每个月
 * 都把开业至今的税重结一遍。（与 ledger/close-period.ts 里同一个道理。）
 */
export const VAT_COLUMN_ROLES: readonly VatAccountRole[] = [
  "outputTax",
  "inputTax",
  "inputTaxTransferOut",
  "taxPaid",
  "transferUnpaid",
  "transferOverpaid"
];

export interface VatAccountRef {
  role: VatAccountRole;
  code: string;
  name: string;
}

export type VatAccountMap = Readonly<Record<VatAccountRole, VatAccountRef>>;

export type VatAccountResolution =
  | { ok: true; accounts: VatAccountMap }
  | { ok: false; code: "VAT_ACCOUNTS_MISSING"; message: string; missingRoles: VatAccountRole[] };

interface AccountRow {
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
}

const ROLE_BY_ACCOUNT_TYPE = new Map<string, VatAccountRole>(
  (Object.entries(VAT_ACCOUNT_ROLES) as [VatAccountRole, string][]).map(([role, type]) => [type, role])
);

const ROLE_LABELS: Record<VatAccountRole, string> = {
  outputTax: "应交增值税（销项税额）",
  inputTax: "应交增值税（进项税额）",
  inputTaxTransferOut: "应交增值税（进项税额转出）",
  taxPaid: "应交增值税（已交税金）",
  transferUnpaid: "应交增值税（转出未交增值税）",
  transferOverpaid: "应交增值税（转出多交增值税）",
  unpaid: "未交增值税",
  prepaid: "预交增值税"
};

/**
 * 按公司解析全部增值税科目。
 *
 * **停用的科目视同缺失**：结转凭证要往上面记账，停用科目过不了
 * `checkAccountsUsable`，与其等到写凭证那一步才失败，不如在这里就说清楚是哪个。
 *
 * 一次查完全部而不是逐个角色查 —— 八次往返换不来任何东西。
 */
export async function resolveVatAccounts(
  companyId: string,
  client?: PoolClient
): Promise<VatAccountResolution> {
  const accountTypes = Object.values(VAT_ACCOUNT_ROLES);
  const sql = `
    select code, name, account_type, is_active
    from accounts
    where company_id = $1 and account_type = any($2::text[])
    order by code asc
  `;
  const rows: AccountRow[] = client
    ? (await client.query<AccountRow>(sql, [companyId, accountTypes])).rows
    : await query<AccountRow>(sql, [companyId, accountTypes]);

  const resolved = new Map<VatAccountRole, VatAccountRef>();
  for (const row of rows) {
    const role = ROLE_BY_ACCOUNT_TYPE.get(row.account_type);
    // 同一角色出现多个科目时取编码最小的那个（查询已按 code 排序）。允许这种情况
    // 是因为用户可以自建科目并挑同样的 account_type；报错反而会让账套无法使用。
    if (!role || !row.is_active || resolved.has(role)) continue;
    resolved.set(role, { role, code: row.code, name: row.name });
  }

  const missingRoles = (Object.keys(VAT_ACCOUNT_ROLES) as VatAccountRole[]).filter(
    (role) => !resolved.has(role)
  );
  if (missingRoles.length > 0) {
    const labels = missingRoles.map((role) => ROLE_LABELS[role]).join("、");
    return {
      ok: false,
      code: "VAT_ACCOUNTS_MISSING",
      message:
        `增值税科目链条不完整，缺少（或已停用）：${labels}。` +
        `月末「结转未交增值税」无科目可用。请在科目表中启用或补建这些科目。`,
      missingRoles
    };
  }

  return { ok: true, accounts: Object.fromEntries(resolved) as unknown as VatAccountMap };
}
