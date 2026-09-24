/**
 * 凭证 / 总账分录 / 过账批次的读取层（V15/P3 自 routes.ts 拆出）。
 *
 * 这一层被税务、报表、风险、驾驶舱、事项五个模块引用——它其实一直是**公共查询层**，
 * 只是长在凭证的路由文件里。放在这里，改它的人能看见它有多少个调用方。
 */
import {
  query,
  queryOne
} from "../../db/client.js";
import type {
  LedgerEntry,
  LedgerPostingBatch,
  Voucher,
  VoucherPostingRecord
} from "@finance-taxation/domain-model";
import {
  toIsoString,
  mapLedgerEntryRow,
  mapVoucherPostingRecordRow,
  mapVoucherRow,
  attachCostCenter,
  attachCounterparty,
  type LedgerEntryRow,
  type LedgerPostingBatchRow,
  type VoucherLineRow,
  type VoucherPostingRecordRow,
  type VoucherRow
} from "./voucher-rows.js";
export async function listCompanyVouchers(
  companyId: string,
  options: { businessEventId?: string; voucherId?: string } = {}
): Promise<Voucher[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (options.businessEventId) {
    params.push(options.businessEventId);
    where += ` and business_event_id = $${params.length}`;
  }
  if (options.voucherId) {
    params.push(options.voucherId);
    where += ` and id = $${params.length}`;
  }
  const voucherRows = await query<VoucherRow>(
    `
      select
        id, company_id, business_event_id, mapping_id, voucher_type, summary, status,
        source, accounting_date, voucher_word, voucher_seq, period,
        approved_at, posted_at, created_at, updated_at
      from vouchers
      ${where}
      -- 按工作流顺序排：待处理的排前面，已过账的沉底。
      --
      -- 这里曾有 'validated' / 'approved' 两个分支，是早期状态机的遗留 —— 它们
      -- 不在 VoucherStatus（draft|review_required|posted）里，迁移 072 给这一列
      -- 加了 CHECK 之后更不可能出现。留着只会让下一个读代码的人以为状态机有五档。
      --
      -- ELSE 保留：CHECK 挡的是新写入，而 order by 对任何取值都得有个确定去向。
      order by
        CASE status WHEN 'draft' THEN 1 WHEN 'review_required' THEN 2 WHEN 'posted' THEN 3 ELSE 4 END,
        created_at desc
    `,
    params
  );
  if (!voucherRows.length) {
    return [];
  }
  const voucherIds = voucherRows.map((row) => row.id);
  const lineRows = await query<VoucherLineRow>(
    `
      select
        id, voucher_id, summary, account_code, account_name, debit, credit, sort_order,
        counterparty_id, cost_center_id, currency, original_amount, exchange_rate
      from voucher_lines
      where voucher_id = any($1::text[])
      order by sort_order asc
    `,
    [voucherIds]
  );
  return voucherRows.map((row) => mapVoucherRow(row, lineRows));
}

export async function listCompanyVoucherPostingRecords(
  companyId: string,
  voucherId?: string
): Promise<VoucherPostingRecord[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (voucherId) {
    params.push(voucherId);
    where += ` and voucher_id = $${params.length}`;
  }
  const rows = await query<VoucherPostingRecordRow>(
    `
      select
        id, company_id, voucher_id, business_event_id, posted_by_user_id, posted_by_name, posted_at
      from voucher_posting_records
      ${where}
      order by posted_at desc
    `,
    params
  );
  return rows.map(mapVoucherPostingRecordRow);
}

export interface ListLedgerEntriesOptions {
  voucherId?: string;
  businessEventId?: string;
  /** 会计日期下界（含），`YYYY-MM-DD`。省略即不设下界。 */
  dateFrom?: string;
  /** 会计日期上界（含），`YYYY-MM-DD`。省略即不设上界。 */
  dateTo?: string;
}

/**
 * 总账分录读取。
 *
 * `dateFrom` / `dateTo` 按 `entry_date`（会计日期，非过账时间 `posted_at`）过滤，
 * 且**下推到 SQL**。加这两个参数是因为此前多个调用方（利润表、现金流量表、
 * 资产负债表、驾驶舱）都是先把公司全部历史分录拉进 Node 内存、再 `.filter()`
 * 按日期筛——分录上万条后每次请求都要全表扫一遍并在堆上物化，是确定的性能悬崖。
 *
 * 两个参数都是可选的：不传时 SQL、排序与返回值与加参数之前**完全一致**，
 * 既有调用方（凭证详情、税务、风险）无需改动。对应断言见
 * reports/trial-balance.integration.test.ts 的「不传参行为不变」一组。
 */
export async function listCompanyLedgerEntries(
  companyId: string,
  options: ListLedgerEntriesOptions = {}
): Promise<LedgerEntry[]> {
  const params: unknown[] = [companyId];
  // 列名一律带 `e.` 前缀：查询 left join 了 accounts，裸列名会歧义。
  let where = "where e.company_id = $1";
  if (options.voucherId) {
    params.push(options.voucherId);
    where += ` and e.voucher_id = $${params.length}`;
  }
  if (options.businessEventId) {
    params.push(options.businessEventId);
    where += ` and e.business_event_id = $${params.length}`;
  }
  if (options.dateFrom) {
    params.push(options.dateFrom);
    where += ` and e.entry_date >= $${params.length}::date`;
  }
  if (options.dateTo) {
    params.push(options.dateTo);
    where += ` and e.entry_date <= $${params.length}::date`;
  }
  const rows = await query<LedgerEntryRow>(
    `
      select
        e.id, e.company_id, e.voucher_id, e.business_event_id, e.entry_date, e.summary,
        e.account_code, e.account_name, e.debit, e.credit, e.source, e.posted_at,
        a.category as account_category
      from ledger_entries e
      -- 科目的报表口径随分录一起取出（V12 残留 7）。此前报表侧读的是硬编码的
      -- chart-of-accounts.ts，而 049 早把科目表落了库 —— 两份数据靠 chart-parity
      -- 护栏防漂移，但报表实际读的始终是常量那份。
      --
      -- left join 而不是 join：分录指向一个已不存在的科目（脏数据）时不能让它
      -- 从账簿上消失，那会比分类错更难查。取不到 category 的走前缀兜底。
      -- (company_id, code) 上有唯一索引，join 不构成额外开销。
      left join accounts a on a.company_id = e.company_id and a.code = e.account_code
      ${where}
      order by e.posted_at desc, e.id asc
    `,
    params
  );
  return rows.map(mapLedgerEntryRow);
}

export async function listCompanyLedgerPostingBatches(
  companyId: string,
  voucherId?: string
): Promise<LedgerPostingBatch[]> {
  const params: unknown[] = [companyId];
  let where = "where b.company_id = $1";
  if (voucherId) {
    params.push(voucherId);
    where += ` and b.voucher_id = $${params.length}`;
  }
  const batchRows = await query<LedgerPostingBatchRow>(
    `
      select b.id, b.company_id, b.voucher_id, b.business_event_id, b.posted_at
      from ledger_posting_batches b
      ${where}
      order by b.posted_at desc
    `,
    params
  );
  if (!batchRows.length) {
    return [];
  }
  const batchIds = batchRows.map((row) => row.id);
  const entryLinks = await query<{ batch_id: string; entry_id: string }>(
    `
      select batch_id, entry_id
      from ledger_posting_batch_entries
      where batch_id = any($1::text[])
    `,
    [batchIds]
  );
  return batchRows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    entryIds: entryLinks.filter((item) => item.batch_id === row.id).map((item) => item.entry_id),
    postedAt: toIsoString(row.posted_at) || new Date().toISOString()
  }));
}

export async function getVoucherForCompany(companyId: string, voucherId: string): Promise<Voucher | null> {
  const rows = await listCompanyVouchers(companyId, { voucherId });
  return rows[0] ?? null;
}

/**
 * 取这张凭证的审核人，供过账时校验「复核人 ≠ 过账人」。
 *
 * 单独查而不并进 Voucher：审核人只服务于服务端的职责分离判定，不需要进
 * domain-model 的对外契约，也就不会牵动前端类型。
 * 返回 null 表示迁移 043 之前审核的历史凭证（无记录），由调用方决定如何放行。
 */
export async function getVoucherApproverUserId(companyId: string, voucherId: string): Promise<string | null> {
  const row = await queryOne<{ approved_by_user_id: string | null }>(
    `select approved_by_user_id from vouchers where id = $1 and company_id = $2`,
    [voucherId, companyId]
  );
  return row?.approved_by_user_id ?? null;
}
