/**
 * 期初建账的前端接口（V15 补的前台入口）。
 *
 * ## 后端 V12-B4 就做完了，一直没有前台入口
 *
 * 三个接口、两个测试文件（含集成测试）、细致的错误码——但页面上录不了。
 * **新公司迁进 FT 建不了账**，这是「后端有能力、没入口」里后果最重的一次：
 * 前面几次是某个功能用不了，这一次是整个系统用不起来。
 *
 * ## 错误码要用上，不能只显示 message
 *
 * 后端为建账场景专门设计了带载荷的失败码：借贷不平给出差额、坏科目给出
 * 具体是哪几个。建账一次要录几十行，只回一句「校验失败」等于让人逐行猜。
 */

import { getStoredToken, request } from "./api";

export interface OpeningBalanceLine {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface OpeningBalanceSummary {
  voucherId: string;
  openingDate: string;
  period: string;
  totalDebit: string;
  totalCredit: string;
  lineCount: number;
  lines: OpeningBalanceLine[];
}

/** 建账失败的结构化载荷。**每一种都要在界面上用出来**。 */
export type OpeningBalanceFailure =
  | {
      code:
        | "OPENING_BALANCE_EMPTY"
        | "OPENING_BALANCE_EXISTS"
        | "PERIOD_LOCKED"
        | "OPENING_DATE_INVALID"
        | "OPENING_BALANCE_INVALID_LINES"
        | "VOUCHER_NOT_BALANCED";
      error: string;
    }
  | {
      code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_NOT_LEAF" | "ACCOUNT_INACTIVE";
      error: string;
      /** 出问题的科目编码。界面上要高亮到具体行。 */
      offendingCodes: string[];
    }
  | {
      code: "OPENING_BALANCE_FORBIDDEN_ACCOUNT";
      error: string;
      offendingCodes: string[];
      reason: string;
    }
  | {
      code: "OPENING_BALANCE_NOT_BALANCED";
      error: string;
      totalDebit: string;
      totalCredit: string;
      /** 借方 − 贷方。正数表示贷方少了，负数表示借方少了。 */
      difference: string;
    };

/** 建账失败时抛这个，让调用方拿得到结构化载荷而不只是一句话。 */
export class OpeningBalanceError extends Error {
  readonly failure: OpeningBalanceFailure;

  constructor(failure: OpeningBalanceFailure) {
    super(failure.error);
    this.name = "OpeningBalanceError";
    this.failure = failure;
  }
}

/** 已录入的期初余额。没建过账时返回 `null`——**不是空数组**：两者语义不同。 */
export async function getOpeningBalances() {
  return request<{ openingBalances: OpeningBalanceSummary | null }>(
    "/api/ledger/opening-balances"
  );
}

export interface CreateOpeningBalanceInput {
  openingDate: string;
  lines: Array<{ accountCode: string; debit: string; credit: string; summary?: string | null }>;
}

/**
 * 录入期初余额。
 *
 * 不走通用的 `request`：它把错误压成一句话，而建账正需要那些载荷
 * （差额是多少、哪几个科目不能用）。
 */
export async function createOpeningBalances(
  input: CreateOpeningBalanceInput
): Promise<OpeningBalanceSummary> {
  const res = await fetch("/api/ledger/opening-balances", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getStoredToken() ?? ""}`
    },
    body: JSON.stringify(input)
  });

  const payload = (await res.json().catch(() => null)) as
    | (OpeningBalanceFailure & OpeningBalanceSummary)
    | null;

  if (!res.ok) {
    if (payload && "code" in payload) throw new OpeningBalanceError(payload);
    throw new Error(`建账失败（HTTP ${res.status}）`);
  }
  if (!payload) throw new Error("建账返回为空");
  return payload as OpeningBalanceSummary;
}

/** 撤销重录。**已有业务分录时后端会拒**——撤销会让那些分录失去期初基础。 */
export async function deleteOpeningBalances() {
  return request<{ deleted: boolean; voucherId: string }>("/api/ledger/opening-balances", {
    method: "DELETE"
  });
}

// ── 试算平衡表（V15 补的前台入口，后端已有完整实现）──────────────────

export type OpeningBasis = "inception" | "fiscal_year";

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  category: string | null;
  /** 该行期初栏用的是哪种口径，界面据此加脚注。 */
  openingBasis: OpeningBasis;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
  /** false 表示账上有这个编码、科目表里却没有——数据完整性问题，须人工介入。 */
  isRegistered: boolean;
  isEmpty: boolean;
}

export interface TrialBalanceColumnTotals {
  debit: string;
  credit: string;
  /** 借 − 贷。**非零即异常**。 */
  difference: string;
  isBalanced: boolean;
}

export interface TrialBalanceReport {
  period: string;
  startDate: string;
  endDate: string;
  fiscalYearStart: string;
  rows: TrialBalanceRow[];
  totals: {
    opening: TrialBalanceColumnTotals;
    period: TrialBalanceColumnTotals;
    closing: TrialBalanceColumnTotals;
  };
  /** 三组合计全部借贷相等才为 true。 */
  isBalanced: boolean;
  warnings: string[];
  total: number;
}

export async function getTrialBalance(period: string) {
  return request<TrialBalanceReport>(
    `/api/reports/trial-balance?period=${encodeURIComponent(period)}`
  );
}

// ── 年度结转（V15 补的前台入口，后端是 V12-B5）─────────────────────────

export interface FiscalYearRow {
  id: string;
  year: number;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  closingVoucherId: string | null;
  /** 该年度的净利润。未结转时为 null——**不是 0**，两者语义不同。 */
  netProfit: string | null;
  closedAt: string | null;
  closedBy: string | null;
}

export async function listFiscalYears() {
  return request<{ fiscalYears: FiscalYearRow[] }>("/api/ledger/fiscal-years");
}

export interface CloseFiscalYearResult {
  /** 已经结过就返回 true，不再生成第二张凭证。 */
  alreadyClosed: boolean;
  year: number;
  netProfit: string;
  voucherId: string;
  fiscalYear: FiscalYearRow;
}

/**
 * 年末结转：把本年利润（3131）结转到未分配利润（3141）。
 *
 * 后端会拒绝的两种情况都要在界面上说清楚：
 * 十二个月里还有月份没做损益结转、上一年度还没结账。
 */
export async function closeFiscalYear(year: number) {
  return request<CloseFiscalYearResult>(
    `/api/ledger/fiscal-years/${encodeURIComponent(String(year))}/close`,
    { method: "POST" }
  );
}
