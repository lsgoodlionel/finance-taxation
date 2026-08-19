/**
 * 费用类型 → 会计科目的映射（V15）。
 *
 * ## 为什么要有这个
 *
 * 报销明细里原来有一列「科目」，让用户手填 `660203` 这样的编码。
 * **填报销的人多数不是会计**——他知道自己住了酒店，不知道住宿费该挂哪个科目。
 * 手填的后果不是填不出来，是填错：`660204` 是业务招待费，而业务招待费
 * 在税前扣除上只能按 60% 且不超过收入的 5‰，挂错了要到汇算清缴才发现。
 *
 * 这份映射把那一列变成「选费用类型，科目自动带出」。会计仍然可以改——
 * 改的入口在明细行的展开区里，不占常驻列位。
 *
 * ## 编码取自 chart-of-accounts.ts
 *
 * `660201` 办公费 / `660203` 差旅费 / `660204` 业务招待费 ……
 * 那份表的注释里记着一次真实事故：常量表与 `account_templates` 整体错开
 * 一位，差旅费被挂成了业务招待费。**这里的每一条都对着那份表核过**。
 */

export interface ExpenseTypeOption {
  value: string;
  label: string;
  /** 默认科目编码。用户可在明细行展开区里改。 */
  accountCode: string;
  accountName: string;
}

export const EXPENSE_TYPE_OPTIONS: readonly ExpenseTypeOption[] = [
  { value: "travel_hotel", label: "差旅-住宿", accountCode: "660203", accountName: "管理费用-差旅费" },
  { value: "travel_meal", label: "差旅-餐补", accountCode: "660203", accountName: "管理费用-差旅费" },
  { value: "travel_transport", label: "差旅-交通", accountCode: "660203", accountName: "管理费用-差旅费" },
  // **业务招待费单独一个科目**：它的税前扣除口径与差旅费完全不同
  // （只能按 60% 且不超过收入的 5‰），混进差旅费会让汇算清缴调不出来。
  { value: "entertainment", label: "业务招待", accountCode: "660204", accountName: "管理费用-业务招待费" },
  { value: "office", label: "办公用品", accountCode: "660201", accountName: "管理费用-办公费" },
  { value: "communication", label: "通讯", accountCode: "660207", accountName: "管理费用-其他" },
  { value: "training", label: "培训", accountCode: "660207", accountName: "管理费用-其他" },
  { value: "other", label: "其他", accountCode: "660207", accountName: "管理费用-其他" }
];

const BY_VALUE = new Map(EXPENSE_TYPE_OPTIONS.map((option) => [option.value, option]));

/**
 * 取某个费用类型的默认科目。
 *
 * 认不出的类型返回「管理费用-其他」而不是空串——**空科目会让整张单提交失败**，
 * 而失败的原因（某一行科目为空）在界面上看不出来。落到「其他」至少能提交，
 * 会计复核时改得动。
 */
export function defaultAccountFor(expenseType: string): { code: string; name: string } {
  const option = BY_VALUE.get(expenseType);
  return option
    ? { code: option.accountCode, name: option.accountName }
    : { code: "660207", name: "管理费用-其他" };
}

/** 科目编码对应的名称。查不到时回显编码本身，不显示空白。 */
export function accountNameOf(accountCode: string): string {
  const hit = EXPENSE_TYPE_OPTIONS.find((option) => option.accountCode === accountCode);
  return hit ? hit.accountName : accountCode;
}
