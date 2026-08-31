import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaxMaterialsPanel } from "./TaxMaterialsPanel";
import type {
  CorporateIncomeTaxPreparation,
  StampAndSurtaxSummary
} from "@finance-taxation/domain-model";

/**
 * 税率「待确认」与附加税算出来的展示（V17 阶段三）。
 *
 * ## 两个缺陷
 *
 * 一、企业所得税那块写的是 `税率：{incomeTaxRate}%`。批次 A 之后
 * `incomeTaxRate` 在资格未登记时是 `null`，这行会渲染成「税率：%」——
 * 一个看不懂的空白，用户不知道是系统坏了还是税率真的是空。
 *
 * 二、附加税那块只显示「附加税事项数：0」。批次 B 之前那个数永远是 0
 * （没人手工建税项），批次 B 之后附加税真的算出来了，但这块不显示金额。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    activeMaterial: "cit" as const,
    onSelectMaterial: () => {},
    stampAndSurtax: null,
    taxPayments: [],
    onTaxPaymentCreated: () => {},
    lossLedger: [],
    onLossLedgerCreated: () => {},
    lossCarryforwardYears: 5,
    incomeTaxPreparation: null,
    iitMaterials: null,
    vatWorkingPaper: null,
    stampFilingPeriod: "2026-08",
    incomeTaxPeriod: "2026-08",
    iitPeriod: "2026-08",
    vatPeriod: "2026-08",
    onStampPeriodChange: () => {},
    onIncomeTaxPeriodChange: () => {},
    onIitPeriodChange: () => {},
    onVatPeriodChange: () => {},
    onGenerateStamp: () => {},
    onGenerateCit: () => {},
    onGenerateIit: () => {},
    onGenerateVat: () => {},
    onPrintCit: () => {},
    onPrintVat: () => {},
    ...overrides
  };
}

function citPreparation(
  overrides: Partial<CorporateIncomeTaxPreparation> = {}
): CorporateIncomeTaxPreparation {
  return {
    companyId: "cmp-1",
    filingPeriod: "2026-08",
    accountingProfit: "800",
    taxableIncomeEstimate: "800",
    incomeTaxRate: "25",
    preferenceKind: "standard",
    preferenceNotice: "按法定税率 25% 计算。",
    reducedInclusionPercent: null,
    appliedRatePercent: null,
    prepaymentTaxEstimate: "200",
    carryforwardLoss: "0",
    lossOffset: "0",
    taxableIncomeAfterLoss: "800",
    expiredLossNotice: "",
    prepaidTax: "0",
    taxPayableOrRefundable: "200",
    adjustmentHints: [],
    checklist: [],
    ...overrides
  };
}

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(TaxMaterialsPanel, baseProps(props) as never)
  );
}

// ── 税率待确认时不能渲染成「税率：%」 ───────────────────────────────────
{
  const html = render({
    incomeTaxPreparation: citPreparation({
      incomeTaxRate: null,
      preferenceKind: "unknown",
      preferenceNotice: "算不出适用税率：还没登记从业人数、资产总额。",
      prepaymentTaxEstimate: null
    })
  });

  assert(
    !html.includes("税率：%") && !html.includes("税率：null%"),
    "税率为 null 时不能渲染成「税率：%」或「税率：null%」——用户看不懂那是什么"
  );
  assert(
    html.includes("从业人数") || html.includes("待确认"),
    "要把「为什么算不出、缺什么」说给用户看，而不是留一个空白"
  );
  assert(
    !html.includes(">0<") || html.includes("待确认"),
    "预缴税额算不出时不能显示成 0——0 是一个确定的结论，与算不出不是一回事"
  );
}

// ── 小微的两个系数要显示出来 ────────────────────────────────────────────
{
  // 申报表上「减免税额」是单独一栏，用户要能对上。
  const html = render({
    incomeTaxPreparation: citPreparation({
      incomeTaxRate: "5",
      preferenceKind: "small_profit",
      preferenceNotice: "小型微利企业：减按 25% 计入，按 20% 税率征收。",
      reducedInclusionPercent: "25",
      appliedRatePercent: "20",
      prepaymentTaxEstimate: "40"
    })
  });

  assert(html.includes("小型微利"), "要说清享受了哪项优惠");
  assert(
    html.includes("25") && html.includes("20"),
    "两个系数都要显示——申报表要分别列示，合成一个 5% 就对不上了"
  );
}

// ── 附加税算出来要显示金额，不只是事项数 ────────────────────────────────
{
  const summary: StampAndSurtaxSummary = {
    companyId: "cmp-1",
    filingPeriod: "2026-08",
    stampDutyItems: [],
    surtaxItems: [],
    surtax: {
      kind: "calculated",
      urbanConstructionCents: 7000,
      educationSurchargeCents: 3000,
      localEducationSurchargeCents: 2000,
      totalCents: 12000,
      reductionCents: 0,
      reason: "计税依据只含增值税。"
    },
    notes: ["计税依据只含增值税。"]
  };

  const html = render({ activeMaterial: "stamp", stampAndSurtax: summary });

  assert(html.includes("城市维护建设税") || html.includes("城建税"), "要列出城建税");
  assert(html.includes("教育费附加"), "要列出教育费附加");
  assert(
    html.includes("70") && html.includes("30") && html.includes("120"),
    "**要显示金额**——只显示「附加税事项数：0」等于什么都没说"
  );
}

// ── 附加税算不出时说清在等什么 ──────────────────────────────────────────
{
  const summary: StampAndSurtaxSummary = {
    companyId: "cmp-1",
    filingPeriod: "2026-08",
    stampDutyItems: [],
    surtaxItems: [],
    surtax: {
      kind: "pending_main_tax",
      urbanConstructionCents: null,
      educationSurchargeCents: null,
      localEducationSurchargeCents: null,
      totalCents: null,
      reductionCents: 0,
      reason: "本期增值税还没有缴纳记录，等主税缴纳后即可计算。"
    },
    notes: []
  };

  const html = render({ activeMaterial: "stamp", stampAndSurtax: summary });
  assert(
    html.includes("缴纳记录") || html.includes("等主税"),
    "要说清在等什么——用户得知道是去登记缴款，而不是这里坏了"
  );
  assert(
    !html.includes("¥0") && !html.includes("0.00"),
    "算不出时不能显示成 0 元——那会让用户以为本期不用交附加税"
  );
}

// ── 弥补与抵减要显示出来 ────────────────────────────────────────────────
{
  // 用户要能看懂这三步：利润 → 弥补后基数 → 应补退。
  // 只显示最后一个数字的话，对不上账时无从查起。
  const html = render({
    incomeTaxPreparation: citPreparation({
      taxableIncomeEstimate: "800",
      lossOffset: "300",
      taxableIncomeAfterLoss: "500",
      prepaymentTaxEstimate: "125",
      prepaidTax: "80",
      taxPayableOrRefundable: "45"
    })
  });

  assert(html.includes("300"), "弥补了多少要显示");
  assert(html.includes("500"), "弥补后的基数要显示——那才是计税基数");
  assert(html.includes("80"), "已预缴要显示");
  assert(html.includes("45"), "应补退要显示");
}

// ── 应退是负数，不能显示成应补 ──────────────────────────────────────────
{
  const html = render({
    incomeTaxPreparation: citPreparation({
      prepaymentTaxEstimate: "125",
      prepaidTax: "280",
      taxPayableOrRefundable: "-155"
    })
  });

  assert(
    html.includes("应退") || html.includes("退税"),
    "**负数要说成「应退」**——显示「应补 -155」会让用户以为要交负数的钱"
  );
  assert(html.includes("155"), "退多少要显示");
}

// ── 超期的亏损要提示 ────────────────────────────────────────────────────
{
  const html = render({
    incomeTaxPreparation: citPreparation({
      expiredLossNotice: "以下年度的亏损已超过结转年限，不能再弥补：2019 年（剩余 1000.00 元）。"
    })
  });
  assert(
    html.includes("2019") && html.includes("超过结转年限"),
    "超期要提示——一笔权利作废了，用户得知道"
  );
}

console.log("tax-preference-display: ok");
