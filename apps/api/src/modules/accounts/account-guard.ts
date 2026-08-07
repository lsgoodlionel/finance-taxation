import type { PoolClient } from "pg";
import { query } from "../../db/client.js";

/**
 * 科目写入闸门 —— 让「分录只能挂在这家公司真实存在的叶子科目上」成为硬约束。
 *
 * ## 修的是什么
 *
 * `findChartAccount()` 全仓 6 处调用，5 处在测试文件、1 处在读路径
 * （reports/profit-accounts.ts），**三个写入函数一次都没调**。
 * `voucher_lines.account_code` 与 `ledger_entries.account_code` 是裸 text，
 * 无外键无 CHECK。任何客户端调 `POST /api/vouchers` 都能写进任意字符串并过账。
 *
 * 这个洞已造成两次线上错账，有迁移留档：
 * - `041` — 编码体系错配导致 788,679 元收入与实收资本在报表中静默消失、资产负债表不平
 * - `042` — 分录挂到**非叶子科目** 2211 导致前缀汇总重复计量
 *
 * 两次都是事后 SQL UPDATE 补救。校验放在写入端，才是从源头拦住。
 *
 * ## 为什么校验「叶子」而不只是「存在」
 *
 * 非叶子科目（2211 应付职工薪酬、2221 应交税费、6301e 管理费用、6401 财务费用）
 * 是汇总层。往它们身上直接记账，汇总时这笔金额会被算两次——一次作为自身余额、
 * 一次作为下级合计。042 修的正是这个。
 */

export interface AccountRef {
  accountCode: string;
  accountName?: string;
}

export type AccountGuardVerdict =
  | { ok: true }
  | {
      ok: false;
      code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_NOT_LEAF" | "ACCOUNT_INACTIVE";
      message: string;
      offendingCodes: string[];
    };

interface AccountRow {
  code: string;
  is_leaf: boolean;
  is_active: boolean;
}

/**
 * 校验这批分录引用的科目对这家公司都合法。
 *
 * 一次查完全部科目而不是逐条查：凭证通常只有 2–10 行，但逐条查会让一张凭证产生
 * 十次往返，且在事务里放大锁持有时间。
 *
 * `client` 可选——在事务内调用时传入，保证读到的是同一事务的视图（例如用户刚
 * 新建了科目又立刻用它记账）。
 */
export async function checkAccountsUsable(
  companyId: string,
  lines: readonly AccountRef[],
  client?: PoolClient
): Promise<AccountGuardVerdict> {
  const codes = [...new Set(lines.map((line) => line.accountCode).filter(Boolean))];
  if (codes.length === 0) {
    return { ok: true };
  }

  const sql = `select code, is_leaf, is_active from accounts where company_id = $1 and code = any($2::text[])`;
  const rows: AccountRow[] = client
    ? (await client.query<AccountRow>(sql, [companyId, codes])).rows
    : await query<AccountRow>(sql, [companyId, codes]);

  const found = new Map(rows.map((row) => [row.code, row]));

  const missing = codes.filter((code) => !found.has(code));
  if (missing.length > 0) {
    return {
      ok: false,
      code: "ACCOUNT_NOT_FOUND",
      message: `科目不存在：${missing.join("、")}。请先在科目表中建立，或检查编码是否写错。`,
      offendingCodes: missing
    };
  }

  const nonLeaf = codes.filter((code) => found.get(code)!.is_leaf === false);
  if (nonLeaf.length > 0) {
    return {
      ok: false,
      code: "ACCOUNT_NOT_LEAF",
      message:
        `以下是汇总科目，不能直接记账：${nonLeaf.join("、")}。` +
        `请改用它的下级明细科目 —— 往汇总科目记账会让金额在合计时被算两次。`,
      offendingCodes: nonLeaf
    };
  }

  const inactive = codes.filter((code) => found.get(code)!.is_active === false);
  if (inactive.length > 0) {
    return {
      ok: false,
      code: "ACCOUNT_INACTIVE",
      message: `以下科目已停用，不能再记账：${inactive.join("、")}。`,
      offendingCodes: inactive
    };
  }

  return { ok: true };
}
