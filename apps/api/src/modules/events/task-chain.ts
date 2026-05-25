import type { BusinessEvent, Task } from "@finance-taxation/domain-model";

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
  const templates = contractWorkflowTemplates(event) ?? standardTemplates();

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
