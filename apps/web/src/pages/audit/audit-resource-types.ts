/**
 * 审计检索的「操作对象」清单（纯逻辑）。
 *
 * 改造前这个下拉写死在 AuditPage.tsx 里，10 个取值。逐个对照后端 writeAudit()
 * 的实际写入点（apps/api/src 全量扫描，29 个 resourceType）后发现两头都不对：
 *
 * 1. 有三个选项永远查不出东西 —— `document`（单据）、`tax_item`（税务事项）、
 *    `risk_finding`（风险发现）在后端**一条审计日志都不写**。用户选中后看到
 *    「暂无审计记录」，会以为是「这个单据没人动过」，实际是「这类对象根本不留痕」。
 *    这两句话对审计员的意义天差地别，所以下面用 UNAUDITED_RESOURCE_TYPES 把它
 *    显式标出来，由页面给出一句实话，而不是让空列表自己去误导人。
 * 2. 真正有痕迹的对象反而查不到 —— 发票、银行流水、往来单位、任务、申报期间、
 *    结账期间、制度条目等都在写审计日志，却不在下拉里，只能靠手敲编号。
 *
 * 这三类之所以不能直接从下拉里删掉：/risk 的「查看审计」深链带的就是
 * resourceType=risk_finding（见 pages/drilldown.ts 的 buildRiskClosureTargetChain），
 * 单据与税务事项同理。选项删了，从那些页跳过来时 <select> 会落在一个不存在的值上，
 * 显示成空白。正确做法是保留、标注、并说清楚为什么查不到。
 */

/** 后端确实会写审计日志、且审计员真的会去追的业务对象。 */
export const AUDIT_RESOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  business_event: "经营事项",
  voucher: "凭证",
  invoice: "发票",
  bank_statement: "银行流水",
  contract: "合同",
  counterparty: "往来单位",
  task: "任务",
  payroll: "工资",
  payroll_transfer_batch: "工资代发批次",
  employee: "员工",
  filing_period: "申报期间",
  tax_declaration_submission: "税务申报提交",
  close_period: "结账期间",
  export_job: "导出任务",
  knowledge_item: "制度条目"
};

/**
 * 能从别处跳进来、但后端不写审计日志的对象类型。
 * 值是「为什么查不到」的实话，直接说给用户听。
 */
export const UNAUDITED_RESOURCE_TYPES: Readonly<Record<string, string>> = {
  document: "单据本身不写审计日志：单据的改动痕迹要到它关联的经营事项或凭证上查。",
  tax_item: "税务事项不写审计日志：申报动作的痕迹记在「申报期间」和「税务申报提交」上。",
  risk_finding: "风险发现不写审计日志：风险的处理痕迹记在它指向的经营事项上。"
};

export function isUnauditedResourceType(resourceType: string): boolean {
  return Object.prototype.hasOwnProperty.call(UNAUDITED_RESOURCE_TYPES, resourceType);
}

/** 该类型查不出记录的原因；类型本身有审计来源时返回 null。 */
export function describeUnauditedResourceType(resourceType: string): string | null {
  return UNAUDITED_RESOURCE_TYPES[resourceType] ?? null;
}

export interface ResourceTypeOption {
  value: string;
  label: string;
  /** 该类型没有审计来源，选中后必然空列表。 */
  unaudited: boolean;
}

const ALL_TYPES_OPTION: ResourceTypeOption = { value: "", label: "全部类型", unaudited: false };

/**
 * 构造下拉选项。
 *
 * 当前值不在清单里时（从别的页深链跳来，或后端新增了类型）把它补在末尾，
 * 保证 <select> 永远有一个匹配项——否则用户看到的是一个空白下拉，
 * 而列表其实已经按那个类型过滤过了，界面和数据对不上。
 */
export function buildResourceTypeOptions(currentValue: string): ResourceTypeOption[] {
  const options: ResourceTypeOption[] = [
    ALL_TYPES_OPTION,
    ...Object.entries(AUDIT_RESOURCE_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
      unaudited: false
    }))
  ];

  if (!currentValue || options.some((option) => option.value === currentValue)) {
    return options;
  }

  const unaudited = isUnauditedResourceType(currentValue);
  return [
    ...options,
    {
      value: currentValue,
      label: unaudited ? `${resourceTypeFallbackLabel(currentValue)}（无审计来源）` : resourceTypeFallbackLabel(currentValue),
      unaudited
    }
  ];
}

const FALLBACK_LABELS: Readonly<Record<string, string>> = {
  document: "单据",
  tax_item: "税务事项",
  risk_finding: "风险发现"
};

function resourceTypeFallbackLabel(resourceType: string): string {
  return FALLBACK_LABELS[resourceType] ?? resourceType;
}

/** 表格「对象类型」列的显示名，未知类型回落到原始取值而不是留空。 */
export function describeResourceType(resourceType: string): string {
  return AUDIT_RESOURCE_TYPE_LABELS[resourceType] ?? resourceTypeFallbackLabel(resourceType);
}
