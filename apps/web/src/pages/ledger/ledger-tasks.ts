/**
 * /ledger 承载哪几件事（纯逻辑）。
 *
 * 改造前这一页把 7 个平级区块一次摊开：页头、全站导航条、场景摘要、5 张场景卡、
 * 场景内容、右侧上下文面板——用户要先在「五个场景 + 两块摘要」里挑出自己要做的事，
 * 而摘要和上下文面板讲的又是同一批数字（分录数、批次数、过滤条件），重复占屏。
 *
 * 现在按「一次只做一件事」重新归口：五个场景成为五件事，TaskFocusShell 一次只渲染
 * 一件事的工作区；场景摘要的标题/说明并入任务本身的 label/description，其余数字
 * 并入随任务收缩的上下文面板（见 LedgerContextPanel）。
 *
 * 「期间锁账」刻意排在最后并单独措辞：前四件是查账（只读钻取），它是月结控制
 * （会改变别人能不能过账），把它和查账混为一谈会让用户误以为只是换个视图。
 */
import type { AccountingPeriod } from "../../lib/api";
import type { TaskDef } from "../../lib/task-focus";
import { LEDGER_SCENE_OPTIONS, type LedgerSceneKey, isLedgerSceneKey } from "./types";

/** 任务 key 沿用场景 key：URL 与既有深链（?ledgerTab=periods）保持同一套取值。 */
export const LEDGER_TASK_KEYS = {
  summary: "summary",
  balances: "balances",
  journal: "journal",
  entries: "entries",
  periods: "periods"
} as const satisfies Record<LedgerSceneKey, LedgerSceneKey>;

/** V10 起在 URL 上承载「当前在做哪件事」的参数名（与 /tax、/risk 对齐）。 */
export const LEDGER_TASK_QUERY_KEY = "task";

/**
 * 改造前的参数名。lib/scene-commands.ts 里的「锁账」快捷指令仍指向
 * /ledger?ledgerTab=periods，用户的书签也可能带着它，所以读的时候必须继续认。
 */
export const LEGACY_LEDGER_TASK_QUERY_KEY = "ledgerTab";

export const DEFAULT_LEDGER_TASK: LedgerSceneKey = "summary";

/**
 * 从 URL 参数解析当前任务：新参数优先，缺省时回落到旧参数，都不合法时用默认值。
 * 做成纯函数是为了让「旧深链还能用」这件事可被单测钉住。
 */
export function readLedgerTask(params: URLSearchParams): LedgerSceneKey {
  const next = params.get(LEDGER_TASK_QUERY_KEY);
  if (next && isLedgerSceneKey(next)) {
    return next;
  }
  const legacy = params.get(LEGACY_LEDGER_TASK_QUERY_KEY);
  if (legacy && isLedgerSceneKey(legacy)) {
    return legacy;
  }
  return DEFAULT_LEDGER_TASK;
}

/**
 * 写入当前任务：只留新参数，并清掉旧参数。
 * 两个参数同时留在 URL 上，下一次读会出现「谁说了算」的歧义，也会让分享出去的
 * 链接自带一个永远不会更新的值。
 */
export function writeLedgerTask(params: URLSearchParams, task: LedgerSceneKey): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(LEDGER_TASK_QUERY_KEY, task);
  next.delete(LEGACY_LEDGER_TASK_QUERY_KEY);
  return next;
}

/** 还没锁的会计期间数 —— 「期间锁账」这件事唯一真实的待办量。 */
export function countUnlockedPeriods(periods: readonly AccountingPeriod[]): number {
  return periods.filter((period) => !period.isLocked).length;
}

/** 任务名用动词短语，说清「在这里做什么」，而不是罗列这个视图叫什么。 */
const LEDGER_TASK_TEXT: Record<LedgerSceneKey, { label: string; description: string }> = {
  summary: {
    label: "看科目发生额总览",
    description: "按科目看本账套累计的借方、贷方发生额，先判断账覆盖到哪儿，再决定往哪一层钻。"
  },
  balances: {
    label: "复核科目余额",
    description: "月结前逐个科目核对余额结构；发现异常科目，再切到「追一笔分录的来源」查它是怎么来的。"
  },
  journal: {
    label: "对现金银行流水",
    description: "按现金或银行账、按日期区间拉资金流水，用来和银行回单核对钱的实际收付。"
  },
  entries: {
    label: "追一笔分录的来源",
    description: "按凭证号或经营事项号定位，看这一笔过账形成了哪些分录、走的是哪个过账批次。"
  },
  periods: {
    label: "锁定已结账期间",
    description: "月结控制，不是查账：把已经结完的月份锁住（或在纠错时解锁），锁上之后该期间不能再过账。"
  }
};

export interface LedgerTaskInput {
  /** 会计期间清单，用于「还有几个期间没锁」的角标。 */
  periods: readonly AccountingPeriod[];
}

/**
 * 构造任务列表。
 *
 * 只有「锁定已结账期间」挂角标：前四件事是查账，条数多少不等于「有几件事要办」，
 * 把分录总数挂成红角标只会制造假紧迫感。未锁期间数则是实打实的待办。
 * 顺序固定按查账 → 控制排列，不按角标排序（位置一变，用户的肌肉记忆就废了）。
 */
export function buildLedgerTasks({ periods }: LedgerTaskInput): TaskDef[] {
  return LEDGER_SCENE_OPTIONS.map((option) => {
    const text = LEDGER_TASK_TEXT[option.key];
    return {
      key: option.key,
      label: text.label,
      description: text.description,
      ...(option.key === "periods" ? { badge: countUnlockedPeriods(periods) } : {})
    };
  });
}
