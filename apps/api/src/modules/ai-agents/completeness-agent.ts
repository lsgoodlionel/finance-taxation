/**
 * P6-A3 资料完整性 Agent（规则优先，可留痕）
 *
 * 判断一个经营事项缺少哪些原始凭证，输出缺口清单与催办建议。
 * 纯函数、确定性，便于单测。
 */

export interface CompletenessInput {
  type: string;
  hasContract: boolean;
  hasInvoice: boolean;
  hasDocument: boolean;   // 是否已有单据/附件
  hasVoucher: boolean;
}

export interface CompletenessAssessment {
  required: string[];
  missing: string[];
  score: number;          // 0-1 完整度
  blocked: boolean;       // 是否阻塞入账/报税/归档
  recommendation: string;
}

interface Requirement {
  label: string;
  has: (i: CompletenessInput) => boolean;
}

// 各事项类型应具备的原始资料
const RULES: Record<string, Requirement[]> = {
  sales: [
    { label: "销售合同", has: (i) => i.hasContract },
    { label: "销项发票", has: (i) => i.hasInvoice },
    { label: "记账凭证", has: (i) => i.hasVoucher },
  ],
  procurement: [
    { label: "采购合同/订单", has: (i) => i.hasContract },
    { label: "进项发票", has: (i) => i.hasInvoice },
    { label: "付款凭证/单据", has: (i) => i.hasDocument },
    { label: "记账凭证", has: (i) => i.hasVoucher },
  ],
  expense: [
    { label: "费用发票", has: (i) => i.hasInvoice },
    { label: "审批单/单据", has: (i) => i.hasDocument },
    { label: "记账凭证", has: (i) => i.hasVoucher },
  ],
  asset: [
    { label: "采购发票", has: (i) => i.hasInvoice },
    { label: "验收/单据", has: (i) => i.hasDocument },
    { label: "记账凭证", has: (i) => i.hasVoucher },
  ],
  payroll: [
    { label: "工资单据", has: (i) => i.hasDocument },
    { label: "记账凭证", has: (i) => i.hasVoucher },
  ],
};

export function assessCompleteness(input: CompletenessInput): CompletenessAssessment {
  const reqs = RULES[input.type];
  if (!reqs) {
    return {
      required: [], missing: [], score: 1, blocked: false,
      recommendation: `事项类型「${input.type}」无标准资料清单，按需人工判断。`,
    };
  }
  const required = reqs.map((r) => r.label);
  const missing = reqs.filter((r) => !r.has(input)).map((r) => r.label);
  const score = Number(((required.length - missing.length) / required.length).toFixed(2));
  const blocked = missing.length > 0;
  const recommendation = missing.length === 0
    ? "资料齐全，可正常入账、报税与归档。"
    : `缺少：${missing.join("、")}。建议尽快补齐，否则影响入账/报税/归档。`;
  return { required, missing, score, blocked, recommendation };
}
