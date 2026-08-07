import type { PoolClient } from "pg";
import { query, queryOne } from "../../db/client.js";
import type { AccountCategory, AccountDirection } from "./chart-of-accounts.js";

/**
 * 科目主数据的读写 —— 数据源是 `accounts` 表（迁移 049），不再是 TS 常量。
 *
 * `chart-of-accounts.ts` 的 63 条常量现在只承担两个角色：
 * 1. 迁移 049 的模板来源（已固化进 `account_templates` 表）
 * 2. 报表读路径的同步兜底（那些函数是同步的，拿不到 companyId，迁移它们是后续工作）
 *
 * **写路径与需要按公司隔离的读路径一律走本模块。**
 */

export interface StoredAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: AccountCategory;
  accountType: string;
  direction: AccountDirection;
  parentCode: string | null;
  isLeaf: boolean;
  isActive: boolean;
  source: "system" | "custom";
  sortOrder: number;
}

interface AccountRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  category: AccountCategory;
  account_type: string;
  direction: AccountDirection;
  parent_code: string | null;
  is_leaf: boolean;
  is_active: boolean;
  source: "system" | "custom";
  sort_order: number;
}

function mapRow(row: AccountRow): StoredAccount {
  return {
    id: row.id,
    companyId: row.company_id,
    code: row.code,
    name: row.name,
    category: row.category,
    accountType: row.account_type,
    direction: row.direction,
    parentCode: row.parent_code,
    isLeaf: row.is_leaf,
    isActive: row.is_active,
    source: row.source,
    sortOrder: row.sort_order
  };
}

const SELECT_COLUMNS = `
  id, company_id, code, name, category, account_type, direction,
  parent_code, is_leaf, is_active, source, sort_order
`;

export interface ListAccountsOptions {
  category?: AccountCategory;
  /** 模糊匹配编码或名称。 */
  search?: string;
  leafOnly?: boolean;
  /** 默认只返回启用的；科目管理页需要看到停用的，传 true。 */
  includeInactive?: boolean;
}

export async function listCompanyAccounts(
  companyId: string,
  options: ListAccountsOptions = {}
): Promise<StoredAccount[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (options.category) {
    params.push(options.category);
    where += ` and category = $${params.length}`;
  }
  if (options.search) {
    params.push(`%${options.search}%`);
    where += ` and (code ilike $${params.length} or name ilike $${params.length})`;
  }
  if (options.leafOnly) {
    where += " and is_leaf = true";
  }
  if (!options.includeInactive) {
    where += " and is_active = true";
  }
  const rows = await query<AccountRow>(
    `select ${SELECT_COLUMNS} from accounts ${where} order by sort_order asc, code asc`,
    params
  );
  return rows.map(mapRow);
}

export async function findCompanyAccount(
  companyId: string,
  code: string,
  client?: PoolClient
): Promise<StoredAccount | null> {
  const sql = `select ${SELECT_COLUMNS} from accounts where company_id = $1 and code = $2`;
  const row = client
    ? (await client.query<AccountRow>(sql, [companyId, code])).rows[0]
    : await queryOne<AccountRow>(sql, [companyId, code]);
  return row ? mapRow(row) : null;
}

export interface CreateAccountInput {
  companyId: string;
  code: string;
  name: string;
  category: AccountCategory;
  accountType: string;
  direction: AccountDirection;
  parentCode: string | null;
}

export type AccountMutationVerdict =
  | { ok: true; account: StoredAccount }
  | { ok: false; code: string; message: string };

/**
 * 新建自定义科目。
 *
 * 两条约束是这里的重点：
 *
 * 1. **父科目必须存在，且新建后父科目自动变成非叶子**。往一个已经有余额的科目
 *    下面挂子科目，会让它从「可记账」变成「汇总」——原有分录就挂在了汇总科目上，
 *    正是迁移 042 修的那类问题。所以父科目**有分录时不允许再挂子级**。
 * 2. 编码在公司内唯一（数据库约束保证），且不允许与模板科目冲突。
 */
export async function createCompanyAccount(
  input: CreateAccountInput
): Promise<AccountMutationVerdict> {
  const existing = await findCompanyAccount(input.companyId, input.code);
  if (existing) {
    return { ok: false, code: "ACCOUNT_CODE_TAKEN", message: `科目编码 ${input.code} 已存在。` };
  }

  let parentPath = "";
  if (input.parentCode) {
    const parent = await findCompanyAccount(input.companyId, input.parentCode);
    if (!parent) {
      return { ok: false, code: "PARENT_NOT_FOUND", message: `上级科目 ${input.parentCode} 不存在。` };
    }
    // 父科目已经有分录时不允许再挂子级：那会让既有分录挂在汇总科目上，
    // 汇总时被算两次（迁移 042 修的正是这个）。
    const used = await queryOne<{ count: string }>(
      `select count(*)::text as count from ledger_entries where company_id = $1 and account_code = $2`,
      [input.companyId, input.parentCode]
    );
    if (used && Number(used.count) > 0) {
      return {
        ok: false,
        code: "PARENT_HAS_ENTRIES",
        message:
          `${input.parentCode} 上已经有 ${used.count} 条分录，不能再挂下级科目。` +
          `否则那些分录就记在了汇总科目上，合计时会被算两次。`
      };
    }
    parentPath = `${input.parentCode}.`;
  }

  const id = `${input.companyId}:${input.code}`;
  await query(
    `insert into accounts (
       id, company_id, code, name, category, account_type, direction,
       parent_code, path, is_leaf, source, sort_order
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::ltree, true, 'custom',
       coalesce((select max(sort_order) + 1 from accounts where company_id = $2), 1))`,
    [
      id,
      input.companyId,
      input.code,
      input.name,
      input.category,
      input.accountType,
      input.direction,
      input.parentCode,
      `${parentPath}${input.code}`
    ]
  );

  if (input.parentCode) {
    await query(`update accounts set is_leaf = false, updated_at = now() where company_id = $1 and code = $2`, [
      input.companyId,
      input.parentCode
    ]);
  }

  const created = await findCompanyAccount(input.companyId, input.code);
  return { ok: true, account: created! };
}

/**
 * 停用/启用科目。
 *
 * **不提供删除**：科目一旦被分录引用过，删掉会让历史账无法解读。停用足以达到
 * 「不再使用」的目的，且保留了历史可读性。这与 `source='system'` 的模板科目
 * 不可删是同一个理由。
 */
export async function setAccountActive(
  companyId: string,
  code: string,
  isActive: boolean
): Promise<AccountMutationVerdict> {
  const account = await findCompanyAccount(companyId, code);
  if (!account) {
    return { ok: false, code: "ACCOUNT_NOT_FOUND", message: `科目 ${code} 不存在。` };
  }
  await query(
    `update accounts set is_active = $3, updated_at = now() where company_id = $1 and code = $2`,
    [companyId, code, isActive]
  );
  const updated = await findCompanyAccount(companyId, code);
  return { ok: true, account: updated! };
}

/** 改名。编码与科目性质不可改——它们已经写进了历史分录。 */
export async function renameCompanyAccount(
  companyId: string,
  code: string,
  name: string
): Promise<AccountMutationVerdict> {
  const account = await findCompanyAccount(companyId, code);
  if (!account) {
    return { ok: false, code: "ACCOUNT_NOT_FOUND", message: `科目 ${code} 不存在。` };
  }
  await query(`update accounts set name = $3, updated_at = now() where company_id = $1 and code = $2`, [
    companyId,
    code,
    name
  ]);
  const updated = await findCompanyAccount(companyId, code);
  return { ok: true, account: updated! };
}
