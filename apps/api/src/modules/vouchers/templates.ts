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
