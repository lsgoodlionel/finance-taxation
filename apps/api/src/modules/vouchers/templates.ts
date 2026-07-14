import type { Voucher, VoucherDraftLine } from "@finance-taxation/domain-model";

export interface VoucherTemplateDefinition {
  key: string;
  label: string;
  description: string;
  voucherType: Voucher["voucherType"];
  buildLines(amount: string): VoucherDraftLine[];
}

export interface BuildVoucherTemplateDraftInput {
  templateKey: string;
  amount: string;
  summary?: string;
  businessEventId: string;
  companyId: string;
}

export interface BuiltVoucherTemplateDraft {
  voucherType: Voucher["voucherType"];
  summary: string;
  lines: VoucherDraftLine[];
  businessEventId: string;
  companyId: string;
}

function money(value: string): string {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("amount must be a positive number");
  }
  return normalized.toFixed(2);
}

function line(
  id: string,
  summary: string,
  accountCode: string,
  accountName: string,
  debit: string,
  credit: string
): VoucherDraftLine {
  return { id, summary, accountCode, accountName, debit, credit };
}

const templates: VoucherTemplateDefinition[] = [
  {
    key: "sales",
    label: "销售收入确认",
    description: "借应收账款，贷主营业务收入。",
    voucherType: "accrual",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-sales-1", "确认应收账款", "1122", "应收账款", value, "0.00"),
        line("tpl-sales-2", "确认主营业务收入", "6001", "主营业务收入", "0.00", value)
      ];
    }
  },
  {
    key: "procurement",
    label: "采购入账",
    description: "借原材料，贷应付账款。",
    voucherType: "payment",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-procurement-1", "确认采购入库", "1403", "原材料", value, "0.00"),
        line("tpl-procurement-2", "确认应付账款", "2202", "应付账款", "0.00", value)
      ];
    }
  },
  {
    key: "expense",
    label: "费用报销",
    description: "借管理费用，贷其他应付款。",
    voucherType: "payment",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-expense-1", "确认管理费用", "6602", "管理费用", value, "0.00"),
        line("tpl-expense-2", "确认员工垫付款", "2241", "其他应付款", "0.00", value)
      ];
    }
  },
  {
    key: "payroll",
    label: "工资计提",
    description: "借职工薪酬，贷应付职工薪酬。",
    voucherType: "accrual",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-payroll-1", "计提工资成本", "6601", "职工薪酬", value, "0.00"),
        line("tpl-payroll-2", "确认应付职工薪酬", "2211", "应付职工薪酬", "0.00", value)
      ];
    }
  },
  {
    key: "asset",
    label: "固定资产采购",
    description: "借固定资产，贷应付账款。",
    voucherType: "payment",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-asset-1", "确认固定资产", "1601", "固定资产", value, "0.00"),
        line("tpl-asset-2", "确认应付账款", "2202", "应付账款", "0.00", value)
      ];
    }
  },
  {
    key: "financing-equity",
    label: "股东出资/增资到账",
    description: "借银行存款，贷实收资本。与 015 迁移真实分录（vch-002）口径一致。",
    voucherType: "receipt",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-financing-equity-1", "确认股东出资到账", "1002", "银行存款", value, "0.00"),
        line("tpl-financing-equity-2", "确认实收资本", "4001", "实收资本", "0.00", value)
      ];
    }
  },
  {
    key: "financing-loan",
    label: "银行借款到账",
    description: "借银行存款，贷短期借款。与 015 迁移真实分录（vch-016）口径一致；如为一年期以上借款，请人工调整为长期借款科目。",
    voucherType: "receipt",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-financing-loan-1", "确认借款到账", "1002", "银行存款", value, "0.00"),
        line("tpl-financing-loan-2", "确认短期借款", "2001", "短期借款", "0.00", value)
      ];
    }
  },
  {
    key: "rnd",
    label: "研发支出（费用化）",
    description: "借研发费用，贷银行存款。与 015 迁移真实分录（vch-009，委外研发首期款）口径一致；资本化研发投入请人工转入无形资产。",
    voucherType: "payment",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-rnd-1", "确认研发费用", "6401", "研发费用", value, "0.00"),
        line("tpl-rnd-2", "确认研发支出付款", "1002", "银行存款", "0.00", value)
      ];
    }
  },
  {
    key: "tax-income",
    label: "企业所得税计提/预缴",
    description: "借所得税费用，贷应交税费-企业所得税。",
    voucherType: "accrual",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-tax-income-1", "计提企业所得税", "6801", "所得税费用", value, "0.00"),
        line("tpl-tax-income-2", "确认应交税费-企业所得税", "2221", "应交税费-企业所得税", "0.00", value)
      ];
    }
  },
  {
    key: "tax-surcharge",
    label: "印花税等税金及附加计提",
    description: "借税金及附加，贷应交税费。覆盖印花税、城建税、教育费附加等场景；增值税、个人所得税代扣代缴涉及既有负债结转，不在此模板覆盖范围内。",
    voucherType: "accrual",
    buildLines(amount) {
      const value = money(amount);
      return [
        line("tpl-tax-surcharge-1", "计提税金及附加", "6403", "税金及附加", value, "0.00"),
        line("tpl-tax-surcharge-2", "确认应交税费", "2221", "应交税费", "0.00", value)
      ];
    }
  }
];

export function listVoucherTemplates(): VoucherTemplateDefinition[] {
  return templates;
}

export function getVoucherTemplate(templateKey: string): VoucherTemplateDefinition {
  const template = templates.find((item) => item.key === templateKey);
  if (!template) {
    throw new Error(`Unknown voucher template: ${templateKey}`);
  }
  return template;
}

export function buildVoucherTemplateDraft(
  input: BuildVoucherTemplateDraftInput
): BuiltVoucherTemplateDraft {
  const template = getVoucherTemplate(input.templateKey);
  const amount = money(input.amount);
  return {
    voucherType: template.voucherType,
    summary: input.summary?.trim() || `${template.label}模板生成`,
    lines: template.buildLines(amount),
    businessEventId: input.businessEventId,
    companyId: input.companyId
  };
}
