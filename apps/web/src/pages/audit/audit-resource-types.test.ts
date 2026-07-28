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

// ── 三类历史欠账已经补上写入点，必须当正常对象对待 ──────────────────────────
//
// 之前 document / tax_item / risk_finding 在 apps/api 里一条审计日志都不写，
// 三个选项选了就是空列表。写入点已补齐：
// - risk_finding：modules/risk/routes.ts（扫描开启/重新打开/消解 + 关闭复核）
// - tax_item：modules/events/routes.ts 生成 + modules/tax/routes.ts 修改/状态/并批
// - document：modules/events/routes.ts 生成 + modules/documents/routes.ts 修改/
//   状态/挂附件/归档
// 所以它们现在既要能筛、又不得再挂「查不到」的说明——那句话已经不是实话了。

for (const resourceType of ["document", "tax_item", "risk_finding"]) {
  assert(resourceType in AUDIT_RESOURCE_TYPE_LABELS, `${resourceType} 后端已留痕，应当可以直接筛`);
  assert(!isUnauditedResourceType(resourceType), `${resourceType} 已有审计来源，不得再标为无来源`);
  assert(
    describeUnauditedResourceType(resourceType) === null,
    `${resourceType} 已有审计来源，不该再给出「查不到」的说明`
  );
}

assert(describeUnauditedResourceType("voucher") === null, "凭证有审计来源，不该给出「查不到」的说明");

// 清单清空，但机制留着：真出现没有审计来源的类型时登记进去，页面会把原因说出来。
// 这条断言的作用是逼着「补后端」和「清清单」同时发生，而不是各走各的。
assert(Object.keys(UNAUDITED_RESOURCE_TYPES).length === 0, "已无后端不留痕的对象类型");

// ── 下拉里的每一项都必须是后端真的会写的类型 ────────────────────────────────
//
// 这份名单逐条对照过 apps/api/src 的 writeAudit 写入点。新增项时请一并核对，
// 加一个后端不写的类型 = 又造一个「选了就永远空」的假选项。

const VERIFIED_AUDIT_WRITERS = [
  "bank_statement", "business_event", "close_period", "contract", "counterparty",
  "document", "employee", "export_job", "filing_period", "invoice", "knowledge_item",
  "payroll", "payroll_transfer_batch", "risk_finding", "task", "tax_declaration_submission",
  "tax_item", "voucher"
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
  assert(!matched.unaudited, "风险发现现在有审计来源");
  assert(matched.label === "风险发现", "该项就是一个普通选项，不该再挂「无审计来源」");
}

// 单据与税务事项同理：drilldown.ts 的 resolveAuditContextFromState 会把
// documentId / taxItemId 映射成这两个 resourceType。
for (const resourceType of ["document", "tax_item"]) {
  const options = buildResourceTypeOptions(resourceType);
  const matched = options.find((option) => option.value === resourceType);
  assert(matched, `从深链带 ${resourceType} 进来时下拉必须有匹配项`);
  assert(!matched.unaudited, `${resourceType} 现在有审计来源`);
  assert(!matched.label.includes("无审计来源"), `${resourceType} 不该再挂「无审计来源」`);
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
assert(describeResourceType("risk_finding") === "风险发现", "风险发现在表格里要显示中文名");
assert(describeResourceType("document") === "单据", "单据在表格里要显示中文名");
assert(describeResourceType("tax_item") === "税务事项", "税务事项在表格里要显示中文名");
assert(describeResourceType("some_future_type") === "some_future_type", "未知类型回落到原始取值，而不是留空");
