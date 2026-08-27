/**
 * 经营事项 → 单据 / 税务 / 凭证草稿的映射规则（V15/P2 自 routes.ts 拆出）。
 *
 * 这是本模块的**业务核心**：一条事项该派生出哪些单据、要交哪些税、
 * 该做什么分录，全在这里。500 多行混在路由文件里时，改一条规则要在
 * 两千行里找位置，而它和 HTTP 层没有任何关系。
 */
import type {
  BusinessEvent,
  BusinessEventMappingBundle,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  GeneratedDocument,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";
import { uniqueId } from "../../utils/id.js";
import { buildContractRevenueBundle } from "./contract-revenue-rules.js";
import { buildPurchaseExpenseBundle } from "./purchase-expense-rules.js";
import { buildTravelExpenseBundle } from "./travel-expense-rules.js";
import { buildGeneratedTasksForEvent } from "./task-chain.js";

export function makeId(prefix: string, eventId: string, suffix: string) {
  return `${prefix}-${eventId}-${suffix}`;
}

export function quarterLabel(dateString: string) {
  const year = dateString.slice(0, 4);
  const month = Number(dateString.slice(5, 7));
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/**
 * 未知事项类型的兜底凭证草稿占位科目。这不是会计科目，凭证状态恒为 draft，
 * 必须由人工替换成真实叶子科目后才能过账；科目码护栏测试对它单独放行。
 */
export const PENDING_ACCOUNT_CODE = "待定";

/**
 * 按业务事项类型生成资料/税务/凭证草稿映射。
 * 导出是为了让科目码护栏测试（vouchers/account-code-guard.test.ts）能直接覆盖
 * 这里内联的凭证分录——它们和 events/*-rules.ts 一样会落成真实分录。
 */
export function buildEventMappings(event: BusinessEvent): BusinessEventMappingBundle {
  const amount = event.amount || "0.00";
  /**
   * 事项金额的整数分，作为派生税项的计税依据。
   *
   * 事项没填金额时是 `null` 而不是 0——「不知道多少钱」和「零元」是两回事，
   * 后者会静默参与申报合计。见 `TaxItem.taxableAmountCents`。
   */
  const taxableAmountCents =
    event.amount === null || event.amount === undefined || event.amount === ""
      ? null
      : Math.round(Number(event.amount) * 100);
  const documentMappings: EventDocumentMapping[] = [];
  const taxMappings: EventTaxMapping[] = [];
  const voucherDrafts: EventVoucherDraft[] = [];
  const eventType = String(event.type);

  switch (eventType) {
    case "contract_revenue":
      return buildContractRevenueBundle(event);
    case "purchase_expense":
      return buildPurchaseExpenseBundle(event);
    case "travel_expense":
      return buildTravelExpenseBundle(event);
    case "sales":
      documentMappings.push(
        {
          id: makeId("doc-map", event.id, "contract"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "contract",
          title: "销售合同/订单归档",
          status: "generated",
          ownerDepartment: event.department,
          notes: "作为开票、回款和收入确认的主依据。"
        },
        {
          id: makeId("doc-map", event.id, "invoice"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "invoice_application",
          title: "开票申请与客户开票信息",
          status: "required",
          ownerDepartment: "财务部",
          notes: "需核对税率、抬头、纳税识别号和开票时点。"
        },
        {
          id: makeId("doc-map", event.id, "collection"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "collection_schedule",
          title: "回款计划与对账记录",
          status: "suggested",
          ownerDepartment: event.department,
          notes: "用于合同、开票、回款、收入确认勾稽。"
        }
      );
      taxMappings.push(
        {
          id: makeId("tax-map", event.id, "vat"),
          companyId: event.companyId,
          businessEventId: event.id,
          taxType: "增值税",
          treatment: "确认销项税并纳入当期或后续开票申报计划。",
          status: "pending",
          basis: "需结合交付、验收或约定开票条件确认纳税义务发生时点。",
          taxableAmountCents,
          filingPeriod: event.occurredOn.slice(0, 7)
        },
        {
          id: makeId("tax-map", event.id, "stamp"),
          companyId: event.companyId,
          businessEventId: event.id,
          taxType: "印花税",
          treatment: "将合同金额纳入应税合同台账复核。",
          status: "attention",
          basis: "需按合同性质复核税目与计税依据。",
          taxableAmountCents,
          filingPeriod: quarterLabel(event.occurredOn)
        }
      );
      voucherDrafts.push({
        id: makeId("vou-map", event.id, "sales"),
        companyId: event.companyId,
        businessEventId: event.id,
        voucherType: "accrual",
        status: "review_required",
        summary: `${event.title} 收入确认草稿`,
        lines: [
          {
            id: makeId("vou-line", event.id, "debit-ar"),
            summary: "确认应收款",
            accountCode: "1122",
            accountName: "应收账款",
            debit: amount,
            credit: "0.00"
          },
          {
            id: makeId("vou-line", event.id, "credit-revenue"),
            summary: "确认主营业务收入",
            accountCode: "6001",
            accountName: "主营业务收入",
            debit: "0.00",
            credit: amount
          }
        ]
      });
      break;
    case "procurement":
    case "asset":
      documentMappings.push(
        {
          id: makeId("doc-map", event.id, "purchase"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "purchase_contract",
          title: "采购合同/订单",
          status: "generated",
          ownerDepartment: event.department,
          notes: "作为采购、付款和验收的主依据。"
        },
        {
          id: makeId("doc-map", event.id, "invoice"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "supplier_invoice",
          title: "供应商发票",
          status: "required",
          ownerDepartment: "财务部",
          notes: "用于成本、资产入账和进项税额复核。"
        },
        {
          id: makeId("doc-map", event.id, "acceptance"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "acceptance_record",
          title: event.type === "asset" ? "资产验收单" : "采购验收单",
          status: "required",
          ownerDepartment: event.department,
          notes: "未验收前不建议直接形成最终入账结论。"
        }
      );
      taxMappings.push({
        id: makeId("tax-map", event.id, "input-vat"),
        companyId: event.companyId,
        businessEventId: event.id,
        taxType: "增值税",
        treatment: "复核专票、用途和认证条件后再确认是否可抵扣进项税额。",
        status: "attention",
        basis: "需取得合规发票并满足业务用途条件。",
        taxableAmountCents,
        filingPeriod: event.occurredOn.slice(0, 7)
      });
      voucherDrafts.push({
        id: makeId("vou-map", event.id, "purchase"),
        companyId: event.companyId,
        businessEventId: event.id,
        voucherType: "payment",
        status: "review_required",
        summary: `${event.title} ${event.type === "asset" ? "资产" : "采购"}入账草稿`,
        lines: [
          {
            id: makeId("vou-line", event.id, "debit-main"),
            summary: "确认采购/资产",
            accountCode: event.type === "asset" ? "1601" : "1401",
            accountName: event.type === "asset" ? "固定资产" : "原材料",
            debit: amount,
            credit: "0.00"
          },
          {
            id: makeId("vou-line", event.id, "credit-ap"),
            summary: "确认应付款",
            accountCode: "2202",
            accountName: "应付账款",
            debit: "0.00",
            credit: amount
          }
        ]
      });
      break;
    case "expense":
      documentMappings.push(
        {
          id: makeId("doc-map", event.id, "expense-form"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "expense_claim",
          title: "费用报销单",
          status: "generated",
          ownerDepartment: event.department,
          notes: "应列明事由、时间、经办人、审批流。"
        },
        {
          id: makeId("doc-map", event.id, "receipts"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "invoice_bundle",
          title: "报销票据包",
          status: "required",
          ownerDepartment: "财务部",
          notes: "需补齐发票、回单、差旅行程或招待说明。"
        }
      );
      taxMappings.push(
        {
          id: makeId("tax-map", event.id, "input-vat"),
          companyId: event.companyId,
          businessEventId: event.id,
          taxType: "增值税",
          treatment: "复核发票类型、用途与抵扣条件，判断是否形成可抵扣进项税额。",
          status: "attention",
          basis: "报销事项如取得合规专票且用途符合规定，需同步进入进项税额复核。",
          taxableAmountCents,
          filingPeriod: event.occurredOn.slice(0, 7)
        },
        {
          id: makeId("tax-map", event.id, "eit"),
          companyId: event.companyId,
          businessEventId: event.id,
          taxType: "企业所得税",
          treatment: "复核费用真实性、关联性和税前扣除凭证完整性。",
          status: "attention",
          basis: "资料不完整时不应直接作为最终税前扣除依据。",
          filingPeriod: event.occurredOn.slice(0, 7)
        }
      );
      voucherDrafts.push({
        id: makeId("vou-map", event.id, "expense"),
        companyId: event.companyId,
        businessEventId: event.id,
        voucherType: "payment",
        status: "review_required",
        summary: `${event.title} 费用报销草稿`,
        lines: [
          {
            id: makeId("vou-line", event.id, "debit-expense"),
            summary: "确认费用",
            accountCode: "660207",
            accountName: "管理费用-其他",
            debit: amount,
            credit: "0.00"
          },
          {
            id: makeId("vou-line", event.id, "credit-payable"),
            summary: "确认员工垫付款",
            accountCode: "2241",
            accountName: "其他应付款",
            debit: "0.00",
            credit: amount
          }
        ]
      });
      break;
    case "payroll":
      documentMappings.push(
        {
          id: makeId("doc-map", event.id, "payroll"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "payroll_sheet",
          title: "工资表与审批单",
          status: "required",
          ownerDepartment: "人事行政部",
          notes: "工资、奖金、补贴应与考勤和审批单一致。"
        },
        {
          id: makeId("doc-map", event.id, "attendance"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "attendance_record",
          title: "考勤与绩效附件",
          status: "suggested",
          ownerDepartment: "人事行政部",
          notes: "用于工资分配与合规复核。"
        }
      );
      taxMappings.push(
        {
          id: makeId("tax-map", event.id, "iit"),
          companyId: event.companyId,
          businessEventId: event.id,
          taxType: "个人所得税",
          treatment: "纳入工资薪金个税申报批次。",
          status: "pending",
          basis: "需复核专项附加扣除、累计预扣数据。",
          filingPeriod: event.occurredOn.slice(0, 7)
        },
        {
          id: makeId("tax-map", event.id, "social"),
          companyId: event.companyId,
          businessEventId: event.id,
          taxType: "社保公积金",
          treatment: "按员工归属和申报基数生成缴费台账。",
          status: "pending",
          basis: "需复核当月在职人数和基数。",
          filingPeriod: event.occurredOn.slice(0, 7)
        }
      );
      voucherDrafts.push({
        id: makeId("vou-map", event.id, "payroll"),
        companyId: event.companyId,
        businessEventId: event.id,
        voucherType: "accrual",
        status: "review_required",
        summary: `${event.title} 工资计提草稿`,
        lines: [
          {
            id: makeId("vou-line", event.id, "debit-payroll"),
            summary: "计提工资费用",
            // D6：此前挂 6601「职工薪酬（成本）」，已由迁移 079 废弃——
            // 同一件业务事实，此前的科目取决于用户从哪个入口进来（工资模块挂
            // 管理费用、模板与本处挂 6601），现在统一到 660208。
            accountCode: "660208",
            accountName: "管理费用-工资",
            debit: amount,
            credit: "0.00"
          },
          {
            id: makeId("vou-line", event.id, "credit-payroll"),
            summary: "确认应付职工薪酬",
            accountCode: "22110101",
            accountName: "应付职工薪酬-工资",
            debit: "0.00",
            credit: amount
          }
        ]
      });
      break;
    case "rnd":
      documentMappings.push(
        {
          id: makeId("doc-map", event.id, "project"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "rnd_project_file",
          title: "研发项目立项资料",
          status: "required",
          ownerDepartment: "研发部",
          notes: "需包含立项、预算、成员、目标与阶段成果。"
        },
        {
          id: makeId("doc-map", event.id, "timesheet"),
          companyId: event.companyId,
          businessEventId: event.id,
          documentType: "timesheet",
          title: "研发工时与费用归集附件",
          status: "required",
          ownerDepartment: "研发部",
          notes: "用于辅助账与加计扣除口径。"
        }
      );
      taxMappings.push({
        id: makeId("tax-map", event.id, "rnd"),
        companyId: event.companyId,
        businessEventId: event.id,
        taxType: "研发加计扣除",
        treatment: "纳入研发辅助账和汇算优惠备查。",
        status: "attention",
        basis: "需判断是否属于研发活动并形成费用归集证据链。",
        filingPeriod: event.occurredOn.slice(0, 4)
      });
      voucherDrafts.push({
        id: makeId("vou-map", event.id, "rnd"),
        companyId: event.companyId,
        businessEventId: event.id,
        voucherType: "accrual",
        status: "review_required",
        summary: `${event.title} 研发费用归集草稿`,
        lines: [
          {
            id: makeId("vou-line", event.id, "debit-rnd"),
            summary: "归集研发支出",
            accountCode: "1801001",
            accountName: "研发支出-费用化支出",
            debit: amount,
            credit: "0.00"
          },
          {
            id: makeId("vou-line", event.id, "credit-rnd"),
            summary: "确认待支付/已支付款项",
            accountCode: "2202",
            accountName: "应付账款",
            debit: "0.00",
            credit: amount
          }
        ]
      });
      break;
    default:
      documentMappings.push({
        id: makeId("doc-map", event.id, "general"),
        companyId: event.companyId,
        businessEventId: event.id,
        documentType: "supporting_document",
        title: "经营事项支撑资料包",
        status: "required",
        ownerDepartment: event.department,
        notes: "需至少补齐业务背景、审批依据、付款或收款证据。"
      });
      taxMappings.push({
        id: makeId("tax-map", event.id, "general"),
        companyId: event.companyId,
        businessEventId: event.id,
        taxType: "综合复核",
        treatment: "根据事项类型复核税种影响，不直接形成最终申报结论。",
        status: "attention",
        basis: "当前仅形成分析映射，待资料补齐后再进入正式处理。",
        filingPeriod: event.occurredOn.slice(0, 7)
      });
      voucherDrafts.push({
        id: makeId("vou-map", event.id, "general"),
        companyId: event.companyId,
        businessEventId: event.id,
        voucherType: "general",
        status: "draft",
        summary: `${event.title} 通用凭证草稿`,
        lines: [
          {
            id: makeId("vou-line", event.id, "debit-general"),
            summary: "待人工补充会计科目",
            accountCode: PENDING_ACCOUNT_CODE,
            accountName: "待人工确认",
            debit: amount,
            credit: "0.00"
          },
          {
            id: makeId("vou-line", event.id, "credit-general"),
            summary: "待人工补充对方科目",
            accountCode: PENDING_ACCOUNT_CODE,
            accountName: "待人工确认",
            debit: "0.00",
            credit: amount
          }
        ]
      });
      break;
  }

  return {
    businessEventId: event.id,
    documentMappings,
    taxMappings,
    voucherDrafts,
    generatedAt: new Date().toISOString()
  };
}

export function toGeneratedDocuments(
  bundle: BusinessEventMappingBundle,
  generatedAt: string
): GeneratedDocument[] {
  return bundle.documentMappings.map((mapping) => ({
    id: `doc-${mapping.businessEventId}-${mapping.documentType}`,
    companyId: mapping.companyId,
    businessEventId: mapping.businessEventId,
    mappingId: mapping.id,
    documentType: mapping.documentType,
    title: mapping.title,
    ownerDepartment: mapping.ownerDepartment,
    status:
      mapping.status === "generated"
        ? "ready"
        : mapping.status === "missing"
          ? "awaiting_upload"
          : "draft",
    attachmentIds: [],
    archivedAt: null,
    source: "analysis",
    createdAt: generatedAt,
    updatedAt: generatedAt
  }));
}

export function toTaxItems(bundle: BusinessEventMappingBundle, generatedAt: string): TaxItem[] {
  return bundle.taxMappings.map((mapping) => ({
    id: `tax-item-${mapping.businessEventId}-${mapping.taxType}`,
    companyId: mapping.companyId,
    businessEventId: mapping.businessEventId,
    mappingId: mapping.id,
    taxType: mapping.taxType,
    treatment: mapping.treatment,
    basis: mapping.basis,
    // `?? null` 而不是 `?? 0`：映射没给计税依据时如实记「不知道」。
    // 填 0 会让这条税项以零金额参与申报合计，而没有任何提示。
    taxableAmountCents: mapping.taxableAmountCents ?? null,
    filingPeriod: mapping.filingPeriod,
    status:
      mapping.status === "ready"
        ? "ready"
        : mapping.status === "pending"
          ? "pending"
          : "review_required",
    source: "analysis",
    createdAt: generatedAt,
    updatedAt: generatedAt
  }));
}

/**
 * `occurredOn` 是这批凭证的会计日期 —— 事项分析出来的凭证，账要记在业务发生的
 * 那个期间，而不是跑分析的那天。
 */
export function toVouchers(
  bundle: BusinessEventMappingBundle,
  generatedAt: string,
  occurredOn: string
): Voucher[] {
  return bundle.voucherDrafts.map((draft) => ({
    id: `voucher-${draft.businessEventId}-${draft.voucherType}`,
    companyId: draft.companyId,
    businessEventId: draft.businessEventId,
    mappingId: draft.id,
    voucherType: draft.voucherType,
    accountingDate: occurredOn,
    voucherNumber: null,
    summary: draft.summary,
    status: draft.status === "ready" ? "posted" : draft.status,
    lines: draft.lines,
    approvedAt: null,
    postedAt: draft.status === "ready" ? generatedAt : null,
    source: "analysis",
    createdAt: generatedAt,
    updatedAt: generatedAt
  }));
}
