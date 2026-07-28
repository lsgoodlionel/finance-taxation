import {
  AUDIT_RESOURCE_TYPE_LABELS,
  UNAUDITED_RESOURCE_TYPES,
  buildResourceTypeOptions,
  describeResourceType,
  describeUnauditedResourceType,
  isUnauditedResourceType
} from "./audit-resource-types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 三个查不出东西的选项必须被标出来，而不是留给空列表去误导人 ────────────────
//
// 依据：apps/api/src 全量扫描 writeAudit() 的 resourceType（29 个取值），
// document / tax_item / risk_finding 一个都不在其中。

for (const resourceType of ["document", "tax_item", "risk_finding"]) {
  assert(isUnauditedResourceType(resourceType), `${resourceType} 后端不写审计日志，必须标为无审计来源`);
  assert(
    (describeUnauditedResourceType(resourceType) ?? "").length > 10,
    `${resourceType} 要给出一句「为什么查不到、该去哪儿查」的实话`
  );
  assert(
    !(resourceType in AUDIT_RESOURCE_TYPE_LABELS),
    `${resourceType} 不得混进「有审计来源」的正常清单里`
  );
}

assert(describeUnauditedResourceType("voucher") === null, "凭证有审计来源，不该给出「查不到」的说明");

// ── 下拉里的每一项都必须是后端真的会写的类型 ────────────────────────────────
//
// 这份名单逐条对照过 apps/api/src 的 writeAudit 写入点。新增项时请一并核对，
// 加一个后端不写的类型 = 又造一个「选了就永远空」的假选项。

const VERIFIED_AUDIT_WRITERS = [
  "bank_statement", "business_event", "close_period", "contract", "counterparty",
  "employee", "export_job", "filing_period", "invoice", "knowledge_item",
  "payroll", "payroll_transfer_batch", "task", "tax_declaration_submission", "voucher"
];

for (const resourceType of Object.keys(AUDIT_RESOURCE_TYPE_LABELS)) {
  assert(
    VERIFIED_AUDIT_WRITERS.includes(resourceType),
    `${resourceType} 未经核对：请先确认 apps/api 里确实有以它为 resourceType 的 writeAudit`
  );
}

// 改造前的下拉只有 9 个业务类型，其中 3 个是死选项；真正有痕迹的发票、银行流水、
// 往来单位、任务、申报期间等一个都没有，只能手敲编号。
for (const resourceType of ["invoice", "bank_statement", "counterparty", "task", "filing_period"]) {
  assert(resourceType in AUDIT_RESOURCE_TYPE_LABELS, `${resourceType} 有审计痕迹，应当可以直接筛`);
}

// ── 深链带来的类型必须在下拉里有落点 ────────────────────────────────────────
//
// /risk 的「查看审计」深链带的就是 resourceType=risk_finding（见 drilldown.ts 的
// buildRiskClosureTargetChain）。选项里没有它，<select> 会落在空白上，
// 而列表其实已经按它过滤过了——界面和数据对不上。

{
  const options = buildResourceTypeOptions("risk_finding");
  const matched = options.find((option) => option.value === "risk_finding");
  assert(matched, "从 /risk 跳进来时下拉必须有匹配项");
  assert(matched.unaudited, "该项要标记为无审计来源");
  assert(matched.label.includes("无审计来源"), "标签要把「查不到是因为没有来源」说在明处");
}

{
  const options = buildResourceTypeOptions("");
  assert(options[0]?.value === "" && options[0]?.label === "全部类型", "首项永远是「全部类型」");
  assert(options.every((option) => !option.unaudited), "默认下拉里不该出现无审计来源的类型");
  assert(
    options.length === Object.keys(AUDIT_RESOURCE_TYPE_LABELS).length + 1,
    "默认下拉 = 全部类型 + 每个有审计来源的类型"
  );
}

{
  // 后端将来新增类型时不能把界面打空。
  const options = buildResourceTypeOptions("brand_new_type");
  const matched = options.find((option) => option.value === "brand_new_type");
  assert(matched, "未知类型也要有落点");
  assert(!matched.unaudited, "未知不等于无来源，不得妄下断言");
}

// ── 类型显示名：表格、详情、下拉共用一份 ────────────────────────────────────

assert(describeResourceType("voucher") === "凭证", "已知类型给中文名");
assert(describeResourceType("risk_finding") === "风险发现", "无审计来源的类型在表格里仍要能显示中文名");
assert(describeResourceType("some_future_type") === "some_future_type", "未知类型回落到原始取值，而不是留空");
assert(Object.keys(UNAUDITED_RESOURCE_TYPES).length === 3, "无审计来源的类型目前恰好三个");
