/**
 * 账簿口径的增值税底稿（V12-D2 后续 / 蓝图批次 B 残留 4）。
 *
 * ## 底稿此前与账簿是两套算法
 *
 * 现有底稿（`vat-working-paper.ts`）从 `tax_items` 取数：按 `treatment` 字符串
 * 判断是销项还是进项，拿 `basis` 乘一个重算出来的税率。而账务从 `ledger_entries`
 * 按增值税科目取余额。两者算的是同一个数，但**取数源与口径完全不同**，
 * 必然对不上——对不上时也说不清是哪边错。
 *
 * ## 从账簿取数之后，底稿不再需要税率
 *
 * 这是这次改造最要紧的一点：税额是**记账那一刻算好并入账的那个数**，
 * 不是事后用税率重算出来的。底稿只负责把账上已有的数按申报表口径归集。
 * 税率的用武之地因此收窄到两处——录入时算税额、复核时验算，
 * 而不再是"每次打开底稿都重算一遍"。
 *
 * 直接后果：账与税必然一致。它们本来就是同一份数据的两种呈现。
 *
 * ## 差异对比而不是直接替换
 *
 * 旧口径没有立刻删掉：`tax_items` 是现有的录入路径，贸然切换会让已录但未入账
 * 的税目从底稿上消失。改为**同时给出两个口径与它们的差额**——差额本身就是
 * 最有价值的产出：它等于"记了账没录税目"或"录了税目没记账"的金额，
 * 正是月结时要清的那类尾巴。
 */

/** 一条账簿口径的底稿明细，直接对应一条总账分录。 */
export interface LedgerVatLine {
  entryId: string;
  voucherId: string;
  entryDate: string;
  summary: string;
  accountCode: string;
  accountName: string;
  /** 税额（分）。销项取贷方、进项取借方，均以正数表示。 */
  amountCents: number;
  role: "output" | "input" | "inputTransferOut" | "taxPaid" | "simplified" | "other";
}

export interface LedgerVatPaper {
  period: string;
  outputTaxCents: number;
  inputTaxCents: number;
  inputTransferOutCents: number;
  taxPaidCents: number;
  simplifiedCents: number;
  /**
   * 本期应纳税额 = 销项 − 进项 + 进项税额转出 + 简易计税。
   *
   * **不减已交税金**：已交税金是"已经缴掉的钱"，不是"应纳税额"的减项。
   * 申报表上应纳税额与已缴税额是两行，混在一起会让申报表填不出来。
   * 二者的轧差是月末结转（`vat-settlement.ts`）的事，不是底稿的事。
   */
  payableCents: number;
  lines: LedgerVatLine[];
}

/** 一条总账分录在增值税底稿里的角色与金额。 */
export interface LedgerEntryForVat {
  entryId: string;
  voucherId: string;
  entryDate: string;
  summary: string;
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  role: LedgerVatLine["role"];
}

/**
 * 按角色取该分录在底稿上的金额。
 *
 * 每个专栏都有其正常方向：销项在贷方、进项在借方。取**净额**而不是单侧，
 * 是因为红冲分录会走反方向——一笔销项红冲记在借方，若只取贷方，
 * 红冲等于没发生，底稿会比账簿多出一笔已经冲掉的税。
 */
export function signedAmountFor(entry: LedgerEntryForVat): number {
  switch (entry.role) {
    case "output":
    case "inputTransferOut":
    case "simplified":
      // 贷方为正
      return entry.creditCents - entry.debitCents;
    case "input":
    case "taxPaid":
      // 借方为正
      return entry.debitCents - entry.creditCents;
    default:
      return 0;
  }
}

export function buildLedgerVatPaper(
  period: string,
  entries: readonly LedgerEntryForVat[]
): LedgerVatPaper {
  let outputTaxCents = 0;
  let inputTaxCents = 0;
  let inputTransferOutCents = 0;
  let taxPaidCents = 0;
  let simplifiedCents = 0;
  const lines: LedgerVatLine[] = [];

  for (const entry of entries) {
    const amount = signedAmountFor(entry);
    switch (entry.role) {
      case "output":
        outputTaxCents += amount;
        break;
      case "input":
        inputTaxCents += amount;
        break;
      case "inputTransferOut":
        inputTransferOutCents += amount;
        break;
      case "taxPaid":
        taxPaidCents += amount;
        break;
      case "simplified":
        simplifiedCents += amount;
        break;
      default:
        break;
    }

    // 净额为 0 的分录不列（红冲与被冲的一对会各自留一行，合计为 0，
    // 但它们各自都是真实发生过的记账动作，明细里该看得见）
    if (entry.role !== "other") {
      lines.push({
        entryId: entry.entryId,
        voucherId: entry.voucherId,
        entryDate: entry.entryDate,
        summary: entry.summary,
        accountCode: entry.accountCode,
        accountName: entry.accountName,
        amountCents: amount,
        role: entry.role
      });
    }
  }

  return {
    period,
    outputTaxCents,
    inputTaxCents,
    inputTransferOutCents,
    taxPaidCents,
    simplifiedCents,
    payableCents: outputTaxCents - inputTaxCents + inputTransferOutCents + simplifiedCents,
    lines
  };
}

export interface PaperReconciliation {
  /** 账簿口径的应纳税额（分）。 */
  ledgerPayableCents: number;
  /** `tax_items` 口径的应纳税额（分）。 */
  itemsPayableCents: number;
  /** 账簿 − 税目。正数表示记了账但没录税目，负数表示录了税目但没记账。 */
  differenceCents: number;
  consistent: boolean;
  message: string;
}

/**
 * 两个口径的差额对比。
 *
 * **不凑平、不选边**：差额为正说明有业务记了账却没录税目（申报会少报），
 * 为负说明录了税目却没记账（账面少记负债）。两种都是要人去查的真问题，
 * 系统能做的是把方向和金额说清楚。与期初建账、余额调节表同一个原则。
 */
export function reconcilePapers(
  ledgerPayableCents: number,
  itemsPayableCents: number
): PaperReconciliation {
  const differenceCents = ledgerPayableCents - itemsPayableCents;
  if (differenceCents === 0) {
    return {
      ledgerPayableCents,
      itemsPayableCents,
      differenceCents,
      consistent: true,
      message: "账簿口径与税目口径一致。"
    };
  }

  const amount = (Math.abs(differenceCents) / 100).toFixed(2);
  const cause =
    differenceCents > 0
      ? `有 ${amount} 的税额记了账但没有对应的税目记录——申报时会少报`
      : `有 ${amount} 的税额录了税目但没有入账——账面少记了这笔负债`;
  return {
    ledgerPayableCents,
    itemsPayableCents,
    differenceCents,
    consistent: false,
    message: `${cause}。系统不会自动抹平这个差额，请核对本期的凭证与税目记录。`
  };
}
