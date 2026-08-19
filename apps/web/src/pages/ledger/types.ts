export type LedgerSceneKey =
  | "summary"
  | "balances"
  | "journal"
  | "entries"
  // V15：期初建账。后端 V12-B4 就做完了，一直没有前台入口——
  // 没有它，新公司迁进 FT 建不了账，后面所有的账都没有起点。
  | "opening"
  | "periods"
  | "revaluation";

export interface JournalItem {
  id: string;
  accountCode: string;
  accountName: string;
  summary: string;
  debit: string;
  credit: string;
  balance: string;
  postedAt: string;
  voucherId: string;
}

export type LedgerSummaryItem = {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
};

export type LedgerBalanceItem = LedgerSummaryItem & {
  balance: string;
};

export type LedgerSceneOption = {
  key: LedgerSceneKey;
  title: string;
  description: string;
  emoji: string;
};

export const LEDGER_SCENE_OPTIONS: LedgerSceneOption[] = [
  { key: "summary", title: "科目汇总", description: "查看累计借贷发生额，快速判断总账覆盖范围。", emoji: "📚" },
  { key: "balances", title: "科目余额", description: "按科目查看借贷累计与余额，适合月结前复核。", emoji: "🧮" },
  { key: "journal", title: "现金/银行日记账", description: "按资金账类型与日期区间加载资金流水。", emoji: "💸" },
  { key: "entries", title: "总账分录", description: "按凭证或事项过滤分录与过账批次。", emoji: "🧾" },
  { key: "opening", title: "期初建账", description: "把启用系统之前的账面余额一次性录进来。", emoji: "🏁" },
  { key: "periods", title: "期间锁账", description: "管理会计期间锁定状态，保护已关闭账期。", emoji: "🔒" },
  // V12-D5。与「期间锁账」同属月结控制而非查账：它会生成凭证、改变损益。
  { key: "revaluation", title: "外币调汇", description: "维护汇率并按期末汇率重估外币货币性项目。", emoji: "💱" }
];

export function isLedgerSceneKey(value: string): value is LedgerSceneKey {
  return LEDGER_SCENE_OPTIONS.some((option) => option.key === value);
}
