/**
 * 三单匹配（V13 残留 7）。
 *
 * 「三单」= **合同期次**（约定要付多少）、**验收**（东西真的收到了多少）、
 * **发票**（对方开了多少票）。
 *
 * ## 一条都不 block
 *
 * 三种不一致都有完全正当的业务解释：
 *
 * | 现象 | 正当解释 |
 * |---|---|
 * | 付款 > 验收 | 预付款、定金——合同里明明白白写着 |
 * | 开票 > 验收 | 供应商按合同节点开票，货还在路上 |
 * | 验收 > 开票 | 货到了票没来，月底常态 |
 *
 * 拦死任何一种都会让正常业务卡住。**三单匹配的价值不是「拦」，是让审批人
 * 看见**——他知道这单是预付还是正常结算，才判断得了该不该批。
 *
 * 这与 D 批次「只有重复报销是 block」是同一个标准：误报代价（正常业务
 * 办不了）高于漏报代价（多看一眼）时，就不该 block。
 *
 * ## null 与 0 是不同的语义
 *
 * `null` = 没有这类记录（合同不需要验收 / 还没开票），不做相应判定；
 * `0` = 有记录但金额为零，正常参与比较。
 *
 * 混淆这两者会让不需要验收的合同永远带着一条「未验收」告警——而那种
 * 永远消不掉的告警，用户学会的第一件事就是无视它。
 */

import type { ControlCheckResult } from "../controls/result.js";

export interface ThreeWayMatchInput {
  /** 合同期次约定金额。 */
  scheduleAmountCents: number;
  /** 累计已验收金额；`null` 表示该合同没有验收环节。 */
  acceptedAmountCents: number | null;
  /** 累计已开票金额；`null` 表示还没有任何发票记录。 */
  invoicedAmountCents: number | null;
  /** 本期次此前累计已付。 */
  paidAmountCents: number;
  /** 本次请求付款的金额。 */
  requestedPaymentCents: number;
}

function yuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

function assertCents(value: number | null, label: string): void {
  if (value === null) return;
  if (!Number.isInteger(value)) {
    throw new Error(`${label} 必须是整数分，收到 ${value}`);
  }
  if (value < 0) {
    throw new Error(`${label} 不得为负，收到 ${value}`);
  }
}

export function matchThreeWay(input: ThreeWayMatchInput): ControlCheckResult[] {
  assertCents(input.scheduleAmountCents, "期次金额");
  assertCents(input.acceptedAmountCents, "已验收金额");
  assertCents(input.invoicedAmountCents, "已开票金额");
  assertCents(input.paidAmountCents, "已付金额");
  assertCents(input.requestedPaymentCents, "本次付款金额");

  const findings: ControlCheckResult[] = [];
  const { acceptedAmountCents, invoicedAmountCents } = input;

  // 累计付款：只看本次会让「已付 800、验收 400、本次再付 100」被判为正常。
  const totalPayment = input.paidAmountCents + input.requestedPaymentCents;

  if (acceptedAmountCents !== null) {
    if (totalPayment > acceptedAmountCents) {
      findings.push({
        level: "warn",
        code: "match.payment_exceeds_acceptance",
        message:
          `累计付款 ${yuan(totalPayment)} 元将超过已验收金额 ${yuan(acceptedAmountCents)} 元。` +
          `如果是合同约定的预付款可以放行，否则请先完成验收。`
      });
    }

    if (acceptedAmountCents > input.scheduleAmountCents) {
      findings.push({
        level: "warn",
        code: "match.acceptance_exceeds_schedule",
        message:
          `已验收 ${yuan(acceptedAmountCents)} 元超过本期约定金额 ` +
          `${yuan(input.scheduleAmountCents)} 元，请核对验收单是否记错了期次。`
      });
    }

    if (invoicedAmountCents !== null) {
      if (invoicedAmountCents > acceptedAmountCents) {
        findings.push({
          level: "warn",
          code: "match.invoice_exceeds_acceptance",
          message:
            `已开票 ${yuan(invoicedAmountCents)} 元多于已验收 ${yuan(acceptedAmountCents)} 元。` +
            `先票后货在税务上有进项抵扣时点的问题，请确认。`
        });
      } else if (acceptedAmountCents > invoicedAmountCents) {
        // 措辞是「待催票」而不是「异常」——货到票没来是月底常态，
        // 提示的价值在于提醒去催，用异常的口吻会让它和真问题混在一起。
        findings.push({
          level: "warn",
          code: "match.acceptance_exceeds_invoice",
          message:
            `已验收 ${yuan(acceptedAmountCents)} 元但只开了 ${yuan(invoicedAmountCents)} 元的票，` +
            `差额 ${yuan(acceptedAmountCents - invoicedAmountCents)} 元待催票。`
        });
      }
    }
  }

  return findings;
}
