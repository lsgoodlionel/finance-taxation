/**
 * 约当产量法（V14-C）。
 *
 * ## 这是成本结转真正的技术内容
 *
 * 期末车间里既有完工入库的产品，也有做了一半的在产品。本期归集的料工费
 * 要在两者之间分开——分不对，完工产品的成本就不对，卖出去之后毛利也不对。
 *
 * 在产品要先折算成「相当于多少个完工品」才能参与分摊：
 *
 * ```
 * 约当产量 = 完工数量 + 在产品数量 × 完工程度
 * 单位成本 = (期初在产品成本 + 本期归集) ÷ 约当产量
 * 完工成本 = 单位成本 × 完工数量
 * 期末在产品 = 剩下的
 * ```
 *
 * ## 三个成本项分开算，因为完工程度不同
 *
 * 这是中国成本会计的标准做法，也是「一个完工程度打天下」最常见的错处：
 *
 * | 成本项 | 典型完工程度 | 为什么 |
 * |---|---|---|
 * | 直接材料 | 100% | 开工时一次性投料，做了一半的机器里材料是齐的 |
 * | 直接人工 | 按加工进度 | 做了一半就是花了一半的工时 |
 * | 制造费用 | 按加工进度 | 随加工进度发生 |
 *
 * 用加工进度（比如 50%）去分材料会算错方向：在产品的约当量变小，分母跟着
 * 变小，**完工产品反而多分到材料成本**。
 *
 * 举例：完工 80 台、在产 20 台、材料 100 万。
 * 按 100% 算，约当 100 台，完工分走 80 万；按 50% 算，约当只有 90 台，
 * 完工分走 88.9 万。可那 20 台在产品里的材料是齐的，它们就该背 20 万。
 *
 * 结果是**完工成本被高估、在产品余额被低估**——卖出去之后毛利偏低，
 * 而 5001 生产成本的余额撑不起车间里实际堆着的料。
 *
 * ## 整数分 + 末项扫尾
 *
 * 与费用分摊（`reimbursements/allocation.ts`）、外币分摊、折旧排程同一套：
 * 完工成本按比例截断，**余数全部留给在产品**。
 *
 * 这保证了 `完工成本 + 期末在产品 ≡ 期初 + 本期归集`，一分不差 ——
 * 差一分就是借贷不平，凭证过不了账。
 */

/** 完工程度用基点（1/10000）表达，避免小数。100% = 10000。 */
export const TOTAL_BASIS_POINTS = 10000;

export type CostElement = "material" | "labor" | "overhead";

export const COST_ELEMENT_LABELS: Record<CostElement, string> = {
  material: "直接材料",
  labor: "直接人工",
  overhead: "制造费用"
};

export interface CostElementInput {
  element: CostElement;
  /** 期初在产品成本（分）。 */
  openingWipCents: number;
  /** 本期归集成本（分）。 */
  incurredCents: number;
  /**
   * 期末在产品对**这一项**的完工程度，基点。
   *
   * 材料通常是 10000（开工即全部投入），人工与制造费用按加工进度。
   */
  wipCompletionBp: number;
}

export interface CostElementResult {
  element: CostElement;
  /** 约当产量 × 10000。整数，避免小数运算。 */
  equivalentUnitsBp: number;
  /**
   * 每个约当产量单位的成本（分）。
   *
   * **仅供展示，不参与结转金额的计算**——结转金额走下面两个字段，
   * 它们是用整数运算算出来的，恰好加总等于投入。拿这个数去乘数量
   * 会因为四舍五入而对不上。
   */
  unitCostCents: number;
  /** 结转到完工产品的成本（分）。 */
  finishedCents: number;
  /** 留在在产品的成本（分）。**含扫尾余数**。 */
  endingWipCents: number;
}

export interface EquivalentUnitsInput {
  /** 本期完工入库数量。 */
  finishedQuantity: number;
  /** 期末在产品数量。 */
  endingWipQuantity: number;
  elements: readonly CostElementInput[];
}

export interface EquivalentUnitsResult {
  elements: CostElementResult[];
  /** 三项合计：结转到完工产品。 */
  totalFinishedCents: number;
  /** 三项合计：留在在产品。 */
  totalEndingWipCents: number;
  /** 三项合计：期初 + 本期归集。**必须恰好等于上面两个之和**。 */
  totalInputCents: number;
}

function assertCents(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label}必须是整数分，收到 ${value}`);
  }
  if (value < 0) {
    // 负的成本归集不是没有可能（红冲），但那应当走单独的调整流程。
    // 混进正常结转会让分摊比例变成负数，结果没有任何意义。
    throw new Error(`${label}不得为负，收到 ${value}`);
  }
}

function assertQuantity(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}不得为负，收到 ${value}`);
  }
  if (!Number.isInteger(value)) {
    // 数量允许小数的行业（按吨、按米）应当先换算成最小计量单位再进来。
    // 在这里放行小数会让约当产量的整数运算失效。
    throw new Error(`${label}必须是整数，按吨/米计量的请先换算成最小单位，收到 ${value}`);
  }
}

/**
 * 按约当产量分配一个期间的生产成本。
 *
 * 三个成本项各自独立分配（完工程度不同），最后加总。
 */
export function allocateByEquivalentUnits(
  input: EquivalentUnitsInput
): EquivalentUnitsResult {
  assertQuantity(input.finishedQuantity, "完工数量");
  assertQuantity(input.endingWipQuantity, "期末在产品数量");

  if (input.elements.length === 0) {
    throw new Error("至少要有一个成本项");
  }
  const seen = new Set(input.elements.map((item) => item.element));
  if (seen.size !== input.elements.length) {
    // 合并重复项是在替用户猜意图。同一个成本项出现两行是数据错误，
    // 而「它被算了两次」在报表上比报错难查得多。
    throw new Error("成本项出现重复");
  }

  const elements = input.elements.map((item) => allocateOneElement(input, item));

  return {
    elements,
    totalFinishedCents: elements.reduce((sum, item) => sum + item.finishedCents, 0),
    totalEndingWipCents: elements.reduce((sum, item) => sum + item.endingWipCents, 0),
    totalInputCents: input.elements.reduce(
      (sum, item) => sum + item.openingWipCents + item.incurredCents,
      0
    )
  };
}

function allocateOneElement(
  input: EquivalentUnitsInput,
  element: CostElementInput
): CostElementResult {
  const label = COST_ELEMENT_LABELS[element.element];
  assertCents(element.openingWipCents, `${label}期初在产品成本`);
  assertCents(element.incurredCents, `${label}本期归集成本`);

  if (
    !Number.isInteger(element.wipCompletionBp) ||
    element.wipCompletionBp < 0 ||
    element.wipCompletionBp > TOTAL_BASIS_POINTS
  ) {
    throw new Error(`${label}的完工程度必须在 0 到 ${TOTAL_BASIS_POINTS} 基点之间`);
  }

  const totalCents = element.openingWipCents + element.incurredCents;

  // 全部用整数：完工数量按 10000 基点计（完工品的完工程度就是 100%），
  // 在产品按它自己的完工程度计。
  const finishedBp = input.finishedQuantity * TOTAL_BASIS_POINTS;
  const wipBp = input.endingWipQuantity * element.wipCompletionBp;
  const equivalentUnitsBp = finishedBp + wipBp;

  if (equivalentUnitsBp === 0) {
    if (totalCents === 0) {
      // 这一项这个期间什么都没发生。零除零返回零，不报错。
      return {
        element: element.element,
        equivalentUnitsBp: 0,
        unitCostCents: 0,
        finishedCents: 0,
        endingWipCents: 0
      };
    }
    // 归集了成本却既没有完工也没有在产品——那笔钱去哪了？
    // **不静默把它留在在产品**：留下来会让 5001 生产成本挂着一个数量为零的
    // 余额，而那个余额永远不会被结转，也没人知道它是什么。
    throw new Error(
      `${label}归集了 ${totalCents} 分，但完工数量与在产品数量都是零——` +
        `请先确认产量数据`
    );
  }

  // 截断而不是四舍五入：余数全给在产品，保证两项之和恰好等于投入。
  const finishedCents = Math.floor((totalCents * finishedBp) / equivalentUnitsBp);

  return {
    element: element.element,
    equivalentUnitsBp,
    unitCostCents: Math.round((totalCents * TOTAL_BASIS_POINTS) / equivalentUnitsBp),
    finishedCents,
    // 扫尾：剩下的全部留在在产品。
    endingWipCents: totalCents - finishedCents
  };
}
