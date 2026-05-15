import type { ServerResponse } from "node:http";
import type {
  BusinessEventActivity,
  BusinessEvent,
  BusinessEventMappingBundle,
  BusinessEventRelation,
  CreateBusinessEventInput,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  GeneratedDocument,
  Task,
  TaxItem,
  TaskTreeNode,
  Voucher
} from "@finance-taxation/domain-model";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";
import { readJson, writeJson } from "../../services/jsonStore.js";

const eventsFile = new URL("../../data/business-events.v2.json", import.meta.url);
const relationsFile = new URL("../../data/business-event-relations.v2.json", import.meta.url);
const tasksFile = new URL("../../data/tasks.v2.json", import.meta.url);
const activitiesFile = new URL("../../data/business-event-activities.v2.json", import.meta.url);
const mappingsFile = new URL("../../data/event-mappings.v2.json", import.meta.url);
const documentsFile = new URL("../../data/documents.v2.json", import.meta.url);
const taxItemsFile = new URL("../../data/tax-items.v2.json", import.meta.url);
const vouchersFile = new URL("../../data/vouchers.v2.json", import.meta.url);

const seedEvents: BusinessEvent[] = [
  {
    id: "evt-001",
    companyId: "cmp-tech-001",
    type: "sales",
    title: "SaaS 年度订阅合同签约",
    description: "与华东客户签署年度 SaaS 服务合同，合同金额 48 万。",
    department: "销售部",
    ownerId: "usr-chairman-001",
    occurredOn: "2026-05-10",
    amount: "480000.00",
    currency: "CNY",
    status: "analyzed",
    source: "manual",
    counterpartyId: "cp-001",
    projectId: null,
    createdAt: "2026-05-10T09:00:00.000Z",
    updatedAt: "2026-05-10T09:30:00.000Z"
  }
];

const seedRelations: BusinessEventRelation[] = [];
const seedActivities: BusinessEventActivity[] = [
  {
    id: "act-evt-001-001",
    companyId: "cmp-tech-001",
    businessEventId: "evt-001",
    activityType: "created",
    actorUserId: "usr-chairman-001",
    actorName: "创始人董事长",
    summary: "创建经营事项：SaaS 年度订阅合同签约",
    createdAt: "2026-05-10T09:00:00.000Z"
  },
  {
    id: "act-evt-001-002",
    companyId: "cmp-tech-001",
    businessEventId: "evt-001",
    activityType: "analyzed",
    actorUserId: "usr-chairman-001",
    actorName: "创始人董事长",
    summary: "完成初步分析并生成首批任务。",
    createdAt: "2026-05-10T09:35:00.000Z"
  }
];
const seedTasks: Task[] = [
  {
    id: "task-evt-001-001",
    companyId: "cmp-tech-001",
    businessEventId: "evt-001",
    parentTaskId: null,
    title: "确认开票计划",
    description: "核对合同约定的开票节点、税率和收款条件。",
    status: "not_started",
    priority: "high",
    ownerId: "usr-fin-001",
    dueAt: "2026-05-16T18:00:00.000Z",
    assigneeDepartment: "财务部",
    source: "workflow",
    createdAt: "2026-05-10T09:35:00.000Z",
    updatedAt: "2026-05-10T09:35:00.000Z"
  }
];
const seedMappings: BusinessEventMappingBundle[] = [
  {
    businessEventId: "evt-001",
    generatedAt: "2026-05-10T09:35:00.000Z",
    documentMappings: [
      {
        id: "doc-map-evt-001-001",
        companyId: "cmp-tech-001",
        businessEventId: "evt-001",
        documentType: "contract",
        title: "SaaS 服务合同归档",
        status: "generated",
        ownerDepartment: "销售部",
        notes: "已签署的主合同应作为收入确认与开票依据。"
      },
      {
        id: "doc-map-evt-001-002",
        companyId: "cmp-tech-001",
        businessEventId: "evt-001",
        documentType: "invoice_application",
        title: "开票申请单",
        status: "required",
        ownerDepartment: "财务部",
        notes: "需补齐开票节点、税率、客户抬头和纳税识别号。"
      }
    ],
    taxMappings: [
      {
        id: "tax-map-evt-001-001",
        companyId: "cmp-tech-001",
        businessEventId: "evt-001",
        taxType: "增值税",
        treatment: "按 SaaS 服务适用销项税规则安排开票与申报。",
        status: "pending",
        basis: "需先确认开票时点、税率与收款条件。",
        filingPeriod: "2026-05"
      }
    ],
    voucherDrafts: [
      {
        id: "vou-map-evt-001-001",
        companyId: "cmp-tech-001",
        businessEventId: "evt-001",
        voucherType: "accrual",
        status: "review_required",
        summary: "SaaS 年度订阅合同收入确认草稿",
        lines: [
          {
            id: "vou-line-evt-001-001",
            summary: "确认 SaaS 收入",
            accountCode: "1122",
            accountName: "应收账款",
            debit: "480000.00",
            credit: "0.00"
          },
          {
            id: "vou-line-evt-001-002",
            summary: "确认 SaaS 收入",
            accountCode: "6001",
            accountName: "主营业务收入",
            debit: "0.00",
            credit: "424778.76"
          },
          {
            id: "vou-line-evt-001-003",
            summary: "确认销项税额",
            accountCode: "222101",
            accountName: "应交税费-应交增值税（销项税额）",
            debit: "0.00",
            credit: "55221.24"
          }
        ]
      }
    ]
  }
];
const seedDocuments: GeneratedDocument[] = [];
const seedTaxItems: TaxItem[] = [];
const seedVouchers: Voucher[] = [];

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

function companyScope<T extends { companyId: string }>(rows: T[], companyId: string) {
  return rows.filter((row) => row.companyId === companyId);
}

function hasCompanyWideAccess(roleCodes: string[]) {
  return roleCodes.some((role) => ["role-chairman", "role-finance-director"].includes(role));
}

function scopeEvents(rows: BusinessEvent[], req: ApiRequest) {
  const companyRows = companyScope(rows, req.auth!.companyId);
  if (hasCompanyWideAccess(req.auth!.roleCodes)) {
    return companyRows;
  }
  return companyRows.filter(
    (row) => row.ownerId === req.auth!.userId || row.department === req.auth!.departmentName
  );
}

function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
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

export async function listEvents(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(eventsFile, seedEvents);
  const scoped = scopeEvents(rows, req);
  return json(res, 200, { items: scoped, total: scoped.length });
}

export async function createEvent(req: ApiRequest, res: ServerResponse) {
  const body = req.body as CreateBusinessEventInput;
  const rows = await readJson(eventsFile, seedEvents);
  const activities = await readJson(activitiesFile, seedActivities);
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
  rows.unshift(next);
  await writeJson(eventsFile, rows);
  activities.unshift(
    buildActivity(req, next.id, "created", `创建经营事项：${next.title}`)
  );
  await writeJson(activitiesFile, activities);
  return json(res, 201, next);
}

export async function getEventDetail(req: ApiRequest, res: ServerResponse, eventId: string) {
  const rows = await readJson(eventsFile, seedEvents);
  const relations = await readJson(relationsFile, seedRelations);
  const tasks = await readJson(tasksFile, seedTasks);
  const activities = await readJson(activitiesFile, seedActivities);
  const mappings = await readJson(mappingsFile, seedMappings);
  const documents = await readJson(documentsFile, seedDocuments);
  const taxItems = await readJson(taxItemsFile, seedTaxItems);
  const vouchers = await readJson(vouchersFile, seedVouchers);
  const event = scopeEvents(rows, req).find((row) => row.id === eventId);
  if (!event) {
    return json(res, 404, { error: "Event not found" });
  }
  const mappingBundle = mappings.find((item) => item.businessEventId === event.id) || {
    businessEventId: event.id,
    documentMappings: [],
    taxMappings: [],
    voucherDrafts: [],
    generatedAt: ""
  };
  return json(res, 200, {
    ...event,
    relations: relations.filter(
      (item) => item.businessEventId === event.id && item.companyId === req.auth!.companyId
    ),
    tasks: tasks.filter((item) => item.businessEventId === event.id && item.companyId === req.auth!.companyId),
    taskTree: buildTaskTree(
      tasks.filter((item) => item.businessEventId === event.id && item.companyId === req.auth!.companyId)
    ),
    documentMappings: mappingBundle.documentMappings.filter(
      (item) => item.companyId === req.auth!.companyId
    ),
    taxMappings: mappingBundle.taxMappings.filter((item) => item.companyId === req.auth!.companyId),
    voucherDrafts: mappingBundle.voucherDrafts.filter((item) => item.companyId === req.auth!.companyId),
    generatedDocuments: documents.filter(
      (item) => item.businessEventId === event.id && item.companyId === req.auth!.companyId
    ),
    taxItems: taxItems.filter(
      (item) => item.businessEventId === event.id && item.companyId === req.auth!.companyId
    ),
    vouchers: vouchers.filter(
      (item) => item.businessEventId === event.id && item.companyId === req.auth!.companyId
    ),
    mappingGeneratedAt: mappingBundle.generatedAt,
    activities: activities.filter(
      (item) => item.businessEventId === event.id && item.companyId === req.auth!.companyId
    )
  });
}

export async function updateEvent(req: ApiRequest, res: ServerResponse, eventId: string) {
  const rows = await readJson(eventsFile, seedEvents);
  const activities = await readJson(activitiesFile, seedActivities);
  const body = (req.body || {}) as Partial<BusinessEvent>;
  const existing = rows.find((row) => row.id === eventId && row.companyId === req.auth!.companyId);
  let oldStatus: BusinessEvent["status"] | null = null;
  if (!existing) {
    return json(res, 404, { error: "Event not found" });
  }
  oldStatus = existing.status;
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
  const nextRows = rows.map((row) => {
    if (row.id !== eventId || row.companyId !== req.auth!.companyId) return row;
    return updated;
  });
  await writeJson(eventsFile, nextRows);
  activities.unshift(
    buildActivity(req, updated.id, "updated", `更新经营事项：${updated.title}`)
  );
  if (oldStatus && oldStatus !== updated.status) {
    activities.unshift(
      buildActivity(
        req,
        updated.id,
        "status_changed",
        `状态变更：${oldStatus} -> ${updated.status}`
      )
    );
  }
  await writeJson(activitiesFile, activities);
  return json(res, 200, updated);
}

export async function analyzeEvent(req: ApiRequest, res: ServerResponse, eventId: string) {
  const events = await readJson(eventsFile, seedEvents);
  const tasks = await readJson(tasksFile, seedTasks);
  const activities = await readJson(activitiesFile, seedActivities);
  const mappings = await readJson(mappingsFile, seedMappings);
  const documents = await readJson(documentsFile, seedDocuments);
  const taxItems = await readJson(taxItemsFile, seedTaxItems);
  const vouchers = await readJson(vouchersFile, seedVouchers);
  const target = scopeEvents(events, req).find((row) => row.id === eventId);
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

  const nextEvents = events.map((row) =>
    row.id === eventId ? { ...row, status: "analyzed", updatedAt: now } : row
  );
  const bundle = buildEventMappings({ ...target, status: "analyzed", updatedAt: now });
  const nextMappings = [
    bundle,
    ...mappings.filter((item) => item.businessEventId !== target.id)
  ];
  const nextDocuments = [
    ...toGeneratedDocuments(bundle, now),
    ...documents.filter((item) => item.businessEventId !== target.id)
  ];
  const nextTaxItems = [
    ...toTaxItems(bundle, now),
    ...taxItems.filter((item) => item.businessEventId !== target.id)
  ];
  const nextVouchers = [
    ...toVouchers(bundle, now),
    ...vouchers.filter((item) => item.businessEventId !== target.id)
  ];
  const remainingTasks = tasks.filter(
    (item) => !(item.businessEventId === target.id && item.source === "ai")
  );

  await writeJson(eventsFile, nextEvents);
  await writeJson(tasksFile, [...generatedTasks, ...remainingTasks]);
  await writeJson(mappingsFile, nextMappings);
  await writeJson(documentsFile, nextDocuments);
  await writeJson(taxItemsFile, nextTaxItems);
  await writeJson(vouchersFile, nextVouchers);
  activities.unshift(
    buildActivity(
      req,
      eventId,
      "task_generated",
      `自动生成 ${generatedTasks.length} 个任务，并同步 ${nextDocuments.length} 份单据、${nextTaxItems.length} 条税务事项、${nextVouchers.length} 张凭证草稿。`
    )
  );
  activities.unshift(
    buildActivity(req, eventId, "analyzed", "完成事项分析并输出执行建议。")
  );
  await writeJson(activitiesFile, activities);

  return json(res, 200, {
    eventId,
    generatedTasks: generatedTasks.length,
    status: "analyzed"
  });
}
