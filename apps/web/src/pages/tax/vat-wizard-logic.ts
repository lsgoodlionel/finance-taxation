/**
 * 增值税申报向导的纯逻辑（P0-1）。
 *
 * ## 为什么要抽出来
 *
 * `vat-wizard.test.tsx` 原来**在测试文件里重新实现了一遍这三段逻辑**——
 * 增值税计算、批次查找、步骤导航——测的是自己的副本。那种测试永远是绿的：
 * 它证明的是「我的副本和我的副本一致」，向导里的真实代码一行没被覆盖。
 *
 * 一个月回顾把这条列为 P0 的一部分（「建立一条『测试不得重新实现被测逻辑』
 * 的检查——已经吃过一次亏」）。检查建起来之后，第一个被抓的就是它。
 *
 * 抽出来之后：向导 import 这里的函数，测试也 import 这里的函数，
 * 两边跑的是同一份代码。
 */

/** 税务申报批次的最小形态。向导只关心这几个字段。 */
export interface VatBatchLite {
  id: string;
  taxType: string;
  filingPeriod: string;
  status: string;
}

export interface VatComputation {
  /** 应纳税额 = 销项 − 进项 + 简易计税。 */
  payable: number;
  /**
   * 是否留抵（进项大于销项）。
   *
   * **不叫 refund**：留抵不是退税，它是结转下期继续抵扣。
   * 叫退税会让人以为钱能拿回来。
   */
  isCreditCarried: boolean;
}

/**
 * 按销项、进项、简易计税算应纳税额。
 *
 * 传入的是**元**（从工作底稿的 numeric 字段解析而来），不是分——
 * 这里只做展示与判断，实际入账走后端的增值税结转，那边用整数分。
 */
export function computeVat(
  outputTax: number,
  inputTax: number,
  simplifiedTax: number
): VatComputation {
  const payable = outputTax - inputTax + simplifiedTax;
  return { payable, isCreditCarried: payable < 0 };
}

/**
 * 找某个申报期间的增值税批次。
 *
 * **税种与期间必须同时匹配**：只按期间找会拿到同期的个税批次，
 * 而那张批次的金额与状态与增值税毫无关系。
 */
export function findVatBatch(
  batches: readonly VatBatchLite[],
  filingPeriod: string
): VatBatchLite | null {
  return (
    batches.find(
      (batch) => batch.taxType === "vat" && batch.filingPeriod === filingPeriod
    ) ?? null
  );
}

/** 还能不能往下一步。最后一步不能再往下。 */
export function canGoNext(step: number, totalSteps: number): boolean {
  return step < totalSteps - 1;
}

/** 是不是到了可以提交的那一步。**只有最后一步能提交**。 */
export function canSubmitAtStep(step: number, totalSteps: number): boolean {
  return step === totalSteps - 1;
}

/** 还能不能退回上一步。第一步不能再退。 */
export function canGoBack(step: number): boolean {
  return step > 0;
}
