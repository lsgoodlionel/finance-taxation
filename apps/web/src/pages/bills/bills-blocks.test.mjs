import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * /bills 双层壳层的防回退约束。
 *
 * 改造前：容器出一份 ProPageBanner + PageHeader，三个子页各自再出一份
 * PageHeader（+ 单据页还带一条 FinanceFlowBar），用户在同一屏看到两个标题、
 * 两条业务链路条；单据 Tab 8 块、发票 Tab 6 块、银行 Tab 6 块。
 *
 * 改造后：壳层（横幅 / 标题 / 链路条 / 任务切换器）只由容器出一份，
 * 三个子页只提供内容主体，每个 Tab 首屏 5 块。
 *
 * 用 .mjs 读源码：三个子页运行时 import lib/api（读 import.meta.env），
 * 在 node 里加载不了。同 pages/events/event-detail-blocks.test.mjs。
 */
const read = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const CONTAINER = read("./BillsCenterPage.tsx");
const DOCUMENTS_SHELL = read("../documents/DocumentsShell.tsx");
const DOCUMENTS_HEADER = read("../documents/DocumentsHeader.tsx");
const INVOICES = read("../invoices/InvoicesPage.tsx");
const BANKING = read("../banking/BankingPage.tsx");

test("壳层只由容器出一份", () => {
  assert.ok(CONTAINER.includes("<ProPageBanner"), "容器应保留 guided 兜底横幅");
  assert.ok(CONTAINER.includes("<PageHeader"), "容器应保留页面标题");
  assert.ok(CONTAINER.includes('<FinanceFlowBar current="documents" />'), "容器应出唯一一条业务链路条");
  assert.ok(CONTAINER.includes("<TaskFocusShell"), "三件事应由任务切换器承载");
});

test("三个子页不再自带页头与链路条", () => {
  for (const [name, source] of [
    ["DocumentsShell", DOCUMENTS_SHELL],
    ["DocumentsHeader", DOCUMENTS_HEADER],
    ["InvoicesPage", INVOICES],
    ["InvoiceEntryModals", read("../invoices/InvoiceEntryModals.tsx")],
    ["BankingPage", BANKING],
    ["BankingReconciliationTab", read("../banking/BankingReconciliationTab.tsx")],
    ["BankingAccountModal", read("../banking/BankingAccountModal.tsx")]
  ]) {
    assert.ok(!source.includes("<PageHeader"), `${name} 不应再自带 PageHeader`);
    assert.ok(!source.includes("FinanceFlowBar"), `${name} 不应再自带业务链路条`);
    assert.ok(!source.includes("v3-hero-shell"), `${name} 不应再自带 hero 壳`);
  }
});

test("三个子页的动作与筛选并入内容块，不再各占一行", () => {
  // 发票：录入动作 + 方向筛选 + 合规告警都进台账卡
  assert.ok(INVOICES.includes("extra={("), "发票录入动作应挂在台账卡头");
  assert.ok(INVOICES.includes('aria-label="按发票方向筛选"'), "方向筛选应留在台账卡头并可被读屏识别");
  assert.ok(INVOICES.includes('aria-label="刷新发票列表"'), "纯图标刷新按钮必须有无障碍名称");
  // 银行：账户动作进页签栏
  assert.ok(BANKING.includes("tabBarExtraContent"), "银行的账户动作应挂在页签栏");
  // 单据：指引与帮助入口并入概览区
  assert.ok(DOCUMENTS_HEADER.includes('aria-label="打开业务说明"'), "业务说明入口应保留");
  assert.ok(
    DOCUMENTS_SHELL.includes("{summary}") && DOCUMENTS_SHELL.includes("{list}") && DOCUMENTS_SHELL.includes("{detail}"),
    "单据主体应只剩概览 + 列表/详情两块"
  );
  assert.ok(!DOCUMENTS_SHELL.includes("{header}"), "单据主体不应再有独立页头槽位");
});

test("KPI 收成紧凑一条，不再是四张大卡", () => {
  assert.ok(!INVOICES.includes('xs={24} sm={12} lg={6}'), "发票 KPI 不应再各占整行");
  assert.ok(!BANKING.includes('xs={24} sm={12} lg={6}'), "银行 KPI 不应再各占整行");
  assert.ok(INVOICES.includes('xs={12} lg={6}'), "发票 KPI 应压成两列/四列紧凑条");
  assert.ok(BANKING.includes('xs={12} lg={6}'), "银行 KPI 应压成两列/四列紧凑条");
});

test("两个子页拆成小文件，主文件只剩当前这件事的骨架", () => {
  // 拆分前 InvoicesPage 524 行、BankingPage 513 行，弹窗/列定义/对账工作台都堆在里面。
  for (const [name, source] of [["InvoicesPage", INVOICES], ["BankingPage", BANKING]]) {
    const lines = source.split("\n").length;
    assert.ok(lines < 400, `${name} 应保持在 400 行以内，当前 ${lines}`);
  }
  assert.ok(INVOICES.includes("<InvoiceEntryModals"), "发票录入弹窗应抽成独立组件");
  assert.ok(INVOICES.includes('from "./invoice-labels"'), "发票枚举文案应有单一事实来源");
  assert.ok(BANKING.includes("<BankingReconciliationTab"), "智能对账工作区应抽成独立组件");
  assert.ok(BANKING.includes("<BankingAccountModal"), "添加账户弹窗应抽成独立组件");
  assert.ok(BANKING.includes("buildCandidateColumns"), "列定义应抽成独立模块");
});

test("?tab= 深链契约不变：键名与取值都从 bills-tasks 单一来源取", () => {
  assert.ok(CONTAINER.includes("BILLS_TAB_QUERY_KEY"), "查询参数名应有单一事实来源");
  assert.ok(!CONTAINER.includes('"tab"'), "容器不应再各写一份字面量 tab 键名");
  assert.ok(CONTAINER.includes("nextParams.set(BILLS_TAB_QUERY_KEY, nextTab)"), "切换任务仍要写回 ?tab=");
  assert.ok(CONTAINER.includes("{ replace: true }"), "写回 URL 用 replace，避免污染后退栈");
});
