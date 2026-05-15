import type { ServerResponse } from "node:http";
import type {
  BusinessEvent,
  BusinessEventActivity,
  BusinessEventMappingBundle,
  BusinessEventRelation,
  CreateBusinessEventInput,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  GeneratedDocument,
  Task,
  TaskTreeNode,
  TaxItem,
  Voucher,
  VoucherDraftLine
} from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { query, withTransaction } from "../../db/client.js";
import { listCompanyDocuments } from "../documents/routes.js";
import { listCompanyTaxItems } from "../tax/routes.js";
import { listCompanyVouchers } from "../vouchers/routes.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";

interface BusinessEventRow {
  id: string;
  company_id: string;
  type: BusinessEvent["type"];
  title: string;
  description: string;
  department: string;
  owner_id: string | null;
  occurred_on: string | Date;
  amount: string | number | null;
  currency: string;
  status: BusinessEvent["status"];
  source: BusinessEvent["source"];
  counterparty_id: string | null;
  project_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface BusinessEventRelationRow {
  id: string;
  company_id: string;
  business_event_id: string;
  relation_type: BusinessEventRelation["relationType"];
  target_id: string;
  label: string;
  created_at: string | Date;
}

interface BusinessEventActivityRow {
  id: string;
  company_id: string;
  business_event_id: string;
  activity_type: BusinessEventActivity["activityType"];
  actor_user_id: string | null;
  actor_name: string;
  summary: string;
  created_at: string | Date;
}

interface TaskRow {
  id: string;
  company_id: string;
  business_event_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  owner_id: string | null;
  due_at: string | Date | null;
  assignee_department: string | null;
  source: Task["source"];
  created_at: string | Date;
  updated_at: string | Date;
}

interface EventDocumentMappingRow {
  id: string;
  company_id: string;
  business_event_id: string;
  document_type: string;
  title: string;
  status: EventDocumentMapping["status"];
  owner_department: string;
  notes: string;
  created_at: string | Date;
}

interface EventTaxMappingRow {
  id: string;
  company_id: string;
  business_event_id: string;
  tax_type: string;
  treatment: string;
  status: EventTaxMapping["status"] | "required";
  basis: string;
  filing_period: string;
  created_at: string | Date;
}

interface EventVoucherDraftRow {
  id: string;
  company_id: string;
  business_event_id: string;
  voucher_type: EventVoucherDraft["voucherType"];
  status: EventVoucherDraft["status"];
  summary: string;
  created_at: string | Date;
}

interface VoucherDraftLineRow {
  id: string;
  draft_id: string;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  sort_order: number;
}

interface DbExecutor {
  query<T extends object = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAmountString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" ? value.toFixed(2) : String(value);
}

function mapEventRow(row: BusinessEventRow): BusinessEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    type: row.type,
    title: row.title,
    description: row.description,
    department: row.department,
    ownerId: row.owner_id,
    occurredOn: toIsoString(row.occurred_on)?.slice(0, 10) || "",
    amount: toAmountString(row.amount),
    currency: row.currency,
    status: row.status,
    source: row.source,
    counterpartyId: row.counterparty_id,
    projectId: row.project_id,
    createdAt: toIsoString(row.created_at) || undefined,
    updatedAt: toIsoString(row.updated_at) || undefined
  };
}

function mapRelationRow(row: BusinessEventRelationRow): BusinessEventRelation {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    relationType: row.relation_type,
    targetId: row.target_id,
    label: row.label,
    createdAt: toIsoString(row.created_at) || new Date().toISOString()
  };
}

function mapActivityRow(row: BusinessEventActivityRow): BusinessEventActivity {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    activityType: row.activity_type,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    summary: row.summary,
    createdAt: toIsoString(row.created_at) || new Date().toISOString()
  };
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    parentTaskId: row.parent_task_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    ownerId: row.owner_id,
    dueAt: toIsoString(row.due_at),
    assigneeDepartment: row.assignee_department,
    source: row.source,
    createdAt: toIsoString(row.created_at) || undefined,
    updatedAt: toIsoString(row.updated_at) || undefined
  };
}

function mapDocumentMappingRow(row: EventDocumentMappingRow): EventDocumentMapping {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    documentType: row.document_type,
    title: row.title,
    status: row.status,
    ownerDepartment: row.owner_department,
    notes: row.notes
  };
}

function mapTaxMappingRow(row: EventTaxMappingRow): EventTaxMapping {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    taxType: row.tax_type,
    treatment: row.treatment,
    status: row.status === "required" ? "attention" : row.status,
    basis: row.basis,
    filingPeriod: row.filing_period
  };
}

function mapVoucherLineRow(row: VoucherDraftLineRow): VoucherDraftLine {
  return {
    id: row.id,
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: toAmountString(row.debit) || "0.00",
    credit: toAmountString(row.credit) || "0.00"
  };
}

function buildVoucherDrafts(
  rows: EventVoucherDraftRow[],
  lineRows: VoucherDraftLineRow[]
): EventVoucherDraft[] {
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    voucherType: row.voucher_type,
    status: row.status,
    summary: row.summary,
    lines: lineRows
      .filter((line) => line.draft_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapVoucherLineRow)
  }));
}

export function hasCompanyWideAccess(roleCodes: string[]) {
  return roleCodes.some((role) => ["role-chairman", "role-finance-director"].includes(role));
}

export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const nodeMap = new Map<string, TaskTreeNode>();
  for (const task of tasks) {
    nodeMap.set(task.id, { ...task, children: [] });
  }
  const roots: TaskTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentTaskId) {
      const parent = nodeMap.get(node.parentTaskId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }
  return roots;
}

function scopeEvents(rows: BusinessEvent[], req: ApiRequest) {
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  if (hasCompanyWideAccess(req.auth!.roleCodes)) {
    return companyRows;
  }
  return companyRows.filter(
    (row) => row.ownerId === req.auth!.userId || row.department === req.auth!.departmentName
  );
}

function buildActivity(
  req: ApiRequest,
  businessEventId: string,
  activityType: BusinessEventActivity["activityType"],
  summary: string
): BusinessEventActivity {
  return {
    id: `act-${businessEventId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    companyId: req.auth!.companyId,
    businessEventId,
    activityType,
    actorUserId: req.auth!.userId,
    actorName: req.auth!.username,
    summary,
    createdAt: new Date().toISOString()
  };
}

function makeId(prefix: string, eventId: string, suffix: string) {
  return `${prefix}-${eventId}-${suffix}`;
}

function quarterLabel(dateString: string) {
  const year = dateString.slice(0, 4);
  const month = Number(dateString.slice(5, 7));
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

function buildEventMappings(event: BusinessEvent): BusinessEventMappingBundle {
  const amount = event.amount || "0.00";
  const documentMappings: EventDocumentMapping[] = [];
  const taxMappings: EventTaxMapping[] = [];
  const voucherDrafts: EventVoucherDraft[] = [];

  switch (event.type) {
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
            accountCode: event.type === "asset" ? "1601" : "1403",
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
      taxMappings.push({
        id: makeId("tax-map", event.id, "eit"),
        companyId: event.companyId,
        businessEventId: event.id,
        taxType: "企业所得税",
        treatment: "复核费用真实性、关联性和税前扣除凭证完整性。",
        status: "attention",
        basis: "资料不完整时不应直接作为最终税前扣除依据。",
        filingPeriod: event.occurredOn.slice(0, 7)
      });
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
            accountCode: "6602",
            accountName: "管理费用",
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
            summary: "计提工资成本",
            accountCode: "6601",
            accountName: "职工薪酬",
            debit: amount,
            credit: "0.00"
          },
          {
            id: makeId("vou-line", event.id, "credit-payroll"),
            summary: "确认应付职工薪酬",
            accountCode: "2211",
            accountName: "应付职工薪酬",
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
            accountCode: "研发支出",
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
            accountCode: "待定",
            accountName: "待人工确认",
            debit: amount,
            credit: "0.00"
          },
          {
            id: makeId("vou-line", event.id, "credit-general"),
            summary: "待人工补充对方科目",
            accountCode: "待定",
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

function toGeneratedDocuments(
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

function toTaxItems(bundle: BusinessEventMappingBundle, generatedAt: string): TaxItem[] {
  return bundle.taxMappings.map((mapping) => ({
    id: `tax-item-${mapping.businessEventId}-${mapping.taxType}`,
    companyId: mapping.companyId,
    businessEventId: mapping.businessEventId,
    mappingId: mapping.id,
    taxType: mapping.taxType,
    treatment: mapping.treatment,
    basis: mapping.basis,
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

function toVouchers(bundle: BusinessEventMappingBundle, generatedAt: string): Voucher[] {
  return bundle.voucherDrafts.map((draft) => ({
    id: `voucher-${draft.businessEventId}-${draft.voucherType}`,
    companyId: draft.companyId,
    businessEventId: draft.businessEventId,
    mappingId: draft.id,
    voucherType: draft.voucherType,
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

export async function listCompanyEvents(companyId: string): Promise<BusinessEvent[]> {
  const rows = await query<BusinessEventRow>(
    `
      select
        id,
        company_id,
        type,
        title,
        description,
        department,
        owner_id,
        occurred_on,
        amount,
        currency,
        status,
        source,
        counterparty_id,
        project_id,
        created_at,
        updated_at
      from business_events
      where company_id = $1
      order by occurred_on desc, created_at desc
    `,
    [companyId]
  );
  return rows.map(mapEventRow);
}

export async function listCompanyTasks(companyId: string): Promise<Task[]> {
  const rows = await query<TaskRow>(
    `
      select
        id,
        company_id,
        business_event_id,
        parent_task_id,
        title,
        description,
        status,
        priority,
        owner_id,
        due_at,
        assignee_department,
        source,
        created_at,
        updated_at
      from tasks
      where company_id = $1
      order by created_at desc
    `,
    [companyId]
  );
  return rows.map(mapTaskRow);
}

async function insertActivities(executor: DbExecutor, activities: BusinessEventActivity[]) {
  for (const activity of activities) {
    await executor.query(
      `
        insert into business_event_activities (
          id,
          company_id,
          business_event_id,
          activity_type,
          actor_user_id,
          actor_name,
          summary,
          created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
      `,
      [
        activity.id,
        activity.companyId,
        activity.businessEventId,
        activity.activityType,
        activity.actorUserId,
        activity.actorName,
        activity.summary,
        activity.createdAt
      ]
    );
  }
}

async function insertTasks(executor: DbExecutor, tasks: Task[]) {
  for (const task of tasks) {
    await executor.query(
      `
        insert into tasks (
          id,
          company_id,
          business_event_id,
          parent_task_id,
          title,
          description,
          status,
          priority,
          owner_id,
          due_at,
          assignee_department,
          source,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11, $12, $13::timestamptz, $14::timestamptz)
      `,
      [
        task.id,
        task.companyId,
        task.businessEventId,
        task.parentTaskId,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.ownerId,
        task.dueAt,
        task.assigneeDepartment,
        task.source,
        task.createdAt,
        task.updatedAt
      ]
    );
  }
}

async function insertDocumentMappings(executor: DbExecutor, rows: EventDocumentMapping[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into event_document_mappings (
          id,
          company_id,
          business_event_id,
          document_type,
          title,
          status,
          owner_department,
          notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.documentType,
        row.title,
        row.status,
        row.ownerDepartment,
        row.notes
      ]
    );
  }
}

async function insertTaxMappings(executor: DbExecutor, rows: EventTaxMapping[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into event_tax_mappings (
          id,
          company_id,
          business_event_id,
          tax_type,
          treatment,
          status,
          basis,
          filing_period
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.taxType,
        row.treatment,
        row.status,
        row.basis,
        row.filingPeriod
      ]
    );
  }
}

async function insertVoucherDrafts(executor: DbExecutor, rows: EventVoucherDraft[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into event_voucher_drafts (
          id,
          company_id,
          business_event_id,
          voucher_type,
          status,
          summary
        ) values ($1, $2, $3, $4, $5, $6)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.voucherType,
        row.status,
        row.summary
      ]
    );
    for (const [index, line] of row.lines.entries()) {
      await executor.query(
        `
          insert into voucher_draft_lines (
            id,
            draft_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)
        `,
        [
          line.id,
          row.id,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index
        ]
      );
    }
  }
}

async function insertGeneratedDocuments(executor: DbExecutor, rows: GeneratedDocument[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into generated_documents (
          id,
          company_id,
          business_event_id,
          mapping_id,
          document_type,
          title,
          owner_department,
          status,
          source,
          archived_at,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.mappingId,
        row.documentType,
        row.title,
        row.ownerDepartment,
        row.status,
        row.source,
        row.archivedAt,
        row.createdAt,
        row.updatedAt
      ]
    );
  }
}

async function insertTaxItems(executor: DbExecutor, rows: TaxItem[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into tax_items (
          id,
          company_id,
          business_event_id,
          mapping_id,
          tax_type,
          treatment,
          basis,
          filing_period,
          status,
          source,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.mappingId,
        row.taxType,
        row.treatment,
        row.basis,
        row.filingPeriod,
        row.status,
        row.source,
        row.createdAt,
        row.updatedAt
      ]
    );
  }
}

async function insertVouchers(executor: DbExecutor, rows: Voucher[]) {
  for (const row of rows) {
    await executor.query(
      `
        insert into vouchers (
          id,
          company_id,
          business_event_id,
          mapping_id,
          voucher_type,
          summary,
          status,
          source,
          approved_at,
          posted_at,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      `,
      [
        row.id,
        row.companyId,
        row.businessEventId,
        row.mappingId,
        row.voucherType,
        row.summary,
        row.status,
        row.source,
        row.approvedAt,
        row.postedAt,
        row.createdAt,
        row.updatedAt
      ]
    );
    for (const [index, line] of row.lines.entries()) {
      await executor.query(
        `
          insert into voucher_lines (
            id,
            voucher_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)
        `,
        [
          line.id,
          row.id,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index
        ]
      );
    }
  }
}

export function handleEventsMeta(_req: ApiRequest, res: ServerResponse) {
  return json(res, 200, {
    module: "events",
    plannedEndpoints: [
      "GET /api/events",
      "POST /api/events",
      "GET /api/events/:id",
      "PUT /api/events/:id",
      "POST /api/events/:id/analyze",
      "POST /api/events/:id/relations"
    ]
  });
}

export async function listEvents(req: ApiRequest, res: ServerResponse) {
  const rows = await listCompanyEvents(req.auth!.companyId);
  const scoped = scopeEvents(rows, req);
  return json(res, 200, { items: scoped, total: scoped.length });
}

export async function createEvent(req: ApiRequest, res: ServerResponse) {
  const body = req.body as CreateBusinessEventInput;
  const now = new Date().toISOString();
  const next: BusinessEvent = {
    id: `evt-${Date.now()}`,
    companyId: req.auth!.companyId,
    type: body.type,
    title: body.title,
    description: body.description,
    department: body.department,
    ownerId: req.auth!.userId,
    occurredOn: body.occurredOn,
    amount: body.amount,
    currency: body.currency || "CNY",
    status: "draft",
    source: body.source,
    counterpartyId: null,
    projectId: null,
    createdAt: now,
    updatedAt: now
  };
  const activity = buildActivity(req, next.id, "created", `创建经营事项：${next.title}`);

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into business_events (
          id,
          company_id,
          type,
          title,
          description,
          department,
          owner_id,
          occurred_on,
          amount,
          currency,
          status,
          source,
          counterparty_id,
          project_id,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::numeric, $10, $11, $12, $13, $14, $15::timestamptz, $16::timestamptz)
      `,
      [
        next.id,
        next.companyId,
        next.type,
        next.title,
        next.description,
        next.department,
        next.ownerId,
        next.occurredOn,
        next.amount,
        next.currency,
        next.status,
        next.source,
        next.counterpartyId,
        next.projectId,
        next.createdAt,
        next.updatedAt
      ]
    );
    await insertActivities(client, [activity]);
  });

  writeAudit({
    companyId: next.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "create",
    resourceType: "business_event",
    resourceId: next.id,
    resourceLabel: next.title,
    changes: { data: { type: next.type, status: next.status, amount: next.amount } }
  });

  return json(res, 201, next);
}

export async function getEventDetail(req: ApiRequest, res: ServerResponse, eventId: string) {
  const companyEvents = await listCompanyEvents(req.auth!.companyId);
  const event = scopeEvents(companyEvents, req).find((row) => row.id === eventId);
  if (!event) {
    return json(res, 404, { error: "Event not found" });
  }

  const [relationRows, taskRows, activityRows, documentMappingRows, taxMappingRows, voucherDraftRows, voucherLineRows, documents, taxItems, vouchers] =
    await Promise.all([
      query<BusinessEventRelationRow>(
        `
          select id, company_id, business_event_id, relation_type, target_id, label, created_at
          from business_event_relations
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<TaskRow>(
        `
          select
            id, company_id, business_event_id, parent_task_id, title, description,
            status, priority, owner_id, due_at, assignee_department, source, created_at, updated_at
          from tasks
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<BusinessEventActivityRow>(
        `
          select
            id, company_id, business_event_id, activity_type, actor_user_id, actor_name, summary, created_at
          from business_event_activities
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<EventDocumentMappingRow>(
        `
          select
            id, company_id, business_event_id, document_type, title, status, owner_department, notes, created_at
          from event_document_mappings
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<EventTaxMappingRow>(
        `
          select
            id, company_id, business_event_id, tax_type, treatment, status, basis, filing_period, created_at
          from event_tax_mappings
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<EventVoucherDraftRow>(
        `
          select
            id, company_id, business_event_id, voucher_type, status, summary, created_at
          from event_voucher_drafts
          where company_id = $1 and business_event_id = $2
          order by created_at desc
        `,
        [req.auth!.companyId, event.id]
      ),
      query<VoucherDraftLineRow>(
        `
          select
            l.id, l.draft_id, l.summary, l.account_code, l.account_name, l.debit, l.credit, l.sort_order
          from voucher_draft_lines l
          join event_voucher_drafts d on d.id = l.draft_id
          where d.company_id = $1 and d.business_event_id = $2
          order by l.sort_order asc
        `,
        [req.auth!.companyId, event.id]
      ),
      listCompanyDocuments(req.auth!.companyId, { businessEventId: event.id }),
      listCompanyTaxItems(req.auth!.companyId, { businessEventId: event.id }),
      listCompanyVouchers(req.auth!.companyId, { businessEventId: event.id })
    ]);

  const tasks = taskRows.map(mapTaskRow);
  const documentMappings = documentMappingRows.map(mapDocumentMappingRow);
  const taxMappings = taxMappingRows.map(mapTaxMappingRow);
  const voucherDrafts = buildVoucherDrafts(voucherDraftRows, voucherLineRows);
  const mappingTimes = [
    ...documentMappingRows.map((row) => toIsoString(row.created_at)),
    ...taxMappingRows.map((row) => toIsoString(row.created_at)),
    ...voucherDraftRows.map((row) => toIsoString(row.created_at))
  ].filter(Boolean) as string[];
  const mappingGeneratedAt = mappingTimes.sort().at(-1) || "";

  return json(res, 200, {
    ...event,
    relations: relationRows.map(mapRelationRow),
    tasks,
    taskTree: buildTaskTree(tasks),
    documentMappings,
    taxMappings,
    voucherDrafts,
    generatedDocuments: documents,
    taxItems,
    vouchers,
    mappingGeneratedAt,
    activities: activityRows.map(mapActivityRow)
  });
}

export async function updateEvent(req: ApiRequest, res: ServerResponse, eventId: string) {
  const companyEvents = await listCompanyEvents(req.auth!.companyId);
  const existing = scopeEvents(companyEvents, req).find((row) => row.id === eventId);
  if (!existing) {
    return json(res, 404, { error: "Event not found" });
  }

  const body = (req.body || {}) as Partial<BusinessEvent>;
  const updated: BusinessEvent = {
    ...existing,
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    department: body.department ?? existing.department,
    status: body.status ?? existing.status,
    amount: body.amount ?? existing.amount,
    occurredOn: body.occurredOn ?? existing.occurredOn,
    updatedAt: new Date().toISOString()
  };

  const activities = [
    buildActivity(req, updated.id, "updated", `更新经营事项：${updated.title}`)
  ];
  if (existing.status !== updated.status) {
    activities.unshift(
      buildActivity(
        req,
        updated.id,
        "status_changed",
        `状态变更：${existing.status} -> ${updated.status}`
      )
    );
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        update business_events
        set
          title = $1,
          description = $2,
          department = $3,
          status = $4,
          amount = $5::numeric,
          occurred_on = $6::date,
          updated_at = $7::timestamptz
        where id = $8 and company_id = $9
      `,
      [
        updated.title,
        updated.description,
        updated.department,
        updated.status,
        updated.amount,
        updated.occurredOn,
        updated.updatedAt,
        updated.id,
        updated.companyId
      ]
    );
    await insertActivities(client, activities);
  });

  writeAudit({
    companyId: updated.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: existing.status !== updated.status ? "update_status" : "update",
    resourceType: "business_event",
    resourceId: updated.id,
    resourceLabel: updated.title,
    changes: {
      before: { status: existing.status, title: existing.title },
      after: { status: updated.status, title: updated.title }
    }
  });

  return json(res, 200, updated);
}

export async function analyzeEvent(req: ApiRequest, res: ServerResponse, eventId: string) {
  const companyEvents = await listCompanyEvents(req.auth!.companyId);
  const target = scopeEvents(companyEvents, req).find((row) => row.id === eventId);
  if (!target) {
    return json(res, 404, { error: "Event not found" });
  }

  const now = new Date().toISOString();
  const parentTaskId = `task-${eventId}-root`;
  const generatedTasks: Task[] = [
    {
      id: parentTaskId,
      companyId: target.companyId,
      businessEventId: target.id,
      parentTaskId: null,
      title: "经营事项执行主任务",
      description: "统筹当前经营事项的资料、税务、记账和归档动作。",
      status: "not_started",
      priority: "high",
      ownerId: req.auth!.userId,
      dueAt: null,
      assigneeDepartment: "财务部",
      source: "ai",
      createdAt: now,
      updatedAt: now
    },
    {
      id: `task-${eventId}-finance`,
      companyId: target.companyId,
      businessEventId: target.id,
      parentTaskId,
      title: "核对资料完整性",
      description: "检查合同、发票、回单、验收资料是否齐备。",
      status: "not_started",
      priority: "high",
      ownerId: req.auth!.userId,
      dueAt: null,
      assigneeDepartment: "财务部",
      source: "ai",
      createdAt: now,
      updatedAt: now
    },
    {
      id: `task-${eventId}-tax`,
      companyId: target.companyId,
      businessEventId: target.id,
      parentTaskId,
      title: "生成税务处理建议",
      description: "输出税种影响、申报批次和风险提示。",
      status: "not_started",
      priority: "medium",
      ownerId: req.auth!.userId,
      dueAt: null,
      assigneeDepartment: "财务部",
      source: "ai",
      createdAt: now,
      updatedAt: now
    }
  ];

  const analyzedEvent: BusinessEvent = {
    ...target,
    status: "analyzed",
    updatedAt: now
  };
  const bundle = buildEventMappings(analyzedEvent);

  const nextDocuments = [
    ...toGeneratedDocuments(bundle, now)
  ];
  const nextTaxItems = [
    ...toTaxItems(bundle, now)
  ];
  const nextVouchers = [
    ...toVouchers(bundle, now)
  ];

  const analysisActivities = [
    buildActivity(
      req,
      eventId,
      "task_generated",
      `自动生成 ${generatedTasks.length} 个任务，并同步 ${nextDocuments.length} 份单据、${nextTaxItems.length} 条税务事项、${nextVouchers.length} 张凭证草稿。`
    ),
    buildActivity(req, eventId, "analyzed", "完成事项分析并输出执行建议。")
  ];

  await withTransaction(async (client) => {
    await client.query(
      `
        update business_events
        set status = 'analyzed', updated_at = $1::timestamptz
        where id = $2 and company_id = $3
      `,
      [now, target.id, target.companyId]
    );

    await client.query(
      `
        delete from tasks
        where company_id = $1 and business_event_id = $2 and source = 'ai'
      `,
      [target.companyId, target.id]
    );
    await insertTasks(client, generatedTasks);

    await client.query(
      `
        delete from voucher_draft_lines
        where draft_id in (
          select id from event_voucher_drafts
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from event_voucher_drafts
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from event_document_mappings
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from event_tax_mappings
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from document_attachment_records
        where document_id in (
          select id from generated_documents
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from generated_documents
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from tax_filing_batch_items
        where tax_item_id in (
          select id from tax_items
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from tax_items
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from ledger_posting_batch_entries
        where batch_id in (
          select id from ledger_posting_batches
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from ledger_posting_batches
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from ledger_entries
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from voucher_posting_records
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from voucher_lines
        where voucher_id in (
          select id from vouchers
          where company_id = $1 and business_event_id = $2
        )
      `,
      [target.companyId, target.id]
    );
    await client.query(
      `
        delete from vouchers
        where company_id = $1 and business_event_id = $2
      `,
      [target.companyId, target.id]
    );

    await insertDocumentMappings(client, bundle.documentMappings);
    await insertTaxMappings(client, bundle.taxMappings);
    await insertVoucherDrafts(client, bundle.voucherDrafts);
    await insertGeneratedDocuments(client, nextDocuments);
    await insertTaxItems(client, nextTaxItems);
    await insertVouchers(client, nextVouchers);
    await insertActivities(client, analysisActivities);
  });

  return json(res, 200, {
    eventId,
    generatedTasks: generatedTasks.length,
    status: "analyzed"
  });
}
