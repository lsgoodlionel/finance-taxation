/**
 * 科目码护栏（V8-U）。
 *
 * 历史迁移一次性修正了种子分录里的错码（5001→6001、4001→3001、6602→6301e0x…；
 * 末一项后来又被 V12-D3 改了回去，管理费用明细现在正是 6602xx），
 * 但只要运行时的凭证生成器还在产出表外科目，修正的价值就会被持续稀释。本文件把
 * 「凭证生成侧只能产出科目表里的叶子科目」变成可执行断言，覆盖当前全部生成路径；
 * 将来新增模板或事项规则时，只要接进下面的 VOUCHER_SOURCES 就自动受保护。
 *
 * 为什么必须是叶子科目：accounts/routes.ts 的科目选择器只列 isLeaf 科目，
 * 非叶子科目（2211 / 2221 / 6602 / 6603）挂账后既无法在 UI 中被选中复核，
 * 也会与它的子科目在报表上重复计量。
 */

import test from "node:test";
import assert from "node:assert/strict";
import type { BusinessEvent } from "@finance-taxation/domain-model";

import { CHART_OF_ACCOUNTS, findChartAccount } from "../accounts/chart-of-accounts.js";
import { listVoucherTemplates } from "./templates.js";
import { buildInvoiceVoucherDraft } from "../invoices/invoice-voucher.js";
import { buildSocialSecurityVouchers } from "../payroll/social-security-vouchers.js";
import { buildPurchaseExpenseBundle } from "../events/purchase-expense-rules.js";
import { buildTravelExpenseBundle } from "../events/travel-expense-rules.js";
import { buildContractRevenueBundle } from "../events/contract-revenue-rules.js";
import { buildEventMappings, PENDING_ACCOUNT_CODE } from "../events/routes.js";
import { EXPENSE_PREFIXES, REVENUE_PREFIXES } from "../analytics/routes.js";
import { REVENUE_PREFIXES as CONSISTENCY_REVENUE_PREFIXES } from "../tax-integration/consistency.routes.js";
import { REVENUE_PREFIXES as ANOMALY_REVENUE_PREFIXES } from "../ai-agents/anomaly/anomaly.routes.js";
import { classifyProfitAccount } from "../reports/profit-accounts.js";

/**
 * 全部按前缀取数的收入读路径。每新增一个按 `account_code like '6001%'` 之类
 * 过滤收入的模块，都要接进这张表。
 *
 * **V12-D3 之前每条路径还带一张 `exclude` 排除表**，因为主营业务成本 `6001c`
 * 落在 `6001%` 里、管理费用 `6301e` 落在 `6301%` 里，不排除就会被当成负收入
 * 冲减营业收入，金额静默偏小、没有任何报错。国标化把它们改成 `6401` / `6602`
 * 之后已无可排除之物，`exclude` 字段与相关断言一并删除。
 *
 * 取而代之的是下面那条守**根因**的断言：任何非收入科目的编码都不得落进收入
 * 前缀。这比原来强——原来是 N 条读路径各自记得补救，现在是从源头禁止产生
 * 需要补救的编码。
 */
const REVENUE_READ_PATHS = [
  { source: "analytics/routes.ts", include: REVENUE_PREFIXES },
  { source: "tax-integration/consistency.routes.ts", include: CONSISTENCY_REVENUE_PREFIXES },
  { source: "ai-agents/anomaly/anomaly.routes.ts", include: ANOMALY_REVENUE_PREFIXES }
] as const;

const SAMPLE_AMOUNT = "1000.00";

/** 一条待校验的科目码，附带来源标签以便断言失败时能直接定位到生成器。 */
interface AccountCodeUsage {
  source: string;
  accountCode: string;
  accountName: string;
}

function makeEvent(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: "EVT-GUARD-001",
    companyId: "cmp-v4-tech",
    type: "sales" as unknown as BusinessEvent["type"],
    title: "科目码护栏样例事项",
    description: "",
    department: "销售部",
    ownerId: "usr-v4-employee",
    occurredOn: "2026-04-08",
    amount: SAMPLE_AMOUNT,
    currency: "CNY",
    status: "needs_review" as unknown as BusinessEvent["status"],
    source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"],
    contractId: null,
    counterpartyId: null,
    projectId: null,
    createdAt: "2026-04-08T00:00:00.000Z",
    updatedAt: "2026-04-08T00:00:00.000Z",
    ...overrides
  };
}

function fromBundleLines(
  source: string,
  bundle: {
    voucherDrafts: readonly { lines: readonly { accountCode: string; accountName: string }[] }[];
  }
): AccountCodeUsage[] {
  return bundle.voucherDrafts.flatMap((draft) =>
    draft.lines.map((lineItem) => ({
      source,
      accountCode: lineItem.accountCode,
      accountName: lineItem.accountName
    }))
  );
}

/** 凭证模板：每个模板都按同一金额展开一次。 */
function templateUsages(): AccountCodeUsage[] {
  return listVoucherTemplates().flatMap((template) =>
    template.buildLines(SAMPLE_AMOUNT).map((lineItem) => ({
      source: `vouchers/templates.ts#${template.key}`,
      accountCode: lineItem.accountCode,
      accountName: lineItem.accountName
    }))
  );
}

/** 发票转凭证：进项/销项 × 有税额/无税额，四种组合。 */
function invoiceUsages(): AccountCodeUsage[] {
  const directions = ["input", "output"] as const;
  const taxAmounts = [130, 0];
  return directions.flatMap((direction) =>
    taxAmounts.flatMap((taxAmount) => {
      const draft = buildInvoiceVoucherDraft({
        direction,
        sellerName: "供应商A",
        buyerName: "客户B",
        invoiceNo: "00000001",
        amount: 1000,
        taxAmount,
        totalAmount: 1000 + taxAmount
      });
      return draft.lines.map((lineItem) => ({
        source: `invoices/invoice-voucher.ts#${direction}/tax=${taxAmount}`,
        accountCode: lineItem.accountCode,
        accountName: lineItem.accountName
      }));
    })
  );
}

/** 三险一金：单位与个人部分均非零，覆盖计提与缴纳两张凭证的全部分录。 */
function socialSecurityUsages(): AccountCodeUsage[] {
  return buildSocialSecurityVouchers({
    period: "2026-04",
    socialSecurityEmployer: 3200,
    socialSecurityEmployee: 1100,
    housingFundEmployer: 900,
    housingFundEmployee: 900
  }).flatMap((draft) =>
    draft.lines.map((lineItem) => ({
      source: `payroll/social-security-vouchers.ts#${draft.key}`,
      accountCode: lineItem.accountCode,
      accountName: lineItem.accountName
    }))
  );
}

/** 采购报销规则：三种归类分别命中不同的借方科目。 */
function purchaseExpenseUsages(): AccountCodeUsage[] {
  const classifications = ["low_value_consumable", "sales_expense", "fixed_asset"];
  return classifications.flatMap((classification) =>
    fromBundleLines(
      `events/purchase-expense-rules.ts#${classification}`,
      buildPurchaseExpenseBundle(
        makeEvent({
          id: `PUR-GUARD-${classification}`,
          type: "purchase_expense" as unknown as BusinessEvent["type"],
          description: JSON.stringify({
            input: { providedDocumentTypes: ["expense_claim", "invoice_bundle"] },
            expected: { classification }
          })
        })
      )
    )
  );
}

function travelExpenseUsages(): AccountCodeUsage[] {
  return fromBundleLines(
    "events/travel-expense-rules.ts",
    buildTravelExpenseBundle(
      makeEvent({
        id: "TRV-GUARD-001",
        type: "travel_expense" as unknown as BusinessEvent["type"],
        description: JSON.stringify({
          input: { providedDocumentTypes: ["expense_claim", "transport_invoice", "hotel_invoice"] },
          expected: { classification: "travel_expense" }
        })
      })
    )
  );
}

/** 合同收入：立即确认与递延（合同负债）两条分支的贷方科目不同。 */
function contractRevenueUsages(): AccountCodeUsage[] {
  const classifications = ["contract_revenue", "contract_revenue_deferred"];
  return classifications.flatMap((classification) =>
    fromBundleLines(
      `events/contract-revenue-rules.ts#${classification}`,
      buildContractRevenueBundle(
        makeEvent({
          id: `CON-GUARD-${classification}`,
          type: "contract_revenue" as unknown as BusinessEvent["type"],
          description: JSON.stringify({
            input: { providedDocumentTypes: ["contract", "acceptance_record"] },
            expected: { classification }
          })
        })
      )
    )
  );
}

/** events/routes.ts 内联生成的凭证草稿（sales / procurement / asset / expense / payroll / rnd）。 */
function eventMappingUsages(): AccountCodeUsage[] {
  const eventTypes = ["sales", "procurement", "asset", "expense", "payroll", "rnd"];
  return eventTypes.flatMap((eventType) =>
    fromBundleLines(
      `events/routes.ts#${eventType}`,
      buildEventMappings(
        makeEvent({
          id: `EVT-GUARD-${eventType}`,
          type: eventType as unknown as BusinessEvent["type"]
        })
      )
    )
  );
}

function allVoucherAccountCodes(): AccountCodeUsage[] {
  return [
    ...templateUsages(),
    ...invoiceUsages(),
    ...socialSecurityUsages(),
    ...purchaseExpenseUsages(),
    ...travelExpenseUsages(),
    ...contractRevenueUsages(),
    ...eventMappingUsages()
  ];
}

test("every runtime voucher line posts to a code registered in CHART_OF_ACCOUNTS", () => {
  // Arrange
  const usages = allVoucherAccountCodes();

  // Act
  const unregistered = usages.filter((usage) => !findChartAccount(usage.accountCode));

  // Assert
  assert.deepEqual(
    unregistered,
    [],
    `凭证生成器产出了科目表里不存在的科目码：${JSON.stringify(unregistered)}`
  );
});

test("every runtime voucher line posts to a leaf account", () => {
  // Arrange
  const usages = allVoucherAccountCodes();

  // Act
  const nonLeaf = usages.filter((usage) => findChartAccount(usage.accountCode)?.isLeaf === false);

  // Assert
  assert.deepEqual(
    nonLeaf,
    [],
    `凭证生成器挂到了非叶子科目（会与子科目重复计量，且科目选择器不列示）：${JSON.stringify(nonLeaf)}`
  );
});

test("every runtime voucher line carries the chart of accounts name for its code", () => {
  // Arrange：科目名只是展示字段，但码名不一致会让复核人看错口径
  //（差旅费曾挂 6601「职工薪酬（成本）」却显示为「销售费用-差旅费」，
  // 采购模板曾挂 1403「库存商品」却显示为「原材料」）。
  const usages = allVoucherAccountCodes();

  // Act
  const mismatched = usages.filter(
    (usage) => findChartAccount(usage.accountCode)?.name !== usage.accountName
  );

  // Assert
  assert.deepEqual(mismatched, [], `凭证科目名与科目表不一致：${JSON.stringify(mismatched)}`);
});

test("the unknown-event fallback keeps a non-postable placeholder code", () => {
  // Arrange
  const bundle = buildEventMappings(
    makeEvent({ id: "EVT-GUARD-unknown", type: "unmapped" as unknown as BusinessEvent["type"] })
  );

  // Act
  const codes = bundle.voucherDrafts.flatMap((draft) => draft.lines.map((l) => l.accountCode));

  // Assert：占位科目必须保持「不是科目表里的科目」，否则会被误当成可过账分录
  assert.equal(codes.length > 0, true);
  assert.equal(codes.every((code) => code === PENDING_ACCOUNT_CODE), true);
  assert.equal(findChartAccount(PENDING_ACCOUNT_CODE), undefined);
  assert.equal(
    bundle.voucherDrafts.every((draft) => draft.status === "draft"),
    true
  );
});

test("analytics read-path prefixes all resolve to real chart accounts", () => {
  // Arrange：取数侧按前缀过滤，前缀写错不会报错，只会让金额静默漏算
  //（旧的 5601/6602/6603 在科目表里根本不存在，费用长期少计）。
  const prefixes = [...REVENUE_READ_PATHS.flatMap((path) => [...path.include]), ...EXPENSE_PREFIXES];

  // Act
  const unmatched = prefixes.filter(
    (prefix) => !CHART_OF_ACCOUNTS.some((account) => account.code.startsWith(prefix))
  );

  // Assert
  assert.deepEqual(unmatched, [], `取数前缀在科目表里没有任何匹配科目：${unmatched.join(", ")}`);
});

test("every revenue read path's prefixes agree with the profit statement classifier", () => {
  // Arrange：取数侧与 reports/profit-accounts.ts 必须同口径，否则
  // /analytics、/tax-integration/consistency、/anomaly 会对同一期间
  // 给出彼此不同的「收入」。
  const codes = CHART_OF_ACCOUNTS.map((account) => account.code);
  const matches = (code: string, prefixes: readonly string[]) =>
    prefixes.some((prefix) => code.startsWith(prefix));

  // Act：模拟 SQL 的 like 语义——命中收入前缀即被取走
  const misclassified = REVENUE_READ_PATHS.flatMap((path) =>
    codes
      .filter((code) => matches(code, path.include))
      .filter((code) => classifyProfitAccount(code) !== "revenue")
      .map((code) => `${path.source}: ${code}`)
  );

  // Assert
  assert.deepEqual(
    misclassified,
    [],
    `被当作收入取数、但利润表口径不是收入的科目：${misclassified.join("; ")}`
  );
});

test("analytics expense prefixes agree with the profit statement classifier", () => {
  // Arrange
  const codes = CHART_OF_ACCOUNTS.map((account) => account.code);
  const matches = (code: string, prefixes: readonly string[]) =>
    prefixes.some((prefix) => code.startsWith(prefix));

  // Act
  const expenseSelected = codes.filter((code) => matches(code, EXPENSE_PREFIXES));
  const misclassifiedExpense = expenseSelected.filter(
    (code) => classifyProfitAccount(code) !== "expense"
  );

  // Assert
  assert.deepEqual(
    misclassifiedExpense,
    [],
    `被当作费用取数、但利润表口径不是费用的科目：${misclassifiedExpense.join(", ")}`
  );
  // 所得税费用 6801 不属于期间费用预算，必须留在 EXPENSE_PREFIXES 之外
  assert.equal(matches("6801", EXPENSE_PREFIXES), false);
});

test("没有任何非收入科目的编码落进收入前缀——D3 消除的就是这件事", () => {
  // Arrange：这条取代了 V12-D3 之前的「每条读路径都必须排除 6001c / 6301e」。
  //
  // 那条断言守的是**补救**：N 个按 like 取收入的读路径，每个都要记得带上排除表。
  // 这条守的是**根因**：科目表里就不该存在「以收入前缀开头但不是收入」的编码。
  // 只要没有这种编码，所有读路径都不需要排除表，将来新增的读路径也天然安全。
  //
  // 谁会让它变红：有人再引入一个 `6001x` 之类的自造编码。那时该改的是编码，
  // 不是给每个读路径再补一次排除表。
  const codes = CHART_OF_ACCOUNTS.map((account) => account.code);

  // Act
  const offenders = codes
    .filter((code) => REVENUE_PREFIXES.some((prefix) => code.startsWith(prefix)))
    .filter((code) => classifyProfitAccount(code) !== "revenue")
    .map((code) => `${code} ${findChartAccount(code)?.name ?? ""}`);

  // Assert
  assert.deepEqual(
    offenders,
    [],
    `这些科目的编码落在收入前缀里但不是收入，会被所有按 like 取收入的读路径` +
      `当成负收入冲减营业收入：${offenders.join("、")}`
  );
});

test("CHART_OF_ACCOUNTS is internally consistent", () => {
  // Arrange
  const codes = CHART_OF_ACCOUNTS.map((account) => account.code);
  const childCountByParent = new Map<string, number>();
  for (const account of CHART_OF_ACCOUNTS) {
    if (!account.parentCode) continue;
    childCountByParent.set(account.parentCode, (childCountByParent.get(account.parentCode) ?? 0) + 1);
  }

  // Act
  const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
  const danglingParents = CHART_OF_ACCOUNTS.filter(
    (account) => account.parentCode !== null && !findChartAccount(account.parentCode)
  ).map((account) => account.code);
  const childlessNonLeaves = CHART_OF_ACCOUNTS.filter(
    (account) => !account.isLeaf && (childCountByParent.get(account.code) ?? 0) === 0
  ).map((account) => account.code);
  const leavesWithChildren = CHART_OF_ACCOUNTS.filter(
    (account) => account.isLeaf && (childCountByParent.get(account.code) ?? 0) > 0
  ).map((account) => account.code);

  // Assert
  assert.deepEqual(duplicates, [], "科目码重复");
  assert.deepEqual(danglingParents, [], "parentCode 指向不存在的科目");
  // 非叶子却没有子科目 = 无法记账的死科目（1601 曾是这种状态）
  assert.deepEqual(childlessNonLeaves, [], "非叶子科目缺少子科目，任何凭证都无法合法挂账");
  assert.deepEqual(leavesWithChildren, [], "叶子科目却带有子科目");
});
