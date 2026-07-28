/**
 * 驾驶舱三问的纯逻辑。
 *
 * 为什么这一页**不拆任务切换器**（与 /ledger、/tax、/audit 的处理不同）：
 *
 * 1. 这一页没有「一件事」可做。TaskFocusShell 承载的是工作区——申报这个月的税、
 *    锁定已结账期间、审这一张凭证。驾驶舱的 6 个区块里没有一个是工作区，全部是
 *    只读读数，唯一的交互是点进别的页面。给只读读数装任务切换器，是把「一次一件事」
 *    当 tab 用。
 * 2. 受众与频次相反。会计一天进十几次凭证中心、每次只干一件；董事长一周进一次
 *    驾驶舱，要的恰恰是「整体如何」。拆成三个 tab，他必须点满三次才知道公司什么
 *    情况——而 TaskFocusShell 是「其余任务不进 DOM」，不是折叠，刷新还会回到默认 tab。
 * 3. 最硬的一条：待审批 / 阻塞 / 逾期 / 风险一旦被收进第二、第三个 tab，
 *    「有 3 张凭证等您审批」这个整页唯一的行动信号就默认不可见。/inbox 上一轮
 *    保持四张卡并列不拆 tab，正是同一个理由。
 * 4. ?task= 对这一页没有意义：分享驾驶舱链接分享的是「公司现状」，
 *    不是「我在做哪件事」。
 *
 * 但这一页确实有 V10 要治的病——6 个平级区块、13 张卡，没有阅读顺序，用户不知道
 * 该先看哪一块。对一张**报告页**，「一次一件事」的正确落法不是切分，而是归口与排序：
 * 每一段回答一个问题，段首先用一句话把结论说了，图表是这句话的展开。
 * 三个问题直接来自这一页自己的副标题：「公司赚不赚钱、钱够不够用、有没有风险」。
 *
 * 本模块负责那句结论——每一句都只由真实字段推出，后端给不出数时如实说「算不出」，
 * 不做任何估算或外推（这一页此前就栽在这上面，见 ChairmanDashboardPage 抬头）。
 */
import type { DashboardCard, DashboardData } from "../../lib/api";

export type ChairmanQuestionKey = "profit" | "cash" | "decisions";

/** 结论的语气。unknown = 数据不足，算不出，不是「没问题」。 */
export type ChairmanAnswerTone = "good" | "warn" | "unknown";

export interface ChairmanQuestion {
  key: ChairmanQuestionKey;
  /** 段落标题，用问句：段落存在的理由就是回答它。 */
  heading: string;
  /** 一句话结论，只由真实字段推出。 */
  answer: string;
  tone: ChairmanAnswerTone;
}

/**
 * 后端在没有账务数据时下发的占位串（modules/dashboard/routes.ts 的 hasLedgerData
 * 分支与 expense-slices 的口径一致）。见到它们就必须说「算不出」，不能当成 0。
 */
const NO_DATA_TOKENS = ["—", "-", ""] as const;

function isMissing(value: string | undefined | null): boolean {
  const raw = (value ?? "").trim();
  return NO_DATA_TOKENS.some((token) => raw === token);
}

function parseAmount(value: string): number | null {
  if (isMissing(value)) return null;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAmount(value: number): string {
  return `¥${Math.round(value).toLocaleString("zh-CN")}`;
}

function findCard(cards: readonly DashboardCard[], key: string): DashboardCard | null {
  return cards.find((card) => card.key === key) ?? null;
}

function buildProfitAnswer(profitOverview: DashboardData["profitOverview"]): { answer: string; tone: ChairmanAnswerTone } {
  const netProfit = parseAmount(profitOverview.netProfit);
  if (netProfit === null) {
    return { answer: "本期还没有账务数据，算不出盈亏。", tone: "unknown" };
  }
  const margin = isMissing(profitOverview.netMargin) ? null : profitOverview.netMargin;
  const marginSuffix = margin ? `，净利率 ${margin}` : "";
  if (netProfit < 0) {
    return { answer: `本期亏损 ${formatAmount(Math.abs(netProfit))}${marginSuffix}。`, tone: "warn" };
  }
  return { answer: `本期净利 ${formatAmount(netProfit)}${marginSuffix}。`, tone: "good" };
}

function buildCashAnswer(cards: readonly DashboardCard[]): { answer: string; tone: ChairmanAnswerTone } {
  const cash = findCard(cards, "cash");
  const receivables = findCard(cards, "receivables");

  if (!cash || isMissing(cash.value)) {
    return { answer: "本期还没有账务数据，算不出可动用资金。", tone: "unknown" };
  }

  const receivableSuffix =
    receivables && !isMissing(receivables.value) ? `，另有 ¥${receivables.value} 待回款` : "";
  return { answer: `账上可动用 ¥${cash.value}${receivableSuffix}。`, tone: "good" };
}

/**
 * 四个队列不相加成一个总数：一个风险发现完全可能同时是一条阻塞任务，
 * 加起来会把同一件事数两遍。分开列出，一件不多一件不少。
 */
function buildDecisionAnswer(
  queues: DashboardData["queues"],
  riskCount: number
): { answer: string; tone: ChairmanAnswerTone } {
  const parts = [
    queues.approvals > 0 ? `${queues.approvals} 张凭证等您审批` : null,
    queues.blockedTasks > 0 ? `${queues.blockedTasks} 项任务卡住了` : null,
    queues.overdueTasks > 0 ? `${queues.overdueTasks} 项任务已逾期` : null,
    riskCount > 0 ? `${riskCount} 个高风险事项待处理` : null
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return { answer: "目前没有需要您拍板的事。", tone: "good" };
  }
  return { answer: `${parts.join("，")}。`, tone: "warn" };
}

export function buildChairmanQuestions(data: DashboardData): ChairmanQuestion[] {
  const profit = buildProfitAnswer(data.profitOverview);
  const cash = buildCashAnswer(data.cards);
  const decisions = buildDecisionAnswer(data.queues, data.riskCount);

  return [
    { key: "profit", heading: "公司赚不赚钱？", ...profit },
    { key: "cash", heading: "钱够不够用？", ...cash },
    { key: "decisions", heading: "有没有事要我拍板？", ...decisions }
  ];
}
