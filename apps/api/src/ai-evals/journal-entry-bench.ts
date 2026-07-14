/**
 * H3 — 「事项→自动分录」评测集（AI 月结 Agent 准确率基线）
 *
 * 量化 suggestAccountingEntry() 的分类准确率，作为 M4「自动记账 ≥80%」的验收门。
 * 纯函数、无 DB、无网络：黄金集取材于 STARTUP_YEAR1_SIMULATION.md 的 28 个首年场景
 * 及 migrations/015_startup_year1_simulation.sql 的 business_events 真实记录，
 * 覆盖 sales / procurement / expense / payroll / asset / invoice 六个已支持模板类型，
 * 以及缺金额、未知事项类型、无模板真实类型（general/financing/rnd/tax）等边界情况。
 */

import {
  suggestAccountingEntry,
  type EventForAccounting,
} from "../modules/ai-agents/accounting-agent.js";
import type { VoucherDraftLine } from "@finance-taxation/domain-model";

export interface GoldenCase {
  name: string;
  event: EventForAccounting;
  expectedTemplateKey: string | null;
  expectBalanced: boolean;
  expectNeedsReview?: boolean;
}

export interface BenchFailure {
  name: string;
  reason: string;
}

export interface BenchResult {
  total: number;
  passed: number;
  accuracy: number;
  failures: BenchFailure[];
}

const CENTS_SCALE = 100;

/**
 * 黄金集：22 条，覆盖六个已支持模板类型（sales/procurement/expense/payroll/asset/invoice）
 * 的代表性真实场景，加上缺金额、零金额、未知类型、无模板真实类型等边界情况。
 */
export const GOLDEN_CASES: GoldenCase[] = [
  // ── sales（对齐 evt-010/011/012/013：客户签约、开票收入、退款、逾期催收）──
  {
    name: "客户A合同首付款到账（evt-010）",
    event: { id: "evt-010", type: "sales", title: "客户A合同首付款到账", amount: 200000 },
    expectedTemplateKey: "sales",
    expectBalanced: true,
  },
  {
    name: "客户A开票收入确认（evt-011）",
    event: { id: "evt-011", type: "sales", title: "客户A开票收入确认", amount: 212000 },
    expectedTemplateKey: "sales",
    expectBalanced: true,
  },
  {
    name: "客户B小额退款（evt-012）",
    event: { id: "evt-012", type: "sales", title: "客户B小额退款", amount: 10000 },
    expectedTemplateKey: "sales",
    expectBalanced: true,
  },
  {
    name: "应收账款逾期催收（evt-013）",
    event: { id: "evt-013", type: "sales", title: "应收账款逾期催收", amount: 30000 },
    expectedTemplateKey: "sales",
    expectBalanced: true,
  },

  // ── procurement（对齐 evt-005：办公设备采购）──
  {
    name: "办公设备采购-电脑及显示器（evt-005）",
    event: { id: "evt-005", type: "procurement", title: "办公设备采购-电脑及显示器", amount: 85000 },
    expectedTemplateKey: "procurement",
    expectBalanced: true,
  },
  {
    name: "原材料批量采购入库",
    event: { id: "evt-proc-002", type: "procurement", title: "原材料批量采购入库", amount: 45000 },
    expectedTemplateKey: "procurement",
    expectBalanced: true,
  },

  // ── expense（对齐 evt-003/006/014/015/017：租金、软著申请费、差旅、招待、贷款利息）──
  {
    name: "办公室租赁押金及首月租金（evt-003）",
    event: { id: "evt-003", type: "expense", title: "办公室租赁押金及首月租金", amount: 60000 },
    expectedTemplateKey: "expense",
    expectBalanced: true,
  },
  {
    name: "软件著作权申请费（evt-006）",
    event: { id: "evt-006", type: "expense", title: "软件著作权申请费", amount: 3500 },
    expectedTemplateKey: "expense",
    expectBalanced: true,
  },
  {
    name: "销售团队差旅费报销（evt-014）",
    event: { id: "evt-014", type: "expense", title: "销售团队差旅费报销", amount: 6800 },
    expectedTemplateKey: "expense",
    expectBalanced: true,
  },
  {
    name: "业务招待费（evt-015）",
    event: { id: "evt-015", type: "expense", title: "业务招待费", amount: 4200 },
    expectedTemplateKey: "expense",
    expectBalanced: true,
  },
  {
    name: "银行贷款4月份利息计提（evt-017）",
    event: { id: "evt-017", type: "expense", title: "银行贷款4月份利息计提", amount: 3208 },
    expectedTemplateKey: "expense",
    expectBalanced: true,
  },

  // ── payroll（对齐 evt-007/008：工资发放、社保公积金）──
  {
    name: "2026年3月份工资发放（evt-007）",
    event: { id: "evt-007", type: "payroll", title: "2026年3月份工资发放", amount: 86000 },
    expectedTemplateKey: "payroll",
    expectBalanced: true,
  },
  {
    name: "2026年3月社保及公积金申报缴纳（evt-008）",
    event: { id: "evt-008", type: "payroll", title: "2026年3月社保及公积金申报缴纳", amount: 48160 },
    expectedTemplateKey: "payroll",
    expectBalanced: true,
  },

  // ── asset（对齐 evt-027：固定资产处置 + 一条购置代表场景）──
  {
    name: "旧路由器及办公桌椅处置（evt-027）",
    event: { id: "evt-027", type: "asset", title: "旧路由器及办公桌椅处置", amount: 2000 },
    expectedTemplateKey: "asset",
    expectBalanced: true,
  },
  {
    name: "新增生产设备购置入账",
    event: { id: "evt-asset-002", type: "asset", title: "新增生产设备购置入账", amount: 120000 },
    expectedTemplateKey: "asset",
    expectBalanced: true,
  },

  // ── invoice（进项发票入账符合当前模板设计；销项发票误判为已知局限，标注红线）──
  {
    name: "供应商增值税专用发票入账（进项，符合设计）",
    event: { id: "evt-inv-001", type: "invoice", title: "供应商增值税专用发票入账", amount: 22000 },
    expectedTemplateKey: "procurement",
    expectBalanced: true,
  },
  {
    name: "开具销项发票确认收入（已知局限：invoice 类型恒按采购入账）",
    event: { id: "evt-inv-002", type: "invoice", title: "开具销项发票确认收入", amount: 53000 },
    expectedTemplateKey: "sales",
    expectBalanced: true,
  },

  // ── 边界：真实首年场景中存在、但当前无模板覆盖的事项类型（应正确判定为需人工复核）──
  {
    name: "公司设立登记及开办费用（general 无模板，evt-001）",
    event: { id: "evt-001", type: "general", title: "公司设立登记及开办费用", amount: 15800 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "股东货币出资到账（financing 无模板，evt-002）",
    event: { id: "evt-002", type: "financing", title: "股东货币出资到账", amount: 500000 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "委外研发首期款支付（rnd 无模板，evt-009）",
    event: { id: "evt-009", type: "rnd", title: "委外研发首期款支付", amount: 120000 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "2026年4月增值税月报申报（tax 无模板，evt-019）",
    event: { id: "evt-019", type: "tax", title: "2026年4月增值税月报申报", amount: 8320 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },

  // ── 边界：缺金额 / 零金额 / 完全未知类型 ──
  {
    name: "缺失金额（amount=null）",
    event: { id: "evt-edge-001", type: "sales", title: "金额待补充的销售事项", amount: null },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "金额为零",
    event: { id: "evt-edge-002", type: "payroll", title: "金额为零的占位事项", amount: 0 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "完全未知事项类型",
    event: { id: "evt-edge-003", type: "unknown_xyz", title: "未定义类型事项", amount: 1000 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },
];

/** 以“分”为单位比较借贷合计，避免浮点误差 */
function toCents(value: string): number {
  return Math.round(Number(value) * CENTS_SCALE);
}

function isBalanced(lines: VoucherDraftLine[]): boolean {
  const debitCents = lines.reduce((sum, l) => sum + toCents(l.debit), 0);
  const creditCents = lines.reduce((sum, l) => sum + toCents(l.credit), 0);
  return debitCents === creditCents;
}

/**
 * 对黄金集逐条跑 suggestAccountingEntry，校验：
 * 1) templateKey 是否命中预期（含预期为 null 的“无模板/需人工”场景）
 * 2) 借贷分录是否平衡（sum(debit) === sum(credit)，按分整数比较）
 * 3) needsReview 是否符合预期（若用例指定）
 */
export function runJournalEntryBench(cases: GoldenCase[] = GOLDEN_CASES): BenchResult {
  const failures: BenchFailure[] = [];

  for (const testCase of cases) {
    const suggestion = suggestAccountingEntry(testCase.event);
    const reasons: string[] = [];

    if (suggestion.templateKey !== testCase.expectedTemplateKey) {
      reasons.push(
        `templateKey 预期 ${JSON.stringify(testCase.expectedTemplateKey)}，实际 ${JSON.stringify(suggestion.templateKey)}`
      );
    }

    if (testCase.expectBalanced && !isBalanced(suggestion.lines)) {
      const debitCents = suggestion.lines.reduce((sum, l) => sum + toCents(l.debit), 0);
      const creditCents = suggestion.lines.reduce((sum, l) => sum + toCents(l.credit), 0);
      reasons.push(`借贷不平衡：借方合计 ${debitCents} 分，贷方合计 ${creditCents} 分`);
    }

    if (
      testCase.expectNeedsReview !== undefined &&
      suggestion.needsReview !== testCase.expectNeedsReview
    ) {
      reasons.push(
        `needsReview 预期 ${testCase.expectNeedsReview}，实际 ${suggestion.needsReview}`
      );
    }

    if (reasons.length > 0) {
      failures.push({ name: testCase.name, reason: reasons.join("；") });
    }
  }

  const total = cases.length;
  const passed = total - failures.length;

  return {
    total,
    passed,
    accuracy: total === 0 ? 0 : passed / total,
    failures,
  };
}
