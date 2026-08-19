/**
 * 完工结转的凭证（V14-C）。
 *
 * ## 方向
 *
 * ```
 * 借 1403 库存商品      （完工产品入库）
 * 贷 4001 生产成本      （从在制转出）
 * ```
 *
 * 写反会让生产成本越结越大、库存商品是负的——那种错在余额表上一眼可见，
 * 但要到月末才有人看。
 *
 * ## 在产品不做分录
 *
 * 期末在产品成本**留在 4001 生产成本的余额里**，不需要任何分录——
 * 它本来就在那儿。给它做一笔「借在产品贷生产成本」是把一个余额搬到
 * 另一个科目，而下期还要搬回来。
 *
 * 这是成本结转最容易多做一步的地方：结转的对象只有完工的那部分。
 *
 * ## 制造费用的归集不在这里
 *
 * 4101 制造费用 → 4001 生产成本 的月末结转是另一笔分录，发生在归集阶段。
 * 到了本模块这一步，料工费应当已经都在 4001 上了。
 */

import { fromCents } from "../../utils/money.js";
import { COST_ELEMENT_LABELS, type CostElement } from "./equivalent-units.js";

/**
 * 完工产品入库科目。
 *
 * **是 1403 不是 1405**——1405 是另一版会计科目表的编码，
 * 这套账里找不到。判定靠 `account_type = 'asset_inventory'`，
 * 编码只作为同类型里的定位。
 */
export const FINISHED_GOODS_ACCOUNT = "1403";

/** 生产成本。`account_type = 'cost_production'`。 */
export const PRODUCTION_COST_ACCOUNT = "4001";

export interface CarryoverVoucherInput {
  /** 展示用标识，写进凭证摘要。 */
  label: string;
  /** 各成本项结转到完工产品的金额（分）。 */
  finishedByElement: ReadonlyArray<{ element: CostElement; finishedCents: number }>;
}

export interface CarryoverVoucherLine {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  summary: string;
}

/**
 * 生成结转分录。
 *
 * 借方合并成一行（库存商品不分料工费——入库的是产品，不是三堆成本），
 * 贷方按成本项分三行，让「这批产品的料工费各占多少」在凭证上直接看得出来。
 *
 * 金额为零的成本项**不出行**：零金额分录行不表达任何信息，只会让凭证变长。
 */
export function buildCarryoverLines(
  input: CarryoverVoucherInput,
  accountNames: ReadonlyMap<string, string>
): CarryoverVoucherLine[] {
  const nonZero = input.finishedByElement.filter((item) => item.finishedCents > 0);
  const totalCents = nonZero.reduce((sum, item) => sum + item.finishedCents, 0);

  if (totalCents === 0) {
    // 完工成本为零就没有要结转的东西。返回空数组让调用方决定——
    // 生成一张借贷都是零的凭证比不生成更糟：它会出现在待过账列表里，
    // 而没人知道该拿它怎么办。
    return [];
  }

  const debitLine: CarryoverVoucherLine = {
    accountCode: FINISHED_GOODS_ACCOUNT,
    accountName: accountNames.get(FINISHED_GOODS_ACCOUNT) ?? "库存商品",
    debitCents: totalCents,
    creditCents: 0,
    summary: `${input.label} 完工入库`
  };

  const creditLines = nonZero.map((item) => ({
    accountCode: PRODUCTION_COST_ACCOUNT,
    accountName: accountNames.get(PRODUCTION_COST_ACCOUNT) ?? "生产成本",
    debitCents: 0,
    creditCents: item.finishedCents,
    summary: `${input.label} 结转${COST_ELEMENT_LABELS[item.element]}`
  }));

  return [debitLine, ...creditLines];
}

/** 分录行转成落库用的元／分格式。与其他模块同一套 `fromCents`。 */
export function toVoucherRowValues(line: CarryoverVoucherLine): {
  debit: string;
  credit: string;
} {
  return { debit: fromCents(line.debitCents), credit: fromCents(line.creditCents) };
}
