/**
 * H4 异常检测 Agent（规则型，金税四期风格，可留痕）
 *
 * 纯函数、确定性：不访问 DB/网络，不在函数内读取 Date.now()。
 * 所有日期均以调用方注入的 ISO 日期字符串（"YYYY-MM-DD"）表示，
 * 所有金额均以整数分（cents）表示，避免浮点误差。
 *
 * 产出统一结构 AnomalyFinding，供 inbox 卡片与风险勾稽（risk 模块）合流展示。
 */

export type AnomalySeverity = "info" | "warning" | "alert";

export interface AnomalyFinding {
  kind: string;
  severity: AnomalySeverity;
  title: string;
  detail: string;
  /** 关联的原始记录 id（或用于追溯的标识，如账期标签），用于跳转核实 */
  refs: string[];
}

const MS_PER_DAY = 86_400_000;

/** 将 "YYYY-MM-DD" 转为 UTC 纪元天数，用于日期差计算（确定性，不依赖当前时间） */
function toUtcDayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / MS_PER_DAY);
}

/** 返回 UTC 星期几（0=周日 ... 6=周六），非法日期返回 NaN */
function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** 按阈值分档：>= alertAt 为 alert，>= warnAt 为 warning，否则 info */
function tieredSeverity(value: number, warnAt: number, alertAt: number): AnomalySeverity {
  if (value >= alertAt) return "alert";
  if (value >= warnAt) return "warning";
  return "info";
}

/** 除零安全的比率计算，分母为 0 时返回 null（不可比较） */
function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

// ── 1. 重复付款 ──────────────────────────────────────────────────────────────

export interface PaymentEntryInput {
  id: string;
  payeeName: string;
  /** 整数分 */
  amountCents: number;
  entryDate: string;
  accountCode?: string;
}

const DEFAULT_DUPLICATE_WINDOW_DAYS = 3;

function buildDuplicatePaymentFinding(cluster: PaymentEntryInput[]): AnomalyFinding {
  // 调用方仅在 cluster.length >= 2 时调用本函数，故首元素必然存在。
  const first = cluster[0]!;
  const amountYuan = (first.amountCents / 100).toFixed(2);
  const dates = cluster.map((entry) => entry.entryDate).join("、");
  return {
    kind: "DUPLICATE_PAYMENT",
    severity: "alert",
    title: "疑似重复付款",
    detail: `收款方「${first.payeeName}」在 ${cluster.length} 笔记录中出现相同金额 ¥${amountYuan}，日期相近（${dates}），需人工核实是否重复付款。`,
    refs: cluster.map((entry) => entry.id)
  };
}

/**
 * 检测同收款方、同金额、日期相近（默认 3 天内）的疑似重复付款。
 * 按 payeeName + amountCents 分组，组内按日期排序后做滑动聚簇。
 */
export function detectDuplicatePayments(
  entries: PaymentEntryInput[],
  windowDays: number = DEFAULT_DUPLICATE_WINDOW_DAYS
): AnomalyFinding[] {
  const groups = new Map<string, PaymentEntryInput[]>();
  for (const entry of entries) {
    const key = `${entry.payeeName}|${entry.amountCents}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const findings: AnomalyFinding[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort(
      (a, b) => toUtcDayNumber(a.entryDate) - toUtcDayNumber(b.entryDate)
    );

    // bucket.length >= 2 已在上方校验，排序后不改变长度，故 sorted[0] 必然存在。
    let cluster: PaymentEntryInput[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i += 1) {
      const currentEntry = sorted[i]!;
      const previousEntry = sorted[i - 1]!;
      const gapDays = toUtcDayNumber(currentEntry.entryDate) - toUtcDayNumber(previousEntry.entryDate);
      if (gapDays <= windowDays) {
        cluster = [...cluster, currentEntry];
        continue;
      }
      if (cluster.length >= 2) findings.push(buildDuplicatePaymentFinding(cluster));
      cluster = [currentEntry];
    }
    if (cluster.length >= 2) findings.push(buildDuplicatePaymentFinding(cluster));
  }
  return findings;
}

// ── 2. 发票断号 ──────────────────────────────────────────────────────────────

export interface InvoiceNumberInput {
  id: string;
  invoiceNo: string;
  /** 发票代码，不同代码不参与同一号段比较 */
  invoiceCode?: string;
}

/** 拆分发票号为「非数字/固定前缀」与「末尾连续数字」两部分，用于号段排序 */
function splitInvoiceNo(invoiceNo: string): { prefix: string; digits: string } | null {
  const match = /^(.*?)(\d+)$/.exec(invoiceNo);
  if (!match) return null;
  // 正则含两个必选捕获组，match 非空时两组必然存在。
  return { prefix: match[1]!, digits: match[2]! };
}

interface InvoiceSequenceItem {
  entry: InvoiceNumberInput;
  prefix: string;
  digits: string;
  value: number;
}

/**
 * 检测同一前缀（同发票代码 + 同前缀 + 同位数）发票号的断号。
 * 无法解析出末尾数字的发票号（如纯字母编号）将被跳过，不参与断号判断。
 */
export function detectInvoiceGaps(invoices: InvoiceNumberInput[]): AnomalyFinding[] {
  const groups = new Map<string, InvoiceSequenceItem[]>();
  for (const entry of invoices) {
    const split = splitInvoiceNo(entry.invoiceNo);
    if (!split) continue;
    const key = `${entry.invoiceCode ?? ""}|${split.prefix}|${split.digits.length}`;
    const item: InvoiceSequenceItem = {
      entry,
      prefix: split.prefix,
      digits: split.digits,
      value: Number.parseInt(split.digits, 10)
    };
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const findings: AnomalyFinding[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort((a, b) => a.value - b.value);
    for (let i = 1; i < sorted.length; i += 1) {
      // bucket.length >= 2 已在上方校验，i 从 1 遍历到 sorted.length - 1，两侧下标必然存在。
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      const gap = curr.value - prev.value;
      if (gap <= 1) continue;

      const missingCount = gap - 1;
      const width = curr.digits.length;
      const firstMissing = `${prev.prefix}${String(prev.value + 1).padStart(width, "0")}`;
      const lastMissing = `${prev.prefix}${String(curr.value - 1).padStart(width, "0")}`;
      const missingLabel = missingCount === 1 ? firstMissing : `${firstMissing} ~ ${lastMissing}`;

      findings.push({
        kind: "INVOICE_NUMBER_GAP",
        severity: "warning",
        title: "发票号段疑似断号",
        detail: `发票号「${prev.entry.invoiceNo}」与「${curr.entry.invoiceNo}」之间缺失 ${missingCount} 张发票（${missingLabel}），需核实是否作废或漏录。`,
        refs: [prev.entry.id, curr.entry.id]
      });
    }
  }
  return findings;
}

// ── 3. 周末大额交易 ──────────────────────────────────────────────────────────

export interface AmountEntryInput {
  id: string;
  entryDate: string;
  /** 整数分 */
  amountCents: number;
  summary?: string;
}

const WEEKEND_ALERT_MULTIPLIER = 3;
const WEEKDAY_LABELS: Record<number, string> = { 0: "周日", 6: "周六" };

/**
 * 检测周六/周日发生且金额达到阈值的大额交易。
 * 金额达到 3 倍阈值时升级为 alert，否则为 warning。
 */
export function detectWeekendLargeAmounts(
  entries: AmountEntryInput[],
  thresholdCents: number
): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  for (const entry of entries) {
    const weekday = weekdayOf(entry.entryDate);
    if (Number.isNaN(weekday)) continue;
    const isWeekend = weekday === 0 || weekday === 6;
    if (!isWeekend) continue;
    if (entry.amountCents < thresholdCents) continue;

    const severity = tieredSeverity(
      entry.amountCents,
      thresholdCents,
      thresholdCents * WEEKEND_ALERT_MULTIPLIER
    );
    const amountLabel = (entry.amountCents / 100).toFixed(2);
    const thresholdLabel = (thresholdCents / 100).toFixed(2);
    const summarySuffix = entry.summary ? `：${entry.summary}` : "";

    findings.push({
      kind: "WEEKEND_LARGE_AMOUNT",
      severity,
      title: "周末发生大额交易",
      detail: `${entry.entryDate}（${WEEKDAY_LABELS[weekday]}）发生金额 ¥${amountLabel} 的交易${summarySuffix}，超过预警阈值 ¥${thresholdLabel}，需核实业务合理性。`,
      refs: [entry.id]
    });
  }
  return findings;
}

// ── 4. 税负率环比突变 ────────────────────────────────────────────────────────

export interface TaxBurdenPeriodInput {
  /** 账期标签，如 "2026-05"，按字典序排序即为时间序 */
  period: string;
  /** 整数分 */
  taxAmountCents: number;
  /** 整数分 */
  revenueCents: number;
}

const DEFAULT_TAX_BURDEN_WARN_RATIO = 0.03;
const TAX_BURDEN_ALERT_MULTIPLIER = 2;

/**
 * 检测税负率（税额/收入）环比变动超过阈值（默认 3 个百分点）的账期。
 * 收入为 0 的账期无法计算税负率，跳过比较（除零安全）。
 */
export function detectTaxBurdenSwing(
  periods: TaxBurdenPeriodInput[],
  warnRatio: number = DEFAULT_TAX_BURDEN_WARN_RATIO
): AnomalyFinding[] {
  const sorted = [...periods].sort((a, b) => a.period.localeCompare(b.period));
  const findings: AnomalyFinding[] = [];

  for (let i = 1; i < sorted.length; i += 1) {
    // i 从 1 遍历到 sorted.length - 1，两侧下标必然存在。
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const prevRate = safeRatio(prev.taxAmountCents, prev.revenueCents);
    const currRate = safeRatio(curr.taxAmountCents, curr.revenueCents);
    if (prevRate === null || currRate === null) continue;

    const delta = currRate - prevRate;
    const absDelta = Math.abs(delta);
    if (absDelta < warnRatio) continue;

    const severity = tieredSeverity(absDelta, warnRatio, warnRatio * TAX_BURDEN_ALERT_MULTIPLIER);
    findings.push({
      kind: "TAX_BURDEN_SWING",
      severity,
      title: "税负率环比大幅波动",
      detail: `${prev.period} → ${curr.period} 税负率由 ${(prevRate * 100).toFixed(2)}% 变为 ${(currRate * 100).toFixed(2)}%，环比变动 ${(delta * 100).toFixed(2)} 个百分点，超过预警阈值 ${(warnRatio * 100).toFixed(2)}%。`,
      refs: [prev.period, curr.period]
    });
  }
  return findings;
}

// ── 聚合入口 ─────────────────────────────────────────────────────────────────

export interface AnomalyScanInput {
  payments?: PaymentEntryInput[];
  duplicateWindowDays?: number;
  invoices?: InvoiceNumberInput[];
  weekendEntries?: AmountEntryInput[];
  weekendThresholdCents?: number;
  taxBurdenPeriods?: TaxBurdenPeriodInput[];
  taxBurdenWarnRatio?: number;
}

const DEFAULT_WEEKEND_THRESHOLD_CENTS = 5_000_000; // ¥50,000

/** 汇总全部规则型检测器的产出，供 inbox 卡片与风险勾稽合流展示 */
export function runAnomalyScan(input: AnomalyScanInput): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];

  if (input.payments) {
    findings.push(...detectDuplicatePayments(input.payments, input.duplicateWindowDays));
  }
  if (input.invoices) {
    findings.push(...detectInvoiceGaps(input.invoices));
  }
  if (input.weekendEntries) {
    findings.push(
      ...detectWeekendLargeAmounts(
        input.weekendEntries,
        input.weekendThresholdCents ?? DEFAULT_WEEKEND_THRESHOLD_CENTS
      )
    );
  }
  if (input.taxBurdenPeriods) {
    findings.push(...detectTaxBurdenSwing(input.taxBurdenPeriods, input.taxBurdenWarnRatio));
  }

  return findings;
}
