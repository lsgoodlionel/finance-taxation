/**
 * 模拟产量与在产品数据（V14-C）。
 *
 * ## 数据来源与口径
 *
 * 用**服务器组装**的成本结构。数量级参照公开的服务器整机 BOM 构成
 * （双路机架式服务器：CPU 与内存占物料成本大头，机箱电源占小头），
 * 人工与制造费用按整机组装的常见比例估。
 *
 * **这是模拟数据，不是任何一家厂商的真实报价。** 它的用途是让成本结转
 * 功能在页面上有真实感——一个全是 1000、2000 的演示账会让人看不出
 * 约当产量法到底解决了什么问题。
 *
 * ## 三个成本项的完工程度不同，这才是重点
 *
 * | 成本项 | 完工程度 | 为什么 |
 * |---|---|---|
 * | 直接材料 | 100% | 上线时整套物料一次性配齐，半成品机箱里料是全的 |
 * | 直接人工 | 60% | 装了一部分，工时花了一部分 |
 * | 制造费用 | 60% | 随加工进度发生 |
 *
 * 用同一个 60% 分材料会让完工成本被高估约 9%——这个差额正是种子数据
 * 想让人看见的东西。
 */

import type { CostElement } from "./equivalent-units.js";

export interface SeedProduct {
  code: string;
  name: string;
  unit: string;
  note: string;
}

export interface SeedRun {
  productCode: string;
  period: string;
  finishedQuantity: number;
  endingWipQuantity: number;
  note: string;
  costs: ReadonlyArray<{
    element: CostElement;
    incurredCents: number;
    wipCompletionBp: number;
  }>;
}

export const SEED_PRODUCTS: readonly SeedProduct[] = [
  {
    code: "SRV-2U-A",
    name: "双路机架式服务器 2U",
    unit: "台",
    note: "主板 + 双路 CPU + 内存 + 电源 + 机箱，整机组装"
  },
  {
    code: "SRV-1U-B",
    name: "单路机架式服务器 1U",
    unit: "台",
    note: "入门配置，物料成本约为 2U 机型的六成"
  }
];

/**
 * 两个期间的数据，让「上期期末在产品 → 本期期初」的衔接看得见。
 *
 * 2026-03 结转后 2U 机型留下 40 台在产品；2026-04 的期初在产品由系统
 * 自动从上期结果取——用户不用去翻上个月再抄一遍。
 */
export const SEED_RUNS: readonly SeedRun[] = [
  {
    productCode: "SRV-2U-A",
    period: "2026-03",
    finishedQuantity: 120,
    endingWipQuantity: 40,
    note: "3 月投产 160 台，完工 120 台，40 台在装",
    costs: [
      // 单台物料约 1.85 万元：主板 3200 + 双路 CPU 9600 + 内存 3200
      // + 电源 1200 + 机箱 1300。160 台份一次性配齐。
      { element: "material", incurredCents: 296_000_00, wipCompletionBp: 10000 },
      // 单台组装工时成本约 480 元，按约当产量 144 台计。
      { element: "labor", incurredCents: 6_912_00, wipCompletionBp: 6000 },
      // 制造费用（水电、设备折旧、车间管理）约为人工的 1.5 倍。
      { element: "overhead", incurredCents: 10_368_00, wipCompletionBp: 6000 }
    ]
  },
  {
    productCode: "SRV-2U-A",
    period: "2026-04",
    finishedQuantity: 150,
    endingWipQuantity: 30,
    note: "4 月接上期 40 台在产，新投 140 台，完工 150 台",
    costs: [
      { element: "material", incurredCents: 259_000_00, wipCompletionBp: 10000 },
      { element: "labor", incurredCents: 8_064_00, wipCompletionBp: 6000 },
      { element: "overhead", incurredCents: 12_096_00, wipCompletionBp: 6000 }
    ]
  },
  {
    productCode: "SRV-1U-B",
    period: "2026-04",
    finishedQuantity: 200,
    endingWipQuantity: 0,
    note: "4 月全部完工，没有在产品——这条用来对照「无在产品时全额结转」",
    costs: [
      { element: "material", incurredCents: 222_000_00, wipCompletionBp: 10000 },
      { element: "labor", incurredCents: 8_000_00, wipCompletionBp: 6000 },
      { element: "overhead", incurredCents: 12_000_00, wipCompletionBp: 6000 }
    ]
  }
];
