/**
 * 报销单的业财合规审核（V13-D1/D2/D3/D4）。
 *
 * ## 四类校验共用一个结果形状
 *
 * `ControlCheckResult`（V13-A 的 `controls/result.ts`）。批次 A 抽它出来时
 * 只有预算与超标两个消费方，现在是六个——审批流引擎因此只需要认识一种结构，
 * 每加一类校验不用改引擎。
 *
 * ## 级别的分配
 *
 * | 校验 | 级别 | 理由 |
 * |---|---|---|
 * | 重复报销 | `block` | 判定确定性高（同一张票号），且是真金白银的漏洞 |
 * | 抬头/税号不符 | `warn` | 分公司抬头、简称、录入笔误都可能造成，一律拦死会误伤 |
 * | 超标 | 按标准配置 | `block` / `warn` / `escalate` 由制度决定，不由代码决定 |
 * | 金额超过发票 | `warn` | 一张票对多行、含税口径差都可能，审批人看一眼比拦住合适 |
 *
 * **只有重复报销是 block**。这不是保守，是因为其余三类的误报代价（正常报销
 * 提不上来）高于漏报代价（审批人多看一眼）。
 *
 * ## 关于「三单匹配」
 *
 * 蓝图里写的是「合同-发票-验收」三单匹配。**FT 没有验收单据**，所以这里
 * 实现的是报销行与发票的金额一致性（两单）。合同侧的匹配在付款环节由
 * 付款计划的超付拦截承担（V13-C）。验收单不在 V13 范围内，记入残留清单——
 * 不假装三单都匹配了。
 */

import type { ControlCheckResult } from "../controls/result.js";
import { checkExpenseStandard } from "../expense-standards/check.js";
import { matchExpenseStandard, type ExpenseStandard } from "../expense-standards/match.js";

export interface AuditLine {
  lineId: string;
  expenseType: string;
  amountCents: number;
  quantity: number;
  invoiceId: string | null;
}

export interface AuditInvoice {
  invoiceNo: string;
  buyerName: string | null;
  buyerTaxNo: string | null;
  totalAmountCents: number;
}

export interface AuditContext {
  company: { name: string; creditCode: string | null };
  lines: readonly AuditLine[];
  /** 本单引用的发票明细，按 invoiceId 索引。 */
  invoices: ReadonlyMap<string, AuditInvoice>;
  /** **已被其他单据占用**的发票 id。由调用方查库得出。 */
  usedInvoiceIds: ReadonlySet<string>;
  standards: readonly ExpenseStandard[];
  /** 判定基准日（费用发生日）。 */
  onDate: string;
  gradeCode: string | null;
  cityTier: string | null;
}

/** 审核结论。`lineId` 指出是哪一行——一张单十几行时，只说「超标了」没用。 */
export interface AuditFinding extends ControlCheckResult {
  lineId: string | null;
}

function yuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function auditReimbursement(context: AuditContext): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // 同单内重复用票：库上的唯一约束会挡住，但那报出来的是数据库错误。
  const seenInThisForm = new Set<string>();

  for (const line of context.lines) {
    // ── D1 重复报销 ────────────────────────────────────────────
    if (line.invoiceId !== null) {
      if (context.usedInvoiceIds.has(line.invoiceId)) {
        findings.push({
          lineId: line.lineId,
          level: "block",
          code: "audit.duplicate_invoice",
          message: `该发票已在其他报销单中使用过，不能重复报销。`
        });
      } else if (seenInThisForm.has(line.invoiceId)) {
        findings.push({
          lineId: line.lineId,
          level: "block",
          code: "audit.duplicate_invoice_in_form",
          message: `同一张发票在本单中出现了两次。`
        });
      }
      seenInThisForm.add(line.invoiceId);
    }

    const invoice = line.invoiceId !== null ? context.invoices.get(line.invoiceId) : undefined;

    // ── D2 票据合规：抬头与税号 ────────────────────────────────
    if (invoice) {
      // 抬头与税号分开报：抬头对而税号错，通常是开票方录错税号——那是
      // 发票本身有问题，与抬头开错不是一回事，分开才知道该找谁改。
      if (invoice.buyerName !== null && invoice.buyerName !== context.company.name) {
        findings.push({
          lineId: line.lineId,
          level: "warn",
          code: "audit.invoice_title_mismatch",
          message:
            `发票抬头是「${invoice.buyerName}」，与公司名称「${context.company.name}」不一致。` +
            `如果是分公司抬头可以忽略，否则请换开。`
        });
      }

      // 公司没录统一社会信用代码时跳过：没录就没法比，报出来会指向一个
      // 用户改不了的问题。
      if (
        context.company.creditCode !== null &&
        invoice.buyerTaxNo !== null &&
        invoice.buyerTaxNo !== context.company.creditCode
      ) {
        findings.push({
          lineId: line.lineId,
          level: "warn",
          code: "audit.invoice_tax_no_mismatch",
          message: `发票上的购方税号与公司统一社会信用代码不一致，请核对后换开。`
        });
      }

      // ── D4 金额一致性 ──────────────────────────────────────
      //
      // **只查「报得比票多」**。报得比票少是合法的：发票 1000 元只报 800
      //（另 200 自费）在制度上完全允许，报出来纯属噪音。
      if (line.amountCents > invoice.totalAmountCents) {
        findings.push({
          lineId: line.lineId,
          level: "warn",
          code: "audit.amount_exceeds_invoice",
          message:
            `报销金额 ${yuan(line.amountCents)} 元超过发票金额 ${yuan(invoice.totalAmountCents)} 元。`
        });
      }
    }

    // ── D3 超标 ────────────────────────────────────────────────
    const standard = matchExpenseStandard(context.standards, {
      expenseType: line.expenseType,
      gradeCode: context.gradeCode,
      cityTier: context.cityTier,
      onDate: context.onDate
    });
    const standardResult = checkExpenseStandard({
      standard,
      actualCents: line.amountCents,
      quantity: line.quantity
    });
    // `standard.none`（没配标准）与 `standard.ok`（没超）都不报——
    // 前者是合法状态，后者是正常结果，报出来只会淹没真正的问题。
    if (standardResult.code === "standard.overrun") {
      findings.push({
        lineId: line.lineId,
        level: standardResult.level,
        code: standardResult.code,
        message: standardResult.message
      });
    }
  }

  return findings;
}
