import type { ProcessFlowBranch, ProcessFlowNode } from "./types";

export interface ProcessFlowBranchDefinition {
  branch: ProcessFlowBranch;
  label: string;
  badgeClassName: string;
  showInOverview: boolean;
  overviewTitle?: string;
  overviewBorderColor?: string;
  overviewBackground?: string;
}

export const COMMON_PROCESS_FLOW_NODES: ProcessFlowNode[] = [
  {
    id: "business_happens",
    title: "业务发生",
    branch: "common",
    description: "董事长在公司外部完成购买或招待行为，并取得发票、付款记录及事项说明。",
    departments: ["董事长", "经办人"],
    documents: ["发票", "付款记录", "商品或招待说明", "对方信息"],
    taxes: [],
    vouchers: [],
    routes: ["/assistant"]
  },
  {
    id: "submit_ai_secretary",
    title: "提交 AI 财税秘书",
    branch: "common",
    description: "在 AI 财税秘书中提交文字描述和附件，形成 business_event、分析快照与附件记录。",
    departments: ["董事长", "AI 财税秘书"],
    documents: ["事项描述", "发票", "付款凭证", "照片或聊天说明"],
    taxes: [],
    vouchers: [],
    routes: ["/assistant", "/events"]
  },
  {
    id: "ai_precheck",
    title: "AI 初判与资料校验",
    branch: "common",
    description: "识别业务类型、金额、部门、缺失资料与税务关注点，产出风险提示和任务拆解建议。",
    departments: ["AI 财税秘书", "财务"],
    documents: ["业务类型建议", "风险提示", "资料缺失清单", "任务拆解建议"],
    taxes: ["税务关注点"],
    vouchers: [],
    routes: ["/events", "/assistant", "/risk"]
  },
  {
    id: "approval_dispatch",
    title: "审批与任务分发",
    branch: "common",
    description: "下发审批、补料与执行任务，推动事项进入可执行处理阶段。",
    departments: ["业务部门", "财务部", "管理层"],
    documents: ["审批单", "补料任务"],
    taxes: [],
    vouchers: [],
    routes: ["/tasks", "/events"]
  },
  {
    id: "document_generation",
    title: "生成业务单据与凭证草稿",
    branch: "common",
    description: "沉淀采购/报销单、附件清单等过程资料，并生成会计凭证草稿。",
    departments: ["业务部门", "财务部"],
    documents: ["业务单据", "附件清单", "影像资料"],
    taxes: [],
    vouchers: ["会计凭证草稿"],
    routes: ["/documents", "/vouchers", "/events"]
  },
  {
    id: "voucher_tax_processing",
    title: "凭证与税务处理中",
    branch: "common",
    description: "生成或复核凭证，并推进税务事项归集与处理。",
    departments: ["财务部", "税务岗位"],
    documents: ["记账凭证", "处理记录"],
    taxes: ["税务事项归集"],
    vouchers: ["记账凭证", "凭证草稿"],
    routes: ["/vouchers", "/tax"]
  },
  {
    id: "tax_filing_archive",
    title: "税务复核与申报留档",
    branch: "common",
    description: "根据业务类型形成税务事项，归入申报批次，执行复核、提交与留档。",
    departments: ["税务岗位", "财务部"],
    documents: ["申报资料", "留档记录"],
    taxes: ["增值税", "企业所得税", "个税", "印花税/附加税"],
    vouchers: [],
    routes: ["/tax"]
  },
  {
    id: "archive_trace_query",
    title: "归档与可追溯查询",
    branch: "common",
    description: "事项、任务、单据、凭证、税务与资料包进入可追溯状态，可按对象维度回查。",
    departments: ["财务部", "税务岗位"],
    documents: ["资料包", "归档记录", "查询结果"],
    taxes: ["税务留档"],
    vouchers: ["凭证留档"],
    routes: ["/documents", "/tax", "/vouchers"]
  }
];

export const PURCHASE_PROCESS_FLOW_NODES: ProcessFlowNode[] = [
  {
    id: "purchase_classification",
    title: "外购物品分支判断",
    branch: "purchase",
    description: "判断办公用品、低值易耗、固定资产或福利性支出。",
    departments: ["行政/采购", "财务"],
    documents: ["采购发票", "用途说明"],
    taxes: ["增值税", "企业所得税"],
    vouchers: ["费用类凭证", "资产类凭证"],
    routes: ["/events", "/documents", "/vouchers", "/contracts"]
  },
  {
    id: "purchase_approval_dispatch",
    title: "外购物品审批与任务分发",
    branch: "purchase",
    description: "行政/采购确认用途和归属，财务确认入账口径，税务确认发票与抵扣口径。",
    departments: ["行政/采购", "财务", "税务"],
    documents: ["审批单", "补料任务", "用途确认单"],
    taxes: ["增值税抵扣口径", "企业所得税扣除口径"],
    vouchers: [],
    routes: ["/tasks", "/events", "/documents"]
  },
  {
    id: "purchase_document_generation",
    title: "外购物品生成单据与凭证草稿",
    branch: "purchase",
    description: "生成采购/报销单、附件索引、会计凭证草稿，并在触发时形成存货或固定资产记录。",
    departments: ["行政/采购", "财务"],
    documents: ["采购单", "报销单", "附件索引", "验收或领用说明"],
    taxes: ["进项税判断", "资本化判断"],
    vouchers: ["费用类凭证", "资产类凭证"],
    routes: ["/documents", "/vouchers", "/ledger"]
  }
];

export const ENTERTAINMENT_PROCESS_FLOW_NODES: ProcessFlowNode[] = [
  {
    id: "entertainment_classification",
    title: "业务招待分支判断",
    branch: "entertainment",
    description: "判断业务招待费、会议费、差旅餐饮或福利性消费。",
    departments: ["业务部门", "财务", "税务"],
    documents: ["餐饮发票", "招待对象说明"],
    taxes: ["企业所得税", "增值税"],
    vouchers: ["业务招待费凭证"],
    routes: ["/events", "/tax", "/vouchers", "/documents"]
  },
  {
    id: "entertainment_approval_dispatch",
    title: "业务招待审批与任务分发",
    branch: "entertainment",
    description: "申请人、业务负责人、财务和税务确认招待对象、事由、票据和税务口径。",
    departments: ["申请人", "业务负责人", "财务", "税务"],
    documents: ["审批单", "补料任务", "招待对象与事由说明"],
    taxes: ["业务招待费扣除限制", "发票合规性"],
    vouchers: [],
    routes: ["/tasks", "/events", "/risk"]
  },
  {
    id: "entertainment_document_generation",
    title: "业务招待生成单据与凭证草稿",
    branch: "entertainment",
    description: "生成招待/报销单、招待登记、附件索引和会计凭证草稿，沉淀税务复核材料。",
    departments: ["业务部门", "财务", "税务"],
    documents: ["招待登记", "报销单", "附件索引", "招待对象与时间地点说明"],
    taxes: ["企业所得税业务招待费关注", "增值税处理"],
    vouchers: ["业务招待费凭证"],
    routes: ["/documents", "/vouchers", "/tax"]
  }
];

export const PROCESS_FLOW_NODES: ProcessFlowNode[] = [
  ...COMMON_PROCESS_FLOW_NODES,
  ...PURCHASE_PROCESS_FLOW_NODES,
  ...ENTERTAINMENT_PROCESS_FLOW_NODES
];

export const COMMON_PROCESS_FLOW_INTRO_NODE_IDS = [
  "business_happens",
  "submit_ai_secretary",
  "ai_precheck"
] as const;

export const COMMON_PROCESS_FLOW_OUTRO_NODE_IDS = [
  "voucher_tax_processing",
  "tax_filing_archive",
  "archive_trace_query"
] as const;

export const PROCESS_FLOW_BRANCHES: ProcessFlowBranchDefinition[] = [
  {
    branch: "common",
    label: "通用主线",
    badgeClassName: "badge-gray",
    showInOverview: false
  },
  {
    branch: "purchase",
    label: "外购物品",
    badgeClassName: "badge-blue",
    showInOverview: true,
    overviewTitle: "外购物品分支",
    overviewBorderColor: "rgba(37,99,235,0.28)",
    overviewBackground: "rgba(239,246,255,0.44)"
  },
  {
    branch: "entertainment",
    label: "业务招待",
    badgeClassName: "badge-purple",
    showInOverview: true,
    overviewTitle: "业务招待分支",
    overviewBorderColor: "rgba(126,34,206,0.24)",
    overviewBackground: "rgba(245,243,255,0.42)"
  }
];

export interface ProcessFlowOverviewSection {
  id: string;
  branch: ProcessFlowBranch;
  title?: string;
  badgeClassName?: string;
  kind: "linear" | "branch";
  borderColor?: string;
  background?: string;
  nodes: ProcessFlowNode[];
}

export function getProcessFlowBranchDefinition(branch: ProcessFlowBranch) {
  return PROCESS_FLOW_BRANCHES.find((item) => item.branch === branch);
}

function getNodesByIds(nodeIds: readonly string[]) {
  return nodeIds.flatMap((nodeId) => {
    const node = COMMON_PROCESS_FLOW_NODES.find((item) => item.id === nodeId);
    return node ? [node] : [];
  });
}

export function getProcessFlowNodesForBranch(branch: ProcessFlowBranch) {
  if (branch === "purchase") {
    return [
      ...getNodesByIds(COMMON_PROCESS_FLOW_INTRO_NODE_IDS),
      ...PURCHASE_PROCESS_FLOW_NODES,
      ...getNodesByIds(COMMON_PROCESS_FLOW_OUTRO_NODE_IDS)
    ];
  }

  if (branch === "entertainment") {
    return [
      ...getNodesByIds(COMMON_PROCESS_FLOW_INTRO_NODE_IDS),
      ...ENTERTAINMENT_PROCESS_FLOW_NODES,
      ...getNodesByIds(COMMON_PROCESS_FLOW_OUTRO_NODE_IDS)
    ];
  }

  return [...COMMON_PROCESS_FLOW_NODES];
}

export function getDefaultProcessFlowNodeId(branch: ProcessFlowBranch = "common") {
  return getProcessFlowNodesForBranch(branch)[0]?.id ?? "business_happens";
}

export function getProcessFlowOverviewSections(): ProcessFlowOverviewSection[] {
  const introNodes = getNodesByIds(COMMON_PROCESS_FLOW_INTRO_NODE_IDS);
  const outroNodes = getNodesByIds(COMMON_PROCESS_FLOW_OUTRO_NODE_IDS);
  const branchSections = PROCESS_FLOW_BRANCHES.filter((branch) => branch.showInOverview).map((branch) => ({
    id: `${branch.branch}-branch`,
    branch: branch.branch,
    title: branch.overviewTitle ?? branch.label,
    badgeClassName: branch.badgeClassName,
    kind: "branch" as const,
    borderColor: branch.overviewBorderColor,
    background: branch.overviewBackground,
    nodes: getProcessFlowNodesForBranch(branch.branch).filter((node) => node.branch === branch.branch)
  }));

  const sections: ProcessFlowOverviewSection[] = [
    {
      id: "common-intro",
      branch: "common",
      kind: "linear",
      nodes: introNodes
    },
    ...branchSections,
    {
      id: "common-outro",
      branch: "common",
      kind: "linear",
      nodes: outroNodes
    }
  ];

  return sections.filter((section) => section.nodes.length > 0);
}
