import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaxPaymentEntry } from "./TaxPaymentEntry";

/**
 * 税款缴纳记录的录入（V17 阶段三批次 B）。
 *
 * ## 为什么入口要在附加税旁边
 *
 * 附加税以实缴增值税为计税依据。用户在这一块看到的是
 * 「本期增值税还没有缴纳记录，等主税缴纳后即可计算」——
 * **该做的事的入口就应该在这句话旁边**，而不是让用户去别的页面找。
 *
 * 缴款记录只能改库的话，所有公司的附加税都停在「待主税缴纳后计算」，
 * 比之前那个一分钱不算的空页面还难解释：用户会以为系统坏了。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(TaxPaymentEntry, {
      filingPeriod: "2026-08",
      payments: [],
      onCreated: () => {},
      ...props
    } as never)
  );
}

// ── 录入入口在页面上 ────────────────────────────────────────────────────
{
  const html = render();
  assert(html.includes("缴款") || html.includes("缴纳"), "要有缴款登记的入口");
  assert(html.includes("2026-08"), "属期跟着当前查询的属期走，不让用户重填一遍");
}

// ── 说清为什么要登记 ────────────────────────────────────────────────────
{
  const html = render();
  assert(
    html.includes("附加税") && (html.includes("计税依据") || html.includes("依据")),
    "要说清登记它是为了算附加税——否则用户不知道这个表单为什么存在"
  );
  assert(
    html.includes("实际") || html.includes("实缴"),
    "要强调是**实际缴纳**的金额，不是应纳额——两者在有留抵时不相等"
  );
}

// ── 已登记的缴款列出来 ──────────────────────────────────────────────────
{
  const html = render({
    payments: [
      { id: "txp-1", taxType: "vat", filingPeriod: "2026-08", amountCents: 100_000, paidOn: "2026-08-15", note: "8 月增值税" },
      { id: "txp-2", taxType: "vat", filingPeriod: "2026-08", amountCents: 50_000, paidOn: "2026-08-25", note: "" }
    ]
  });

  assert(html.includes("1000.00") || html.includes("1,000"), "1000 元要显示出来（存的是分）");
  assert(html.includes("2026-08-15"), "缴款日要列出来");
  assert(
    html.includes("1500.00") || html.includes("1,500"),
    "**多笔要显示合计**——分期缴纳时用户要能一眼看到计税依据是多少"
  );
}

// ── 没有记录时说清后果 ──────────────────────────────────────────────────
{
  const html = render({ payments: [] });
  assert(
    html.includes("还没有") || html.includes("暂无"),
    "空态要说清还没登记"
  );
  assert(
    html.includes("算不出") || html.includes("待"),
    "要说清不登记的后果是附加税算不出，而不是让用户以为可填可不填"
  );
}

console.log("tax-payment-entry: ok");
