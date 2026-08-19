/**
 * 生产成本的读写与结转（V14-C）。
 *
 * 约当产量的分配全在 `equivalent-units.ts`（纯函数），凭证方向全在
 * `voucher.ts`（纯函数）。这里只负责取数、落库与事务边界。
 *
 * ## 期初在产品自动从上期取
 *
 * 上期结转后留在 4001 的那部分，就是本期的期初在产品。让用户手填等于
 * 让他去翻上个月的结果再抄一遍——抄错了要到毛利异常时才发现。
 *
 * ## 结转是一次性的
 *
 * 已结转的批次不能再结转（状态机拦住）。重复结转在账上表现为库存商品
 * 凭空多出一批，而多出来的那批没有对应的实物。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { fromCents } from "../../utils/money.js";
import {
  allocateByEquivalentUnits,
  TOTAL_BASIS_POINTS,
  type CostElement
} from "./equivalent-units.js";
import {
  buildCarryoverLines,
  FINISHED_GOODS_ACCOUNT,
  PRODUCTION_COST_ACCOUNT
} from "./voucher.js";

export type ProductionRunStatus = "draft" | "carried_over" | "cancelled";

export type CostFailureCode =
  | "PRODUCT_NOT_FOUND"
  | "RUN_NOT_FOUND"
  | "RUN_ALREADY_CARRIED_OVER"
  | "RUN_INVALID_TRANSITION"
  | "RUN_ALLOCATION_FAILED"
  | "PERIOD_LOCKED"
  | "ACCOUNT_MISSING";

export type CostResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: CostFailureCode; message: string } };

function fail<T>(code: CostFailureCode, message: string): CostResult<T> {
  return { ok: false, failure: { code, message } };
}

// ── 产品 ──────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  isActive: boolean;
  note: string | null;
}

export async function listProducts(companyId: string): Promise<Product[]> {
  const rows = await query<{
    id: string;
    code: string;
    name: string;
    unit: string;
    is_active: boolean;
    note: string | null;
  }>(
    "select id, code, name, unit, is_active, note from products where company_id=$1 order by code",
    [companyId]
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    unit: row.unit,
    isActive: row.is_active,
    note: row.note
  }));
}

export async function upsertProduct(input: {
  companyId: string;
  id: string | null;
  code: string;
  name: string;
  unit: string;
  note: string | null;
}): Promise<CostResult<Product>> {
  const row = await queryOne<{
    id: string;
    code: string;
    name: string;
    unit: string;
    is_active: boolean;
    note: string | null;
  }>(
    `insert into products (id, company_id, code, name, unit, note)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (company_id, code) do update
        set name = excluded.name, unit = excluded.unit,
            note = excluded.note, updated_at = now()
     returning id, code, name, unit, is_active, note`,
    [
      input.id ?? `prd-${randomUUID()}`,
      input.companyId,
      input.code.trim(),
      input.name.trim(),
      input.unit.trim() || "台",
      input.note
    ]
  );
  return {
    ok: true,
    value: {
      id: row!.id,
      code: row!.code,
      name: row!.name,
      unit: row!.unit,
      isActive: row!.is_active,
      note: row!.note
    }
  };
}

// ── 生产批次 ──────────────────────────────────────────────────────────

export interface RunCost {
  element: CostElement;
  openingWipCents: number;
  incurredCents: number;
  wipCompletionBp: number;
  /** 结转前是 `null`。 */
  finishedCents: number | null;
  endingWipCents: number | null;
}

export interface ProductionRun {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  productUnit: string;
  period: string;
  finishedQuantity: number;
  endingWipQuantity: number;
  status: ProductionRunStatus;
  voucherId: string | null;
  carriedOverAt: string | null;
  note: string | null;
  costs: RunCost[];
}

interface RunDbRow {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_unit: string;
  period: string;
  finished_quantity: number;
  ending_wip_quantity: number;
  status: ProductionRunStatus;
  voucher_id: string | null;
  carried_over_at: string | Date | null;
  note: string | null;
}

interface CostDbRow {
  run_id: string;
  element: CostElement;
  opening_wip_cents: string | number;
  incurred_cents: string | number;
  wip_completion_bp: number;
  finished_cents: string | number | null;
  ending_wip_cents: string | number | null;
}

const RUN_SELECT = `
  select r.id, r.product_id, p.code as product_code, p.name as product_name,
         p.unit as product_unit, r.period, r.finished_quantity, r.ending_wip_quantity,
         r.status, r.voucher_id, r.carried_over_at, r.note
    from production_runs r
    join products p on p.id = r.product_id
   where r.company_id = $1`;

const ELEMENT_ORDER: readonly CostElement[] = ["material", "labor", "overhead"];

function mapCost(row: CostDbRow): RunCost {
  return {
    element: row.element,
    openingWipCents: Number(row.opening_wip_cents),
    incurredCents: Number(row.incurred_cents),
    wipCompletionBp: row.wip_completion_bp,
    finishedCents: row.finished_cents === null ? null : Number(row.finished_cents),
    endingWipCents: row.ending_wip_cents === null ? null : Number(row.ending_wip_cents)
  };
}

function mapRun(row: RunDbRow, costs: readonly CostDbRow[]): ProductionRun {
  return {
    id: row.id,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    productUnit: row.product_unit,
    period: row.period,
    finishedQuantity: row.finished_quantity,
    endingWipQuantity: row.ending_wip_quantity,
    status: row.status,
    voucherId: row.voucher_id,
    carriedOverAt:
      row.carried_over_at === null
        ? null
        : row.carried_over_at instanceof Date
          ? row.carried_over_at.toISOString()
          : String(row.carried_over_at),
    note: row.note,
    costs: costs
      .filter((cost) => cost.run_id === row.id)
      .map(mapCost)
      // 固定料工费的顺序：报表上三项的位置每次都一样，看的人不用重新找。
      .sort((a, b) => ELEMENT_ORDER.indexOf(a.element) - ELEMENT_ORDER.indexOf(b.element))
  };
}

/**
 * 给**草稿**批次刷新期初在产品。
 *
 * ## 为什么读取时算而不是保存时存
 *
 * 期初在产品是派生值——上期结转后留在生产成本的那部分。用户在上期结转
 * **之前**就把本期批次录好是很正常的顺序，那时上期还没有期末数，
 * 存下来的是 0。照那个 0 去分配，上期留下的在产品成本会被静默丢掉，
 * 永远卡在生产成本上而没有任何人知道。
 *
 * ## 已结转的不刷新
 *
 * 那时它已经**冻结**了——凭证是按它做的。再往前追溯会让
 * 「完工 + 在产 = 期初 + 归集」这条平衡在事后复核时算不平。
 *
 * 这样预演与实际结转看到的是同一份数字，不会出现「预览说 80 万、
 * 实际结转 88 万」。
 */
async function refreshOpeningWip(
  companyId: string,
  runs: readonly ProductionRun[]
): Promise<ProductionRun[]> {
  const drafts = runs.filter((run) => run.status === "draft");
  if (drafts.length === 0) return [...runs];

  const rows = await query<{
    product_id: string;
    period: string;
    element: CostElement;
    ending_wip_cents: string | number;
  }>(
    `select r.product_id, r.period, c.element, c.ending_wip_cents
       from production_runs r
       join production_run_costs c on c.run_id = r.id
      where r.company_id = $1 and r.status = 'carried_over'
        and r.product_id = any($2::text[])
        and c.ending_wip_cents is not null`,
    [companyId, [...new Set(drafts.map((run) => run.productId))]]
  );

  return runs.map((run) => {
    if (run.status !== "draft") return run;
    // 取该产品**早于本期**的最近一个已结转期间。中间跳过的期间没有结转，
    // 它们的在产品仍然体现在更早那期的期末数上。
    const earlier = rows.filter(
      (row) => row.product_id === run.productId && row.period < run.period
    );
    if (earlier.length === 0) return run;
    const latestPeriod = earlier.reduce(
      (max, row) => (row.period > max ? row.period : max),
      earlier[0]!.period
    );
    const opening = new Map(
      earlier
        .filter((row) => row.period === latestPeriod)
        .map((row) => [row.element, Number(row.ending_wip_cents)])
    );
    return {
      ...run,
      costs: run.costs.map((cost) => ({
        ...cost,
        openingWipCents: opening.get(cost.element) ?? 0
      }))
    };
  });
}

export async function listRuns(
  companyId: string,
  filters: { period?: string; productId?: string } = {}
): Promise<ProductionRun[]> {
  const params: unknown[] = [companyId];
  const clauses: string[] = [];
  if (filters.period) {
    params.push(filters.period);
    clauses.push(`and r.period = $${params.length}`);
  }
  if (filters.productId) {
    params.push(filters.productId);
    clauses.push(`and r.product_id = $${params.length}`);
  }

  const runs = await query<RunDbRow>(
    `${RUN_SELECT} ${clauses.join(" ")} order by r.period desc, p.code`,
    params
  );
  if (runs.length === 0) return [];

  const costs = await query<CostDbRow>(
    `select run_id, element, opening_wip_cents, incurred_cents, wip_completion_bp,
            finished_cents, ending_wip_cents
       from production_run_costs where run_id = any($1::text[])`,
    [runs.map((run) => run.id)]
  );
  return refreshOpeningWip(companyId, runs.map((run) => mapRun(run, costs)));
}

export async function getRun(companyId: string, id: string): Promise<ProductionRun | null> {
  const run = await queryOne<RunDbRow>(`${RUN_SELECT} and r.id = $2`, [companyId, id]);
  if (!run) return null;
  const costs = await query<CostDbRow>(
    `select run_id, element, opening_wip_cents, incurred_cents, wip_completion_bp,
            finished_cents, ending_wip_cents
       from production_run_costs where run_id = $1`,
    [id]
  );
  const [refreshed] = await refreshOpeningWip(companyId, [mapRun(run, costs)]);
  return refreshed ?? null;
}

/**
 * 上期留下的在产品成本，按成本项。
 *
 * 让用户手填等于让他去翻上个月的结果再抄一遍——抄错了要到毛利异常时
 * 才发现，而那时已经跨了好几个期间。
 *
 * 找不到上期批次时返回全零：这个产品是第一次投产，期初在产品本来就是零。
 */
export async function resolveOpeningWip(
  companyId: string,
  productId: string,
  period: string
): Promise<Map<CostElement, number>> {
  const rows = await query<{ element: CostElement; ending_wip_cents: string | number }>(
    `select c.element, c.ending_wip_cents
       from production_runs r
       join production_run_costs c on c.run_id = r.id
      where r.company_id = $1 and r.product_id = $2
        and r.period < $3 and r.status = 'carried_over'
        and c.ending_wip_cents is not null
      -- 只取最近一个已结转的期间。中间跳过的期间没有结转，
      -- 它们的在产品仍然体现在更早那期的期末数上。
      and r.period = (
        select max(r2.period) from production_runs r2
         where r2.company_id = $1 and r2.product_id = $2
           and r2.period < $3 and r2.status = 'carried_over'
      )`,
    [companyId, productId, period]
  );
  return new Map(rows.map((row) => [row.element, Number(row.ending_wip_cents)]));
}

export interface UpsertRunInput {
  companyId: string;
  id: string | null;
  productId: string;
  period: string;
  finishedQuantity: number;
  endingWipQuantity: number;
  note: string | null;
  costs: ReadonlyArray<{
    element: CostElement;
    incurredCents: number;
    wipCompletionBp: number;
  }>;
}

export async function upsertRun(input: UpsertRunInput): Promise<CostResult<ProductionRun>> {
  const product = await queryOne<{ id: string }>(
    "select id from products where company_id=$1 and id=$2",
    [input.companyId, input.productId]
  );
  if (!product) return fail("PRODUCT_NOT_FOUND", "产品不存在");

  const existing = input.id
    ? await queryOne<{ status: ProductionRunStatus }>(
        "select status from production_runs where company_id=$1 and id=$2",
        [input.companyId, input.id]
      )
    : null;
  if (existing && existing.status !== "draft") {
    // 已结转的批次改产量会让凭证与数据对不上——凭证已经按旧数做了。
    return fail("RUN_INVALID_TRANSITION", `批次当前为「${existing.status}」，不能修改`);
  }

  const runId = input.id ?? `prn-${randomUUID()}`;
  const openingWip = await resolveOpeningWip(input.companyId, input.productId, input.period);

  await withTransaction(async (tx) => {
    await tx.query(
      `insert into production_runs
         (id, company_id, product_id, period, finished_quantity, ending_wip_quantity, note)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update
          set finished_quantity = excluded.finished_quantity,
              ending_wip_quantity = excluded.ending_wip_quantity,
              note = excluded.note,
              updated_at = now()`,
      [
        runId,
        input.companyId,
        input.productId,
        input.period,
        input.finishedQuantity,
        input.endingWipQuantity,
        input.note
      ]
    );

    for (const cost of input.costs) {
      await tx.query(
        `insert into production_run_costs
           (id, run_id, element, opening_wip_cents, incurred_cents, wip_completion_bp)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (run_id, element) do update
            set opening_wip_cents = excluded.opening_wip_cents,
                incurred_cents = excluded.incurred_cents,
                wip_completion_bp = excluded.wip_completion_bp`,
        [
          `prc-${randomUUID()}`,
          runId,
          cost.element,
          // 期初在产品由系统从上期结果取，不接受调用方传入——
          // 传进来就等于允许它与上期的期末数对不上，而对不上意味着
          // 有一笔成本凭空消失或凭空出现。
          openingWip.get(cost.element) ?? 0,
          cost.incurredCents,
          cost.wipCompletionBp
        ]
      );
    }
  });

  const saved = await getRun(input.companyId, runId);
  return saved
    ? { ok: true, value: saved }
    : fail("RUN_NOT_FOUND", "批次保存后读取失败");
}

// ── 结转 ──────────────────────────────────────────────────────────────

export interface CarryoverResult {
  run: ProductionRun;
  voucherId: string;
  totalFinishedCents: number;
  totalEndingWipCents: number;
}

/**
 * 完工结转：按约当产量分配，生成凭证草稿。
 *
 * **凭证是 draft**，延续折旧、红冲、定期凭证、增值税结转、期末调汇、
 * 借款付款、报销落账、合同付款的一贯做法——系统算出来的分录要有人复核。
 */
export async function carryOver(
  companyId: string,
  runId: string,
  accountingDate: string
): Promise<CostResult<CarryoverResult>> {
  const run = await getRun(companyId, runId);
  if (!run) return fail("RUN_NOT_FOUND", "批次不存在");
  if (run.status === "carried_over") {
    // 重复结转在账上表现为库存商品凭空多出一批，而多出来的那批没有实物。
    return fail("RUN_ALREADY_CARRIED_OVER", "该批次已经结转过了");
  }
  if (run.status !== "draft") {
    return fail("RUN_INVALID_TRANSITION", `批次当前为「${run.status}」，不能结转`);
  }

  const locked = await queryOne<{ is_locked: boolean }>(
    "select is_locked from accounting_periods where company_id=$1 and period=$2",
    [companyId, run.period]
  );
  if (locked?.is_locked === true) {
    return fail("PERIOD_LOCKED", `${run.period} 已结账，不能再生成凭证`);
  }

  let allocation: ReturnType<typeof allocateByEquivalentUnits>;
  try {
    allocation = allocateByEquivalentUnits({
      finishedQuantity: run.finishedQuantity,
      endingWipQuantity: run.endingWipQuantity,
      elements: run.costs.map((cost) => ({
        element: cost.element,
        openingWipCents: cost.openingWipCents,
        incurredCents: cost.incurredCents,
        wipCompletionBp: cost.wipCompletionBp
      }))
    });
  } catch (error) {
    // 「归集了成本却没有任何产出」这类是业务判断，转成 4xx 而不是 500。
    return fail(
      "RUN_ALLOCATION_FAILED",
      error instanceof Error ? error.message : "成本分配失败"
    );
  }

  const accountRows = await query<{ code: string; name: string; account_type: string }>(
    "select code, name, account_type from accounts where company_id=$1 and code = any($2::text[])",
    [companyId, [FINISHED_GOODS_ACCOUNT, PRODUCTION_COST_ACCOUNT]]
  );
  const accountNames = new Map(accountRows.map((row) => [row.code, row.name]));

  // 科目缺失要当场报出来。用编码兜底生成凭证会让分录挂在一个不存在的科目上，
  // 而那张凭证过账时才会失败——那时已经过了几步，不好查是哪一步的错。
  const missing = [FINISHED_GOODS_ACCOUNT, PRODUCTION_COST_ACCOUNT].filter(
    (code) => !accountNames.has(code)
  );
  if (missing.length > 0) {
    return fail("ACCOUNT_MISSING", `科目表缺少 ${missing.join("、")}，请先补齐会计科目`);
  }

  const lines = buildCarryoverLines(
    {
      label: `${run.productName} ${run.period}`,
      finishedByElement: allocation.elements.map((item) => ({
        element: item.element,
        finishedCents: item.finishedCents
      }))
    },
    accountNames
  );

  if (lines.length === 0) {
    return fail(
      "RUN_ALLOCATION_FAILED",
      "完工成本为零，没有要结转的内容——请确认完工数量与归集成本"
    );
  }

  const voucherId = `vch-${randomUUID()}`;
  await withTransaction(async (tx) => {
    await tx.query(
      `insert into vouchers
         (id, company_id, voucher_type, summary, status, source, accounting_date, period)
       values ($1,$2,'transfer',$3,'draft','manual',$4::date,$5)`,
      [
        voucherId,
        companyId,
        `${run.productName} ${run.period} 完工结转`,
        accountingDate,
        run.period
      ]
    );

    for (const [index, line] of lines.entries()) {
      await tx.query(
        `insert into voucher_lines
           (id, company_id, voucher_id, sort_order, summary, account_code, account_name,
            debit, credit)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          `vl-${randomUUID()}`,
          companyId,
          voucherId,
          index,
          line.summary,
          line.accountCode,
          line.accountName,
          fromCents(line.debitCents),
          fromCents(line.creditCents)
        ]
      );
    }

    for (const element of allocation.elements) {
      await tx.query(
        `update production_run_costs
            set opening_wip_cents = $5, finished_cents = $3, ending_wip_cents = $4
          where run_id = $1 and element = $2`,
        [
          runId,
          element.element,
          element.finishedCents,
          element.endingWipCents,
          // 期初一并落库。读取时它是实时算出来的，但结转之后必须**冻结**——
          // 凭证已经按它做了，再往前追溯会让「完工 + 在产 = 期初 + 归集」
          // 这条平衡在事后复核时算不平。
          run.costs.find((cost) => cost.element === element.element)?.openingWipCents ?? 0
        ]
      );
    }

    await tx.query(
      `update production_runs
          set status = 'carried_over', voucher_id = $2, carried_over_at = now(), updated_at = now()
        where id = $1`,
      [runId, voucherId]
    );
  });

  const after = await getRun(companyId, runId);
  return {
    ok: true,
    value: {
      run: after!,
      voucherId,
      totalFinishedCents: allocation.totalFinishedCents,
      totalEndingWipCents: allocation.totalEndingWipCents
    }
  };
}

/**
 * 结转预演：算出来给人看，但不落库、不生成凭证。
 *
 * 与提交时的实际结转走**同一个纯函数**，所以预览的数字与最终落账的数字
 * 必然一致。分两套算法实现是「预览说 80 万、实际结转 88 万」的来源。
 */
export function previewAllocation(run: ProductionRun): CostResult<{
  elements: ReturnType<typeof allocateByEquivalentUnits>["elements"];
  totalFinishedCents: number;
  totalEndingWipCents: number;
  totalInputCents: number;
}> {
  try {
    const result = allocateByEquivalentUnits({
      finishedQuantity: run.finishedQuantity,
      endingWipQuantity: run.endingWipQuantity,
      elements: run.costs.map((cost) => ({
        element: cost.element,
        openingWipCents: cost.openingWipCents,
        incurredCents: cost.incurredCents,
        wipCompletionBp: cost.wipCompletionBp
      }))
    });
    return { ok: true, value: result };
  } catch (error) {
    return fail(
      "RUN_ALLOCATION_FAILED",
      error instanceof Error ? error.message : "成本分配失败"
    );
  }
}

export { TOTAL_BASIS_POINTS };
