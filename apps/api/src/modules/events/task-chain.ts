import type { BusinessEvent, Task } from "@finance-taxation/domain-model";
import { resolveContractRevenueScenario } from "./contract-revenue-rules.js";
import { resolvePurchaseExpenseScenario } from "./purchase-expense-rules.js";
import { resolveTravelExpenseScenario } from "./travel-expense-rules.js";

interface BuildGeneratedTasksForEventOptions {
  event: BusinessEvent;
  now: string;
  actorUserId: string | null;
}

interface TaskTemplate {
  title: string;
  description: string;
  priority: Task["priority"];
  assigneeDepartment: string;
}

function makeRootTask(event: BusinessEvent, now: string, actorUserId: string | null): Task {
  return {
    id: `task-${event.id}-root`,
    companyId: event.companyId,
    businessEventId: event.id,
    parentTaskId: null,
    title: "经营事项执行主任务",
    description: "统筹当前经营事项的资料、税务、记账和归档动作。",
    status: "not_started",
    priority: "high",
    ownerId: actorUserId,
    dueAt: null,
    assigneeDepartment: "财务部",
    source: "ai",
    createdAt: now,
    updatedAt: now
  };
}

function contractWorkflowTemplates(event: BusinessEvent): TaskTemplate[] | null {
  if (!event.contractId) return null;

  if (event.title.includes("开票申请事项")) {
    return [
      {
        title: "核对开票条件与合同条款",
        description: "确认合同约定的开票节点、税率、付款条件和客户要求。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "确认客户开票信息",
        description: "复核客户抬头、税号、地址电话、开户行及账号等开票资料。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "提交开票申请并跟踪流转",
        description: "准备开票申请单并跟踪审批、开票和回传进度。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (event.title.includes("回款跟踪事项") || event.title.includes("付款安排事项")) {
    return [
      {
        title: "登记合同收付款节点",
        description: "根据合同条款整理应收应付、付款条件和关键节点。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "跟踪对账与资金计划",
        description: "落实对账安排、催收或付款计划，并确认资金影响。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "补齐收付款依据",
        description: "补齐回单、付款审批、往来确认和异常说明资料。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (event.title.includes("收入确认事项")) {
    return [
      {
        title: "确认交付或验收依据",
        description: "核对合同交付、验收、服务完成或里程碑证明。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "复核收入确认时点",
        description: "结合合同条款和履约情况判断本期是否满足收入确认条件。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "同步税务和记账准备",
        description: "同步销项税、开票计划和凭证草稿，准备后续过账。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (event.title.includes("采购执行事项")) {
    return [
      {
        title: "核对采购合同与下单范围",
        description: "确认采购品类、数量、交期和供应商履约要求。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "跟踪到货与验收资料",
        description: "落实到货、验收、签收和异常处理资料。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "同步发票和入账准备",
        description: "跟踪供应商发票并准备采购入账和税务复核资料。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (event.title.includes("验收归档事项")) {
    return [
      {
        title: "核对验收与到货资料",
        description: "确认验收单、到货单、签收单和异常记录完整。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "整理归档清单",
        description: "按合同、发票、回单、验收资料建立归档索引。",
        priority: "medium",
        assigneeDepartment: event.department
      },
      {
        title: "同步税务和凭证依据",
        description: "将验收资料同步给财务，用于进项税和凭证复核。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (event.title.includes("租赁付款事项") || event.title.includes("租赁费用确认事项")) {
    return [
      {
        title: "核对租赁条款与期间",
        description: "确认租金、押金、起租日和费用分摊期间。",
        priority: "high",
        assigneeDepartment: "行政部"
      },
      {
        title: "补齐租赁付款与发票资料",
        description: "准备付款依据、租赁发票和合同附件。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "同步费用与税前扣除准备",
        description: "确认费用分摊口径并准备税前扣除和记账资料。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  return [
    {
      title: "核对合同关键条款",
      description: "确认合同金额、节点、履约责任和关键税务约定。",
      priority: "high",
      assigneeDepartment: event.department
    },
    {
      title: "建立履约与资料计划",
      description: "整理后续开票、回款、验收和归档所需资料清单。",
      priority: "high",
      assigneeDepartment: event.department
    },
    {
      title: "同步税务和记账准备",
      description: "根据合同类型整理税务影响和凭证准备事项。",
      priority: "medium",
      assigneeDepartment: "财务部"
    }
  ];
}

function purchaseExpenseTemplates(event: BusinessEvent): TaskTemplate[] | null {
  if (String(event.type) !== "purchase_expense") {
    return null;
  }

  const scenario = resolvePurchaseExpenseScenario(event);
  if (scenario.missingInvoiceBundle) {
    return [
      {
        title: "补齐发票与票据依据",
        description: "补充发票、付款回单、报销说明和业务背景，先把票据包补齐。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "复核税前扣除与进项限制",
        description: "明确缺票阶段的税前扣除与进项税限制，避免形成错误税务结论。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "补票前冻结正式过账",
        description: "在票据补齐前仅保留待补票草稿，不进入正式过账和申报。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (scenario.duplicateInvoice) {
    return [
      {
        title: "核对重复票据与历史报销",
        description: "排查同票号、同金额、同业务背景的既有报销与入账记录。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "关闭重复事项或并单处理",
        description: "确认保留哪条事项，关闭重复流转或合并为同一报销处理。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "复核税务抵扣留痕",
        description: "检查是否已形成重复抵扣、重复申报或重复归档痕迹。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (scenario.classificationConflict) {
    return [
      {
        title: "改走固定资产审批链",
        description: "按固定资产或采购申请重新确认审批口径，不再按普通费用处理。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "补齐资产验收与台账资料",
        description: "补齐采购申请、验收单、资产台账和后续折旧所需资料。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "按固定资产口径调整凭证",
        description: "将凭证、税务和归档链切到固定资产处理口径。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  return [
    {
      title: "核对报销事由与票据包",
      description: "确认报销事由、金额、票据和审批流保持一致。",
      priority: "high",
      assigneeDepartment: event.department
    },
    {
      title: "复核税务与凭证草稿",
      description: "核对进项税、税前扣除和费用入账口径。",
      priority: "medium",
      assigneeDepartment: "财务部"
    }
  ];
}

function travelExpenseTemplates(event: BusinessEvent): TaskTemplate[] | null {
  if (String(event.type) !== "travel_expense") {
    return null;
  }

  const scenario = resolveTravelExpenseScenario(event);
  if (scenario.missingHotelInvoice) {
    return [
      {
        title: "补齐住宿发票与行程依据",
        description: "补充住宿发票、入住凭证和差旅行程，明确缺失住宿部分的业务背景。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "确认暂估入账与税前扣除限制",
        description: "在补票前，仅对已取得合规票据部分暂估处理，并复核税前扣除限制。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "补票前冻结住宿部分过账",
        description: "补齐住宿发票前，不进入完整差旅过账和正式抵扣。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (scenario.duplicateClaim) {
    return [
      {
        title: "核对重复差旅报销记录",
        description: "排查同一行程、同一交通住宿票据和同金额差旅报销是否已提交或入账。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "保留有效报销主链",
        description: "确认保留哪条差旅报销主链，其余重复流转关闭或并单处理。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "复核交通住宿进项留痕",
        description: "检查交通住宿票据是否已被重复抵扣、归档或纳入申报。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (scenario.accountingPeriodConflict) {
    return [
      {
        title: "拆分跨期差旅归属月份",
        description: "按出差起止日期拆分各月份应确认的差旅费用，不按报销提交月份整体入账。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "复核认证抵扣与所得税期间",
        description: "分别复核增值税认证月份和企业所得税费用归属期，避免跨期错配。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "提交跨期差旅最终授权",
        description: "由负责人确认跨期处理口径后，再进入正式过账或申报环节。",
        priority: "medium",
        assigneeDepartment: event.department
      }
    ];
  }

  return [
    {
      title: "核对差旅申请与行程",
      description: "确认出差申请、行程时间和客户拜访背景与报销一致。",
      priority: "high",
      assigneeDepartment: event.department
    },
    {
      title: "复核交通住宿票据",
      description: "复核交通、住宿和餐饮相关票据的真实性、完整性和制度边界。",
      priority: "high",
      assigneeDepartment: "财务部"
    },
    {
      title: "生成差旅税务与凭证建议",
      description: "同步准备差旅进项税、税前扣除和报销凭证草稿。",
      priority: "medium",
      assigneeDepartment: "财务部"
    }
  ];
}

function contractRevenueTemplates(event: BusinessEvent): TaskTemplate[] | null {
  if (String(event.type) !== "contract_revenue") {
    return null;
  }

  const scenario = resolveContractRevenueScenario(event);
  if (scenario.missingAcceptanceRecord) {
    return [
      {
        title: "补齐验收单与履约证据",
        description: "补充服务验收单、交付证明和客户确认资料，先锁定履约完成证据。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "冻结正式收入确认",
        description: "在验收单补齐前，暂不正式确认主营业务收入，只保留待复核草稿。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "复核开票与所得税时点",
        description: "分别复核已开票销项税义务和所得税收入确认时点，避免税会错配。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (scenario.duplicateContract) {
    return [
      {
        title: "核对重复合同与收入主链",
        description: "排查同合同号、同金额、同客户的既有合同收入与应收确认记录。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "关闭重复确认流转",
        description: "确认保留哪条合同收入主链，其余重复导入或重复确认流转关闭处理。",
        priority: "high",
        assigneeDepartment: event.department
      },
      {
        title: "复核销项税与应收留痕",
        description: "检查是否已形成重复销项税、重复应收或重复归档痕迹。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  if (scenario.revenueTimingConflict) {
    return [
      {
        title: "拆分服务期间收入归属",
        description: "按合同履约期间拆分各月应确认收入，不按一次性开票或导入整体确认。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "改按合同负债分期结转",
        description: "先确认合同负债或预收，再按后续履约进度分期结转主营业务收入。",
        priority: "high",
        assigneeDepartment: "财务部"
      },
      {
        title: "复核税会时点差异",
        description: "分别复核销项税义务与所得税收入归属差异，并保留审计复核说明。",
        priority: "medium",
        assigneeDepartment: "财务部"
      }
    ];
  }

  return [
    {
      title: "核对合同与验收依据",
      description: "确认合同条款、服务验收和客户确认资料与收入事项一致。",
      priority: "high",
      assigneeDepartment: event.department
    },
    {
      title: "复核开票与销项税时点",
      description: "复核开票节点、销项税义务和应收确认口径。",
      priority: "high",
      assigneeDepartment: "财务部"
    },
    {
      title: "生成收入确认与应收凭证",
      description: "同步准备收入确认、应收账款和税务处理草稿。",
      priority: "medium",
      assigneeDepartment: "财务部"
    }
  ];
}

function standardTemplates(): TaskTemplate[] {
  return [
    {
      title: "核对资料完整性",
      description: "检查合同、发票、回单、验收资料是否齐备。",
      priority: "high",
      assigneeDepartment: "财务部"
    },
    {
      title: "生成税务处理建议",
      description: "输出税种影响、申报批次和风险提示。",
      priority: "medium",
      assigneeDepartment: "财务部"
    }
  ];
}

export function buildGeneratedTasksForEvent({
  event,
  now,
  actorUserId
}: BuildGeneratedTasksForEventOptions): Task[] {
  const rootTask = makeRootTask(event, now, actorUserId);
  const templates =
    purchaseExpenseTemplates(event) ??
    travelExpenseTemplates(event) ??
    contractRevenueTemplates(event) ??
    contractWorkflowTemplates(event) ??
    standardTemplates();

  const childTasks = templates.map((template, index) => ({
    id: `task-${event.id}-${index + 1}`,
    companyId: event.companyId,
    businessEventId: event.id,
    parentTaskId: rootTask.id,
    title: template.title,
    description: template.description,
    status: "not_started" as const,
    priority: template.priority,
    ownerId: actorUserId,
    dueAt: null,
    assigneeDepartment: template.assigneeDepartment,
    source: "ai" as const,
    createdAt: now,
    updatedAt: now
  }));

  return [rootTask, ...childTasks];
}
