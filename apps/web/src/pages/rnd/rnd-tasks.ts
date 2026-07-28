/**
 * /rnd 承载哪几件事，以及「这个研发项目走到哪了」（纯逻辑）。
 *
 * 改造前这一页把 8 个平级区块一次摊开：页头、全站 10 环节导航条、4 张 KPI 卡、
 * 空态提示、项目列表卡、项目详情卡（内含明细表 + 政策风险 + 政策建议三段）、
 * 归集向导 Modal、新建项目 Modal。用户打开看到的是「研发辅助账这个模块有什么」，
 * 而不是「你现在要办哪一件」——KPI 卡讲的四个数与详情卡里的四个数是同一批，
 * 列表和详情左右并排各占半屏，真正要动手的「归集费用」藏在一个行内小按钮后面。
 *
 * 改造后按「一次只做一件事」归口成三件事（见 RND_TASK_TEXT），选中的项目和
 * 当前这件事都写进 URL（?project= / ?task=），可刷新、可分享、可前进后退。
 *
 * ── 口径：加计扣除的数只有一个来源 ──────────────────────────────────────────
 * 改造前前端自己发明了两套算法，和后端算出来的对不上：
 *   - RndCostWizard：基数 = 费用化 + 资本化 × 0.60
 *   - RndKpiCards / RndCostWizard：加计扣除额 = 基数 × 0.75
 *   - 后端 modules/rnd/summary.ts：superDeductionEligibleBase = 费用化金额（资本化完全不进基数）
 *   - 后端 modules/rnd/package.ts：suggestedDeductionAmount = 基数 × 2
 * 于是同一个项目，用户在 /rnd 的 KPI 上看到一个数，在归集向导里看到另一个数，
 * 在 /export-center 导出的资料包里看到第三个数。本模块把口径统一到后端那一份，
 * 前端不再自造税率（见 computeEligibleBase / SUPER_DEDUCTION_* 常量）。
 */
import type { RndProject, RndProjectSummary } from "@finance-taxation/domain-model";
import { buildObjectFlow, type FlowRelatedObject, type ObjectFlow } from "../../lib/object-flow";
import type { TaskDef } from "../../lib/task-focus";

// ── 任务定义 ─────────────────────────────────────────────────────────────────

export const RND_TASK_KEYS = {
  projects: "projects",
  costs: "costs",
  deduction: "deduction"
} as const;

export type RndTaskKey = (typeof RND_TASK_KEYS)[keyof typeof RND_TASK_KEYS];

const RND_TASK_ORDER: readonly RndTaskKey[] = [
  RND_TASK_KEYS.projects,
  RND_TASK_KEYS.costs,
  RND_TASK_KEYS.deduction
];

export const DEFAULT_RND_TASK: RndTaskKey = RND_TASK_KEYS.projects;

/** 与 /ledger、/tax、/knowledge 对齐的「当前在做哪件事」参数名。 */
export const RND_TASK_QUERY_KEY = "task";

/** 选中的研发项目——跨三件事共用的上下文，所以单独占一个参数。 */
export const RND_PROJECT_QUERY_KEY = "project";

export function isRndTaskKey(value: string): value is RndTaskKey {
  return (RND_TASK_ORDER as readonly string[]).includes(value);
}

export function readRndTask(params: URLSearchParams): RndTaskKey {
  const value = params.get(RND_TASK_QUERY_KEY);
  return value && isRndTaskKey(value) ? value : DEFAULT_RND_TASK;
}

/** 写入时保留其余参数（尤其是 ?project=，切换任务不该把选中的项目弄丢）。 */
export function writeRndTask(params: URLSearchParams, task: RndTaskKey): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(RND_TASK_QUERY_KEY, task);
  return next;
}

export function readRndProjectId(params: URLSearchParams): string | null {
  const value = params.get(RND_PROJECT_QUERY_KEY);
  return value && value.trim() ? value : null;
}

export function writeRndProjectId(params: URLSearchParams, projectId: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (projectId) {
    next.set(RND_PROJECT_QUERY_KEY, projectId);
  } else {
    next.delete(RND_PROJECT_QUERY_KEY);
  }
  return next;
}

const RND_TASK_TEXT: Record<RndTaskKey, { label: string; description: string }> = {
  projects: {
    label: "挑一个研发项目",
    description:
      "先选定这一轮要处理的项目。列表里每行直接标出它走到哪了：立项了没有、费用归集了没有、加计扣除基数出来了没有。"
  },
  costs: {
    label: "归集这个项目的研发费用",
    description:
      "把本期研发支出按人员、材料、设备等类别记进辅助账。只有费用化部分构成加计扣除基数，资本化部分先形成无形资产、不进基数。"
  },
  deduction: {
    label: "核对加计扣除基数与资料",
    description:
      "核对系统算出的可加计扣除基数、政策冲突提示，以及汇算清缴要备齐的资料清单。这里的数与导出的资料包同源。"
  }
};

export interface RndProjectListItem {
  status: RndProject["status"];
  summary: RndProjectSummary;
}

/**
 * 还有几个项目一条费用都没归集 —— 「归集研发费用」这件事唯一真实的待办量。
 *
 * 只数还在推进的项目（planning / active）：已结项（closed）的项目没归集费用是既成
 * 事实，挂进角标只会制造一个永远消不掉的红点。
 */
export function countProjectsWithoutCosts(projects: readonly RndProjectListItem[]): number {
  return projects.filter((project) => {
    if (project.status === "closed") return false;
    return !hasCollectedCosts(project.summary);
  }).length;
}

/**
 * 构造任务列表。
 *
 * 只有「归集研发费用」挂角标：项目总数、基数金额都不是「有几件事要办」，
 * 把它们挂成红角标是假紧迫感。顺序固定按 挑项目 → 归集 → 核对 排列，
 * 不按角标排序（位置一变，用户的肌肉记忆就废了）。
 */
export function buildRndTasks(projects: readonly RndProjectListItem[]): TaskDef[] {
  return RND_TASK_ORDER.map((key) => {
    const text = RND_TASK_TEXT[key];
    return {
      key,
      label: text.label,
      description: text.description,
      ...(key === RND_TASK_KEYS.costs ? { badge: countProjectsWithoutCosts(projects) } : {})
    };
  });
}

// ── 项目状态的呈现 ───────────────────────────────────────────────────────────

/**
 * 项目状态的中文名与色调，按领域模型 RndProjectStatus 的三个取值对齐。
 *
 * 改造前界面上有三套互不相同的词表：
 *   - RndPage 的 STATUS_COLOR：planning / active / completed / archived
 *   - lib/i18n.tsx 的 RND_STATUS_LABELS：planning / active / completed / terminated
 *   - 领域模型 RndProjectStatus：planning / active / closed
 * 结果是真正会出现的 closed 两边都没配，已结项的项目在界面上直接显示英文 "closed"，
 * 而 completed / archived / terminated 三个键永远不会命中。
 * lib/i18n.tsx 是共享文件，本轮不动它，改为本页自带一份与领域模型一致的映射。
 */
export const RND_STATUS_PRESENTATION: Record<RndProject["status"], { label: string; color: string }> = {
  planning: { label: "规划中", color: "default" },
  active: { label: "进行中", color: "processing" },
  closed: { label: "已结项", color: "success" }
};

// ── 金额与加计扣除口径 ───────────────────────────────────────────────────────

/** 金额字段在接口上是字符串，脏值一律按 0 处理，绝不让 NaN 流到界面上。 */
export function parseAmount(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface RndCostAmountLike {
  accountingTreatment: string;
  amount: string;
}

/**
 * 加计扣除基数 = 费用化金额合计。
 *
 * 与后端 modules/rnd/summary.ts 的 `superDeductionEligibleBase: formatAmount(expenseAmount)`
 * 逐字对齐。改造前向导里写的是 `费用化 + 资本化 × 0.60`，那个 0.60 在后端、
 * 在税法口径里都找不到出处，且会让向导预览的数比提交后台账里的数大一截。
 */
export function computeEligibleBase(entries: readonly RndCostAmountLike[]): number {
  return entries
    .filter((entry) => entry.accountingTreatment === "expensed")
    .reduce((sum, entry) => sum + parseAmount(entry.amount), 0);
}

/**
 * 税前可扣除总额 = 加计扣除基数 × 2（据实扣除 1 倍 + 加计 1 倍）。
 * 与后端 modules/rnd/package.ts 的 `suggestedDeductionAmount = eligibleBase * 2` 对齐。
 */
export const SUPER_DEDUCTION_TOTAL_MULTIPLE = 2;

/** 「额外」能多扣的部分 = 基数 × 1，即 100% 加计扣除。 */
export const SUPER_DEDUCTION_EXTRA_MULTIPLE = SUPER_DEDUCTION_TOTAL_MULTIPLE - 1;

/** 在据实扣除之外还能多扣多少。界面上说「额外」时用这个，别再乘 0.75。 */
export function computeExtraDeduction(eligibleBase: number): number {
  return eligibleBase * SUPER_DEDUCTION_EXTRA_MULTIPLE;
}

/** 这个项目到底归集过费用没有——费用化或资本化任一有金额即算归集过。 */
export function hasCollectedCosts(summary: RndProjectSummary): boolean {
  return parseAmount(summary.expenseAmount) > 0 || parseAmount(summary.capitalizedAmount) > 0;
}

// ── 「这个项目走到哪了」 ─────────────────────────────────────────────────────

export interface RndProjectFlowInput {
  /** RndProject.startedOn —— 立项日期。 */
  startedOn: string | null;
  /** RndProject.businessEventId —— 可空；为空时这一步不给对象级链接。 */
  businessEventId: string | null;
  /**
   * RndProjectDetail.costLines 的条数。
   * 项目列表只有 summary、拿不到明细，此时传 undefined，回落到按金额判断。
   */
  costLineCount?: number;
  summary: RndProjectSummary;
  /**
   * RndAccountingPolicyReview.conflicts。列表页同样拿不到，传 undefined。
   * 有冲突时基数还不能用，第三步会显示为「卡住了」。
   */
  conflicts?: readonly string[];
}

/**
 * 由项目的真实字段推出三步流程。
 *
 * 只画三步，每一步都能指到一个真字段：
 *   1. 立项       ← RndProject.startedOn（外加可空的 businessEventId 作为关联对象）
 *   2. 归集研发费用 ← RndProjectDetail.costLines / RndProjectSummary 的金额
 *   3. 形成可用的加计扣除基数 ← RndProjectSummary.superDeductionEligibleBase
 *                             + RndAccountingPolicyReview.conflicts（有冲突即卡住）
 *
 * ── 刻意没画的步骤，以及为什么 ──────────────────────────────────────────────
 * - 「记录研发工时」：timeEntries 确实是真字段，但它不在基数的因果链上——后端
 *   basis = 费用化金额，与工时完全无关。把它排进顺序流程会造成两处误导：工时为 0 时
 *   基数那一步会被算成「还没轮到」（而基数其实早就算出来了），且 Web 端根本没有
 *   录工时的入口（createRndTimeEntry 只在 lib/api.ts 里，无人调用）。因此工时降级为
 *   上下文，放在 aside 里显示，不冒充流程节点。
 * - 「申报 / 汇算清缴引用」：没有任何字段记录资料包有没有报出去。
 *   SuperDeductionPackage.generatedAt 是请求当下的 new Date()，是「你刚才点了导出」，
 *   不是「这个项目已申报」的状态。没有支撑字段，就不画。
 * - 「资本化转无形资产」：capitalizationPolicy 是一条政策声明（expense/capitalize/mixed），
 *   不是一个已发生的状态，没有字段记录转资是否完成。
 * - 「结项」：endedOn / status="closed" 是真字段，但属于项目生命周期，不属于本页
 *   「归集费用 → 算加计扣除」这条线，画进来只会让健康的在研项目常年显示「未完成」。
 *
 * ── 刻意没给的对象级链接 ────────────────────────────────────────────────────
 * RndCostLine 在领域模型里带 voucherId / businessEventId，但 Web 端的
 * lib/api.ts 把 RndProjectDetail.costLines 收窄成了
 * `{id, costType, accountingTreatment, amount, occurredOn, notes}`——这几个字段里
 * 没有凭证号。既然前端的类型契约拿不到，就不画「费用 → 凭证」的链接，
 * 更不能靠运行时碰运气去读一个没声明的字段。（放宽这个投影需要改 lib/api.ts，
 * 那是共享文件，本轮只提出、不动手。）
 */
export interface RndFlowProgress {
  /** 一句话说清这个项目卡在哪，用于列表里的「走到哪了」列。 */
  text: string;
  /** 语义色调，供调用方映射到 Tag 颜色；不单独用颜色传达状态（WCAG 1.4.1）。 */
  tone: "done" | "blocked" | "in_progress";
}

/**
 * 把流程压成列表单元格里的一句话。
 * 「卡住了」优先于「正在办」——列表的价值就是让出问题的项目自己冒出来。
 */
export function summarizeRndFlow(flow: ObjectFlow): RndFlowProgress {
  if (flow.overall === "done") {
    return { text: "基数已就绪", tone: "done" };
  }
  const active = flow.steps.find((step) => step.status === "blocked" || step.status === "current");
  if (!active) {
    return { text: "办理中", tone: "in_progress" };
  }
  return {
    text: flow.overall === "blocked" ? `卡住：${active.label}` : `待办：${active.label}`,
    tone: flow.overall === "blocked" ? "blocked" : "in_progress"
  };
}

export function buildRndProjectFlow(input: RndProjectFlowInput): ObjectFlow {
  const { startedOn, businessEventId, costLineCount, summary, conflicts } = input;

  const eventRelated: readonly FlowRelatedObject[] = businessEventId
    ? [{ kind: "business_event", id: businessEventId, label: "立项事项" }]
    : [];

  const collected =
    typeof costLineCount === "number" ? costLineCount > 0 : hasCollectedCosts(summary);

  const conflictList = conflicts ?? [];
  const eligibleBase = parseAmount(summary.superDeductionEligibleBase);

  return buildObjectFlow([
    {
      key: "established",
      label: "立项",
      done: Boolean(startedOn),
      related: eventRelated,
      owner: "研发负责人"
    },
    {
      key: "costs",
      label: "归集研发费用",
      done: collected,
      owner: "财务"
    },
    {
      // 「可用」二字是有意的：有政策冲突时基数算得出来也不能拿去申报。
      key: "base",
      label: "形成可用的加计扣除基数",
      done: eligibleBase > 0 && conflictList.length === 0,
      blockedReason: conflictList.length > 0 ? conflictList.join("；") : null,
      owner: "财务"
    }
  ]);
}
