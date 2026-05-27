export type LedgerSceneKey = "summary" | "balances" | "journal" | "entries" | "periods";

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
  { key: "periods", title: "期间锁账", description: "管理会计期间锁定状态，保护已关闭账期。", emoji: "🔒" }
];

export function isLedgerSceneKey(value: string): value is LedgerSceneKey {
  return LEDGER_SCENE_OPTIONS.some((option) => option.key === value);
}
