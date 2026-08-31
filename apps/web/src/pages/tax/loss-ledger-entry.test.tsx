import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LossLedgerEntry } from "./LossLedgerEntry";

/**
 * 以前年度亏损台账的录入（V17 阶段三批次 C）。
 *
 * ## 为什么要能手工录
 *
 * 台账的第一批数据来自**系统上线之前**——企业换系统时，前几年的亏损
 * 还在结转期内。自动生成只能覆盖系统里发生的年度，覆盖不了历史，
 * 而历史那几笔恰恰是最急着用的。
 *
 * 没有录入界面的话，弥补功能对所有新客户都等于不存在。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(LossLedgerEntry, {
      entries: [],
      currentYear: 2026,
      carryforwardYears: 5,
      onCreated: () => {},
      ...props
    } as never)
  );
}

// ── 录入入口在页面上 ────────────────────────────────────────────────────
{
  const html = render();
  assert(html.includes("亏损"), "要有亏损台账的录入");
  assert(
    html.includes("弥补") || html.includes("结转"),
    "要说清这些数据是干什么用的"
  );
}

// ── 剩余可弥补额要算给用户看 ────────────────────────────────────────────
{
  const html = render({
    entries: [
      { id: "l1", lossYear: 2023, lossCents: 40_000_00, offsetCents: 25_000_00, remainingCents: 15_000_00, note: "" }
    ]
  });

  assert(html.includes("2023"), "年度要列出来");
  assert(
    html.includes("150") || html.includes("15,000") || html.includes("15000"),
    "**剩余可弥补额要显示**——用户关心的是「还能补多少」，不是「当年亏了多少」"
  );
}

// ── 超期的要标出来 ──────────────────────────────────────────────────────
{
  // 2019 年的亏损，5 年结转，2026 年已经超期。
  const html = render({
    entries: [
      { id: "l1", lossYear: 2019, lossCents: 100_000_00, offsetCents: 0, remainingCents: 100_000_00, note: "" },
      { id: "l2", lossYear: 2024, lossCents: 50_000_00, offsetCents: 0, remainingCents: 50_000_00, note: "" }
    ],
    currentYear: 2026,
    carryforwardYears: 5
  });

  assert(
    html.includes("已超期") || html.includes("超期"),
    "**超期要标出来**——一笔权利作废了，用户得看见，而不是让它悄悄消失在列表里"
  );
}

// ── 结转年限说清楚 ──────────────────────────────────────────────────────
{
  const general = render({ carryforwardYears: 5 });
  assert(general.includes("5 年") || general.includes("5年"), "一般企业 5 年");

  const highTech = render({ carryforwardYears: 10 });
  assert(
    highTech.includes("10 年") || highTech.includes("10年"),
    "高新技术企业 10 年——年限跟着资质走，不是固定的"
  );
}

// ── 空态说清后果 ────────────────────────────────────────────────────────
{
  const html = render({ entries: [] });
  assert(
    html.includes("还没") || html.includes("暂无"),
    "空态要说清还没登记"
  );
  assert(
    html.includes("多缴") || html.includes("不减") || html.includes("用不上"),
    "要说清不登记的后果是多缴税，而不是让用户以为可填可不填"
  );
}

console.log("loss-ledger-entry: ok");
