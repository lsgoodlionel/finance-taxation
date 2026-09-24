import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCreatePanel } from "./EventCreatePanel";

/**
 * 建事项时能选应税行为类别（V17 阶段二）。
 *
 * ## 缺陷
 *
 * 阶段一把税率判定链路打通了，但类别**只能通过 API 或直接改库设置**——
 * 界面上没有选择入口。于是绝大多数业务走「公司默认类别」这条兜底路径，
 * 混合业务的公司（既卖货又做服务）根本没法逐笔标注：
 * 一家卖货为主的公司接了一笔咨询，只能眼看着它按 13% 算。
 *
 * 这条测试盯的是**用户点得到**——V16 那次红冲按钮写成两个互斥条件、
 * 前台入口护栏照样绿的教训：符号存在不等于按钮可见。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const CATEGORY_OPTIONS = [
  { value: "goods", label: "销售货物", rateCode: "vat_basic", rateHint: "13%" },
  { value: "modern_service", label: "现代服务", rateCode: "vat_service", rateHint: "6%" },
  { value: "construction", label: "建筑服务", rateCode: "vat_low", rateHint: "9%" }
];

function baseForm() {
  return {
    type: "sales",
    title: "",
    description: "",
    department: "财务部",
    occurredOn: "2026-08-01",
    amount: "",
    taxableCategory: ""
  };
}

function render(props: Partial<Parameters<typeof EventCreatePanel>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(EventCreatePanel, {
      form: baseForm(),
      isBusy: false,
      isSaving: false,
      options: [{ value: "sales", label: "销售" }],
      counterparties: [],
      taxableCategories: CATEGORY_OPTIONS,
      taxpayerType: "general_vat",
      onChange: () => {},
      onSubmit: () => {},
      ...props
    } as Parameters<typeof EventCreatePanel>[0])
  );
}

// ── 选择器在页面上，且每一项都带税率 ────────────────────────────────────
{
  const html = render();
  assert(html.includes("应税行为类别"), "建事项表单上要有类别选择器——这是阶段二的全部意义");

  assert(
    html.includes("现代服务") && html.includes("建筑服务"),
    "服务端给的类别都要渲染出来"
  );
  assert(
    html.includes("6%") && html.includes("13%") && html.includes("9%"),
    "选项上要标税率——用户是按「这笔算几个点」判断选哪个的，不是按枚举名"
  );
}

// ── 类别决定税率，说清楚它是干什么的 ────────────────────────────────────
{
  const html = render();
  assert(
    html.includes("税率") && html.includes("待确认"),
    "要说明不选的后果：底稿上会显示「税目待确认」，而不是默默按某个税率算"
  );
}

// ── 未登记纳税人身份时如实提示 ──────────────────────────────────────────
{
  const html = render({ taxpayerType: null } as never);
  assert(
    html.includes("纳税人身份"),
    "身份未登记时税率提示只是按一般计税估的，要说出来——不能让用户以为那就是他的税率"
  );
}

// ── 预填公司主营类别 ────────────────────────────────────────────────────
{
  const html = render({
    form: { ...baseForm(), taxableCategory: "goods" }
  } as never);
  const selected = /<option value="goods"[^>]*selected/.test(html);
  assert(
    selected,
    "有预填值时该项要是选中态——大多数事项就是主营业务，让用户每笔重选是没意义的负担"
  );
}

console.log("event-taxable-category: ok");
