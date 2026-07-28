/**
 * /payroll 承载哪几件事（纯逻辑）。
 *
 * 改造前这一页是三层嵌套：域 Tab（工资管理 / 代发与社保）→ 页内 PayrollTabBar
 * （员工管理 / 工资计算 / 参数设置）→ PayrollRunWizard 的 6 步 Steps。
 * 用户要点三次才摸到「算这个月工资」这件具体的事，而前两层本质上是同一个问题的
 * 两次分组：这个域里有哪几件事可做。
 *
 * 现在把前两层压成一层：五件事平铺进 TaskFocusShell，一次只渲染一件事的工作区。
 * 第三层（PayrollRunWizard 的 6 步）保留——那是「一件事内部的分步」，与
 * 「几件事之间的取舍」不是一回事，TaskFocusShell 的文件头也是这么划分的。
 *
 * 代发批次与社保关账被拆成两件事（改造前挤在同一页的左右两栏）：前者产出银行代发
 * 文件、后者产出三险一金凭证与社保申报事项，输入输出和责任人都不一样，摆在一起
 * 只是因为它们曾经共用一个路由。拆开后彼此互为切换器上的邻居，一次点击可达。
 */
import type { TaskDef } from "../../lib/task-focus";

export const PAYROLL_TASK_KEYS = {
  run: "run",
  transfer: "transfer",
  social: "social",
  employees: "employees",
  policy: "policy"
} as const;

export type PayrollTaskKey = (typeof PAYROLL_TASK_KEYS)[keyof typeof PAYROLL_TASK_KEYS];

const PAYROLL_TASK_ORDER: readonly PayrollTaskKey[] = [
  PAYROLL_TASK_KEYS.run,
  PAYROLL_TASK_KEYS.transfer,
  PAYROLL_TASK_KEYS.social,
  PAYROLL_TASK_KEYS.employees,
  PAYROLL_TASK_KEYS.policy
];

/** V10 起在 URL 上承载「当前在做哪件事」的参数名（与 /tax、/ledger 对齐）。 */
export const PAYROLL_TASK_QUERY_KEY = "task";

/**
 * 改造前的域 Tab 参数名。App.tsx 把 /payroll/transfer 重定向到 /payroll?tab=transfer，
 * 后端的 setup / close 清单（「维护工资账号」「社保关账」）也仍然指向 /payroll/transfer，
 * 用户书签同样可能带着它——所以读的时候必须继续认，且不能改 App.tsx。
 */
export const LEGACY_PAYROLL_TAB_QUERY_KEY = "tab";

/** 旧域 Tab → 新任务。manage 对应的是「工资管理」整块，落到它的主任务「算工资」。 */
const LEGACY_TAB_TO_TASK: Readonly<Record<string, PayrollTaskKey>> = {
  manage: PAYROLL_TASK_KEYS.run,
  transfer: PAYROLL_TASK_KEYS.transfer
};

export const DEFAULT_PAYROLL_TASK: PayrollTaskKey = PAYROLL_TASK_KEYS.run;

export function isPayrollTaskKey(value: string | null | undefined): value is PayrollTaskKey {
  return typeof value === "string" && (PAYROLL_TASK_ORDER as readonly string[]).includes(value);
}

/** 代发与社保关账由 PayrollTransferPage 承载，其余三件由 PayrollPage 承载。 */
export function isTransferSideTask(task: PayrollTaskKey): boolean {
  return task === PAYROLL_TASK_KEYS.transfer || task === PAYROLL_TASK_KEYS.social;
}

/**
 * 从 URL 解析当前任务：新参数优先，缺省时回落到旧的 ?tab=，都不合法时用默认值。
 * 做成纯函数是为了让「/payroll/transfer 旧深链还能用」这件事可被单测钉住。
 */
export function readPayrollTask(params: URLSearchParams): PayrollTaskKey {
  const next = params.get(PAYROLL_TASK_QUERY_KEY);
  if (isPayrollTaskKey(next)) {
    return next;
  }
  const legacy = params.get(LEGACY_PAYROLL_TAB_QUERY_KEY);
  const mapped = legacy ? LEGACY_TAB_TO_TASK[legacy] : undefined;
  return mapped ?? DEFAULT_PAYROLL_TASK;
}

/**
 * 写入当前任务：只留新参数，并清掉旧的 ?tab=。
 * 两个参数同时留在 URL 上，下一次读会出现「谁说了算」的歧义，
 * 分享出去的链接也会自带一个永远不再更新的值。
 */
export function writePayrollTask(params: URLSearchParams, task: PayrollTaskKey): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(PAYROLL_TASK_QUERY_KEY, task);
  next.delete(LEGACY_PAYROLL_TAB_QUERY_KEY);
  return next;
}

export interface PayrollNavHint {
  /** 审计/钻取跳转带来的页内 tab 提示（drilldown.ts 里是 "employees" | "payroll"）。 */
  tab?: string | null;
  employeeId?: string | null;
  payrollPeriod?: string | null;
  businessEventId?: string | null;
  /** 钻取目标对象类型，代发批次会带 payroll_transfer_batch。 */
  resourceType?: string | null;
}

/**
 * 由跳转携带的 location.state 推导应该落在哪件事上；推不出来时返回 null
 * （交给 URL / 默认值决定，不要越权把用户按在某件事上）。
 */
export function resolvePayrollTaskFromNav(nav: PayrollNavHint): PayrollTaskKey | null {
  if (nav.resourceType === "payroll_transfer_batch") {
    return PAYROLL_TASK_KEYS.transfer;
  }
  if (nav.tab === "employees" || nav.employeeId) {
    return PAYROLL_TASK_KEYS.employees;
  }
  if (nav.tab === "payroll" || nav.payrollPeriod || nav.businessEventId) {
    return PAYROLL_TASK_KEYS.run;
  }
  return null;
}

/**
 * 任务文案：动词短语，说清「在这里做什么」，而不是罗列这个视图叫什么。
 * 顺序固定按「算 → 发 → 关账 → 台账维护 → 参数」，即一个月的实际推进次序；
 * 不按紧急度重排，位置一变用户的肌肉记忆就废了。
 */
const PAYROLL_TASK_TEXT: Readonly<Record<PayrollTaskKey, { label: string; description: string }>> = {
  run: {
    label: "算这个月的工资",
    description:
      "按向导走完选期间、核对人员、试算、调整、复核、发放申报六步；每一步的结果都会带到下一步。"
  },
  transfer: {
    label: "发这个月的工资",
    description:
      "生成银行代发文件并推进批次：审批 → 导出 → 银行代发 → 对账，每一步的状态来自批次本身。"
  },
  social: {
    label: "做社保公积金关账",
    description:
      "工资全部确认后对该期间关账，自动生成社保申报事项与三险一金的计提、缴纳凭证草稿。"
  },
  employees: {
    label: "维护员工档案",
    description: "增减员工、改基本工资和专项附加扣除；这里的口径直接决定工资怎么算。"
  },
  policy: {
    label: "设工资参数口径",
    description: "社保、公积金基数比例和个税参数，低频维护，改动会影响之后所有期间的计算结果。"
  }
};

/**
 * 构造任务列表。
 *
 * 刻意不挂角标：工资域的待办数分散在两个子页面各自的 hook 里
 * （工资记录在 PayrollPage、代发批次在 useTransferBatchWorkflow）。外壳要拿到它们，
 * 要么自己再拉一遍同样的接口——于是同一个数字有两个来源，操作后必然出现不一致；
 * 要么等子页面挂载才有值——而子页面只在对应任务被选中时才挂载，用户在别的任务上
 * 看到的角标永远是 0。两条路给出的都是假角标，不如不挂。
 */
export function buildPayrollTasks(): TaskDef[] {
  return PAYROLL_TASK_ORDER.map((key) => ({
    key,
    label: PAYROLL_TASK_TEXT[key].label,
    description: PAYROLL_TASK_TEXT[key].description
  }));
}
