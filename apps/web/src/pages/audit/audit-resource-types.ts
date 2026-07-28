/**
 * 审计检索的「操作对象」清单（纯逻辑）。
 *
 * 改造前这个下拉写死在 AuditPage.tsx 里，10 个取值，逐个对照后端 writeAudit()
 * 的实际写入点后发现两头都不对：
 *
 * 1. 有三个选项永远查不出东西 —— `document`（单据）、`tax_item`（税务事项）、
 *    `risk_finding`（风险发现）在后端一条审计日志都不写。用户选中后看到
 *    「暂无审计记录」，会以为是「这个单据没人动过」，实际是「这类对象根本不留痕」。
 * 2. 真正有痕迹的对象反而查不到 —— 发票、银行流水、往来单位、任务、申报期间、
 *    结账期间、制度条目等都在写审计日志，却不在下拉里，只能靠手敲编号。
 *
 * 第 2 条当时就补齐了；第 1 条是后端的洞，已在 apps/api 补上写入点，这三类现在
 * 都是正常的可查对象（写入点见下方清单的注释）。留痕补齐后，「无审计来源」这套
 * 机制本身保留、清单清空：它是防止下一个「选了就永远空」的死选项悄悄混进来的
 * 闸门 —— 真出现这种类型时，把它登记进 UNAUDITED_RESOURCE_TYPES 并写一句实话，
 * 页面就会替代空列表把原因说出来，而不是让用户自己去误会。
 */

/**
 * 后端确实会写审计日志、且审计员真的会去追的业务对象。
 *
 * 每一项都对得上 apps/api 里以它为 resourceType 的 writeAudit 调用；新增项前
 * 请先去后端确认写入点存在，否则就是又造一个「选了就永远空」的假选项。
 */
export const AUDIT_RESOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  business_event: "经营事项",
  voucher: "凭证",
  // modules/events/routes.ts 的 analyzeEvent 生成时留痕，
  // modules/documents/routes.ts 覆盖之后的修改、状态变更、挂附件与归档。
  document: "单据",
  // modules/events/routes.ts 的 analyzeEvent 生成时留痕，
  // modules/tax/routes.ts 覆盖修改、状态变更与并入申报批次。
  tax_item: "税务事项",
  // modules/risk/routes.ts：扫描开启/重新打开/消解，以及关闭复核。
  risk_finding: "风险发现",
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
 *
 * 目前为空：三类历史欠账（document / tax_item / risk_finding）的写入点已补齐。
 * 再出现这种类型时登记在这里，页面会自动把原因摆到明处。
 */
export const UNAUDITED_RESOURCE_TYPES: Readonly<Record<string, string>> = {};

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
      label: unaudited ? `${currentValue}（无审计来源）` : currentValue,
      unaudited
    }
  ];
}

/** 表格「对象类型」列的显示名，未知类型回落到原始取值而不是留空。 */
export function describeResourceType(resourceType: string): string {
  return AUDIT_RESOURCE_TYPE_LABELS[resourceType] ?? resourceType;
}
