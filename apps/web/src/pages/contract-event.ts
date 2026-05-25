import type { Contract, CreateBusinessEventInput } from "@finance-taxation/domain-model";

export type ContractFollowupAction =
  | "invoice"
  | "collection"
  | "revenue"
  | "procurement_execution"
  | "payment_arrangement"
  | "acceptance"
  | "lease_payment"
  | "lease_accrual";

export type ContractTerminalStatus = "fulfilled" | "terminated";

function resolveEventType(contract: Contract): CreateBusinessEventInput["type"] {
  switch (contract.contractType) {
    case "sales":
      return "sales";
    case "procurement":
      return "procurement";
    case "lease":
      return "expense";
    default:
      return "general";
  }
}

function resolveDepartment(contract: Contract) {
  switch (contract.contractType) {
    case "sales":
      return "销售部";
    case "procurement":
      return "采购部";
    case "lease":
      return "行政部";
    default:
      return "业务部";
  }
}

export function buildContractEventInput(contract: Contract): CreateBusinessEventInput {
  const basisDate = contract.signedDate || contract.startDate || new Date().toISOString().slice(0, 10);
  const amount = Number.isFinite(contract.amount) && contract.amount > 0
    ? contract.amount.toFixed(2)
    : null;
  const eventType = resolveEventType(contract);

  return {
    type: eventType,
    title: `${contract.title} 合同执行事项`,
    description: [
      `合同编号：${contract.contractNo}`,
      `交易方：${contract.counterpartyName}`,
      contract.notes ? `合同备注：${contract.notes}` : null,
      "该事项由合同管理页发起，后续请在事项页继续分析、拆任务并进入单据/凭证/税务流程。"
    ].filter(Boolean).join("\n"),
    department: resolveDepartment(contract),
    occurredOn: basisDate,
    amount,
    currency: contract.currency || "CNY",
    source: "manual",
    contractId: contract.id
  };
}

export function getContractFollowupActions(contract: Contract): ContractFollowupAction[] {
  switch (contract.contractType) {
    case "sales":
    case "service":
      return ["invoice", "collection", "revenue"];
    case "procurement":
      return ["procurement_execution", "payment_arrangement", "acceptance"];
    case "lease":
      return ["lease_payment", "lease_accrual"];
    default:
      return ["collection"];
  }
}

export function buildContractFollowupEventInput(
  contract: Contract,
  action: ContractFollowupAction
): CreateBusinessEventInput {
  const occurredOn = contract.startDate || contract.signedDate || new Date().toISOString().slice(0, 10);
  const amount = Number.isFinite(contract.amount) && contract.amount > 0
    ? contract.amount.toFixed(2)
    : null;

  const baseDescription = [
    `合同编号：${contract.contractNo}`,
    `交易方：${contract.counterpartyName}`,
    contract.notes ? `合同备注：${contract.notes}` : null
  ].filter(Boolean).join("\n");

  const mapping: Record<ContractFollowupAction, CreateBusinessEventInput> = {
    invoice: {
      type: "sales",
      title: `${contract.title} 开票申请事项`,
      description: `${baseDescription}\n动作：根据合同条款准备开票申请、税率和抬头信息。`,
      department: "财务部",
      occurredOn,
      amount,
      currency: contract.currency || "CNY",
      source: "manual",
      contractId: contract.id
    },
    collection: {
      type: contract.contractType === "procurement" ? "procurement" : "sales",
      title: `${contract.title} ${contract.contractType === "procurement" ? "付款安排" : "回款跟踪"}事项`,
      description: `${baseDescription}\n动作：根据合同约定跟踪${contract.contractType === "procurement" ? "付款节点和资金安排" : "回款节点和对账计划"}。`,
      department: contract.contractType === "procurement" ? "财务部" : "销售部",
      occurredOn,
      amount,
      currency: contract.currency || "CNY",
      source: "manual",
      contractId: contract.id
    },
    revenue: {
      type: "sales",
      title: `${contract.title} 收入确认事项`,
      description: `${baseDescription}\n动作：根据合同交付、验收或服务履约情况确认收入口径。`,
      department: "财务部",
      occurredOn,
      amount,
      currency: contract.currency || "CNY",
      source: "manual",
      contractId: contract.id
    },
    procurement_execution: {
      type: "procurement",
      title: `${contract.title} 采购执行事项`,
      description: `${baseDescription}\n动作：根据采购合同推进下单、交付、收货和履约跟踪。`,
      department: "采购部",
      occurredOn,
      amount,
      currency: contract.currency || "CNY",
      source: "manual",
      contractId: contract.id
    },
    payment_arrangement: {
      type: "procurement",
      title: `${contract.title} 付款安排事项`,
      description: `${baseDescription}\n动作：根据采购合同节点安排付款、发票和资金计划。`,
      department: "财务部",
      occurredOn,
      amount,
      currency: contract.currency || "CNY",
      source: "manual",
      contractId: contract.id
    },
    acceptance: {
      type: "procurement",
      title: `${contract.title} 验收归档事项`,
      description: `${baseDescription}\n动作：根据采购合同补齐验收、到货、发票和归档资料。`,
      department: "采购部",
      occurredOn,
      amount,
      currency: contract.currency || "CNY",
      source: "manual",
      contractId: contract.id
    },
    lease_payment: {
      type: "expense",
      title: `${contract.title} 租赁付款事项`,
      description: `${baseDescription}\n动作：根据租赁合同安排租金、押金和付款资料。`,
      department: "行政部",
      occurredOn,
      amount,
      currency: contract.currency || "CNY",
      source: "manual",
      contractId: contract.id
    },
    lease_accrual: {
      type: "expense",
      title: `${contract.title} 租赁费用确认事项`,
      description: `${baseDescription}\n动作：根据租赁期间确认费用分摊和税前扣除资料。`,
      department: "财务部",
      occurredOn,
      amount,
      currency: contract.currency || "CNY",
      source: "manual",
      contractId: contract.id
    }
  };

  return mapping[action];
}

export function buildContractTerminalEventInput(
  contract: Contract,
  status: ContractTerminalStatus,
  occurredOn: string
): CreateBusinessEventInput {
  return {
    type: resolveEventType(contract),
    title: `${contract.title} 合同${status === "fulfilled" ? "已履行" : "已终止"}事项`,
    description: [
      `合同编号：${contract.contractNo}`,
      `交易方：${contract.counterpartyName}`,
      `合同已标记为${status === "fulfilled" ? "已履行" : "已终止"}，请补齐终态说明、结算资料和归档结果。`
    ].join("\n"),
    department: resolveDepartment(contract),
    occurredOn,
    amount: Number.isFinite(contract.amount) && contract.amount > 0 ? contract.amount.toFixed(2) : null,
    currency: contract.currency || "CNY",
    source: "manual",
    contractId: contract.id
  };
}
