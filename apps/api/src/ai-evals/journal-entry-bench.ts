/**
 * H3 — 「事项→自动分录」评测集（AI 月结 Agent 准确率基线）
 *
 * 量化 suggestAccountingEntry() 的分类准确率，作为 M4「自动记账 ≥80%」的验收门。
 * 纯函数、无 DB、无网络：黄金集取材于 STARTUP_YEAR1_SIMULATION.md 的 28 个首年场景
 * 及 migrations/015_startup_year1_simulation.sql 的 business_events / voucher_lines 真实记录，
 * 覆盖 sales / procurement / expense / payroll / asset / rnd 七个直接按事项类型映射的模板，
 * 以及 invoice（按标题关键词推断进项/销项方向）、financing（按标题区分股东出资 vs 银行借款）、
 * tax（按标题区分企业所得税计提 vs 印花税等税金及附加计提）三类需子分类推断的模板；
 * 并保留 general（真正的杂项事项，无单一标准处理）、增值税/个人所得税（涉及既有负债结转或
 * 代扣代缴，无法从标题+金额可靠推断科目）、缺金额、未知事项类型等边界情况，验证其正确地
 * 判定为 needsReview 而非被错误地套用模板。
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

  // ── invoice（按标题关键词推断进项/销项方向；也可通过 event.direction 显式指定）──
  {
    name: "供应商增值税专用发票入账（进项，标题推断）",
    event: { id: "evt-inv-001", type: "invoice", title: "供应商增值税专用发票入账", amount: 22000 },
    expectedTemplateKey: "procurement",
    expectBalanced: true,
  },
  {
    name: "开具销项发票确认收入（销项，标题推断）",
    event: { id: "evt-inv-002", type: "invoice", title: "开具销项发票确认收入", amount: 53000 },
    expectedTemplateKey: "sales",
    expectBalanced: true,
  },
  {
    name: "发票事项显式指定 direction=output（跳过标题推断）",
    event: {
      id: "evt-inv-003",
      type: "invoice",
      title: "客户C发票",
      amount: 8000,
      direction: "output",
    },
    expectedTemplateKey: "sales",
    expectBalanced: true,
  },
  {
    name: "发票事项显式指定 direction=input（跳过标题推断）",
    event: {
      id: "evt-inv-004",
      type: "invoice",
      title: "供应商D发票",
      amount: 9000,
      direction: "input",
    },
    expectedTemplateKey: "procurement",
    expectBalanced: true,
  },
  {
    name: "发票方向完全无法判断，保守按进项处理（needsReview 兜底）",
    event: { id: "evt-inv-005", type: "invoice", title: "待分类发票", amount: 4300 },
    expectedTemplateKey: "procurement",
    expectBalanced: true,
    expectNeedsReview: true,
  },

  // ── financing（借标题区分股东出资/增资 vs 银行借款，二者会计处理截然不同）──
  {
    name: "股东货币出资到账（出资→financing-equity，evt-002）",
    event: { id: "evt-002", type: "financing", title: "股东货币出资到账", amount: 500000 },
    expectedTemplateKey: "financing-equity",
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "招商银行流动资金贷款到账（借款→financing-loan，evt-016）",
    event: { id: "evt-016", type: "financing", title: "招商银行流动资金贷款到账", amount: 1000000 },
    expectedTemplateKey: "financing-loan",
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "融资事项标题无法区分出资/借款，保持人工判断",
    event: { id: "evt-fin-003", type: "financing", title: "过桥资金安排跟进", amount: 50000 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },

  // ── rnd（费用化研发投入，直接按事项类型映射；对齐 015 迁移真实分录 vch-009）──
  {
    name: "委外研发首期款支付（rnd→rnd 模板，evt-009）",
    event: { id: "evt-009", type: "rnd", title: "委外研发首期款支付", amount: 120000 },
    expectedTemplateKey: "rnd",
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "阿里云服务器及SaaS工具订阅费（rnd→rnd 模板，evt-004）",
    event: { id: "evt-004", type: "rnd", title: "阿里云服务器及SaaS工具订阅费", amount: 36000 },
    expectedTemplateKey: "rnd",
    expectBalanced: true,
    expectNeedsReview: true,
  },

  // ── tax（借标题区分企业所得税计提 vs 印花税等税金及附加计提；增值税/个税结转场景保持人工判断）──
  {
    name: "企业所得税季度预缴（所得税→tax-income，evt-024）",
    event: { id: "evt-024", type: "tax", title: "2026年第一季度企业所得税预缴", amount: 7500 },
    expectedTemplateKey: "tax-income",
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "合同印花税申报缴纳（印花税→tax-surcharge，evt-021）",
    event: { id: "evt-021", type: "tax", title: "合同印花税申报缴纳", amount: 1040 },
    expectedTemplateKey: "tax-surcharge",
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "增值税月报申报（涉及既有销项税额结转，无法从标题+金额可靠推断科目，evt-019）",
    event: { id: "evt-019", type: "tax", title: "2026年4月增值税月报申报", amount: 8320 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
  },
  {
    name: "个人所得税扣缴申报（本质是员工薪酬代扣而非公司费用，无法套用模板，evt-020）",
    event: { id: "evt-020", type: "tax", title: "2026年4月个人所得税扣缴申报", amount: 3850 },
    expectedTemplateKey: null,
    expectBalanced: true,
    expectNeedsReview: true,
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
    name: "政府补助到账（general 类型内部治理混杂，仍保持人工判断，evt-018）",
    event: { id: "evt-018", type: "general", title: "浦东新区科技型中小企业创业补贴", amount: 100000 },
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
