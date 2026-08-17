/**
 * 合同付款计划与质保金（V13-C1/C2）。
 *
 * ## 期次状态由已付金额推导，不存字段
 *
 * 与报销合计、借款余额同一原则。存一份冗余状态迟早出现「状态写着已付、
 * 实际只付了一半」，而那时没人知道该信哪个。
 *
 * ## 质保金是独立一期，不是合同上的一个字段
 *
 * 质保金的实质是「合同总额的一部分延后支付」。做成合同上的字段会让合同
 * 要么永远显示「未付清」（质保金那部分一直没付），要么在质保金还没付时
 * 就显示「已付清」——两种都不对。
 *
 * 做成独立一期之后，「主体款项已付清、质保金待释放」是一个能准确表达的
 * 状态，也正是工程与采购合同里最常见的中间态。
 */

export type PaymentScheduleType = "normal" | "retention";

export type PaymentScheduleStatus = "pending" | "partial" | "paid" | "overdue" | "cancelled";

export interface PaymentScheduleRow {
  id: string;
  contractId: string;
  /** 期次序号，决定展示顺序。 */
  periodNo: number;
  /** 期次名称：首付款 / 进度款 / 尾款 / 质保金。 */
  title: string;
  /** 约定付款日。 */
  dueDate: string;
  amountCents: number;
  scheduleType: PaymentScheduleType;
  /** 质保金到期日；仅 `retention` 类型有意义。 */
  retentionReleaseDate: string | null;
  isCancelled: boolean;
}

/**
 * 一期的状态。
 *
 * `today` 可选：不传就不做逾期判定。**不在函数内部取系统时间**——那会让
 * 同一份数据在不同机器、不同时区上显示不同状态，而排查这类差异极其费时。
 */
export function scheduleStatus(
  schedule: PaymentScheduleRow,
  paidCents: number,
  today?: string
): PaymentScheduleStatus {
  if (schedule.isCancelled) return "cancelled";

  // 多付也算已付。超付通常是含税不含税弄错或多转了一笔，要在对账时发现——
  // 单造一个「超付」状态会让它看起来是正常业务形态。
  if (paidCents >= schedule.amountCents) return "paid";

  if (today !== undefined && today > schedule.dueDate) return "overdue";

  return paidCents > 0 ? "partial" : "pending";
}

/**
 * 质保金是否到了可释放的时点。
 *
 * 没设到期日时**不可释放**：那说明合同条款还没录全，默认可释放会让钱
 * 提前付出去。
 */
export function isRetentionReleasable(schedule: PaymentScheduleRow, today: string): boolean {
  if (schedule.scheduleType !== "retention") return false;
  if (schedule.retentionReleaseDate === null) return false;
  return today >= schedule.retentionReleaseDate;
}

export interface ContractPaymentProgress {
  /** 计划总额（不含作废期次）。 */
  totalCents: number;
  paidCents: number;
  /** 待付：**不含质保金**——它是约定延后的，混进来会让出纳以为现在就该付。 */
  unpaidCents: number;
  /** 质保金未付部分。 */
  retentionCents: number;
  /** 含质保金在内全部付清。 */
  isFullyPaid: boolean;
  /** 主体款项付清（质保金可能还挂着）。这是工程合同最常见的中间态。 */
  isMainPaid: boolean;
}

/**
 * 合同的付款进度。
 *
 * `paidByScheduleId` 由调用方从付款单汇总而来——**累计已付不存字段**，
 * 存了就会与实际付款漂移。
 */
export function contractPaymentProgress(
  schedules: readonly PaymentScheduleRow[],
  paidByScheduleId: ReadonlyMap<string, number>
): ContractPaymentProgress {
  const active = schedules.filter((item) => !item.isCancelled);

  let totalCents = 0;
  let paidCents = 0;
  let unpaidCents = 0;
  let retentionCents = 0;

  for (const schedule of active) {
    const paid = paidByScheduleId.get(schedule.id) ?? 0;
    // 多付的部分不计入「已付」合计：那会让合同显示付了超过总额的钱，
    // 而超付本身要在对账时单独处理。
    const effectivePaid = Math.min(paid, schedule.amountCents);
    const remaining = schedule.amountCents - effectivePaid;

    totalCents += schedule.amountCents;
    paidCents += effectivePaid;

    if (schedule.scheduleType === "retention") {
      retentionCents += remaining;
    } else {
      unpaidCents += remaining;
    }
  }

  return {
    totalCents,
    paidCents,
    unpaidCents,
    retentionCents,
    // 空计划不算付清：合同刚建、还没录付款计划是正常状态，
    // 但把它显示成「已付清」会让人以为这份合同已经了结。
    isFullyPaid: active.length > 0 && unpaidCents === 0 && retentionCents === 0,
    isMainPaid: active.length > 0 && unpaidCents === 0
  };
}
