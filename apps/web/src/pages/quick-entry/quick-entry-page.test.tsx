import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QuickEntryPageView } from "./QuickEntryPageView";
import { MISSING_INVOICE_HINT } from "./entry-rules";
import type { QuickEntryController } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const noopAsync = async () => undefined;
const noop = () => undefined;

function makeController(patch: Partial<QuickEntryController> = {}): QuickEntryController {
  return {
    step: "describe",
    mode: "upload",
    setMode: noop,
    textInput: "",
    setTextInput: noop,
    receiptFile: null,
    parsing: false,
    parseError: null,
    parseSource: null,
    draft: { type: "", amount: "", occurredOn: "", counterparty: "", department: "", note: "" },
    updateDraft: noop,
    missingItems: [],
    hasAttachment: false,
    submitting: false,
    submitError: null,
    result: null,
    analyzeReceipt: noopAsync,
    analyzeText: noopAsync,
    skipToManualConfirm: noop,
    removeReceiptFile: noop,
    goBackToDescribe: noop,
    submit: noopAsync,
    reset: noop,
    ...patch
  };
}

function render(controller: QuickEntryController): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(QuickEntryPageView, { controller }))
  );
}

// ── 第 1 步：页头 + 3 步进度 + 两种输入方式 ──────────────────────────────────
const describeHtml = render(makeController());
assert(describeHtml.includes("记一笔"), "expected page title");
assert(describeHtml.includes("3 步记下一笔账"), "expected plain-language subtitle");
assert(describeHtml.includes("1 说清楚发生了什么"), "expected step 1 title");
assert(describeHtml.includes("2 确认"), "expected step 2 title");
assert(describeHtml.includes("3 完成"), "expected step 3 title");
assert(describeHtml.includes("v3-step-wizard"), "expected StepWizard shell");
assert(describeHtml.includes("拍照 / 传票据"), "expected upload tab");
assert(describeHtml.includes("打字描述"), "expected text tab");
assert(describeHtml.includes("图片或 PDF"), "expected upload hint");

// 识别失败：引导改用文字描述 + 手动填写降级出口
const errorHtml = render(makeController({ parseError: "票据识别没成功（AI 服务未配置）" }));
assert(errorHtml.includes("票据识别没成功"), "expected parse error surfaced");
assert(errorHtml.includes("跳过识别，手动填写"), "expected manual fallback button");

// ── 第 2 步：白话摘要 + 缺发票黄色提醒 + 可编辑字段 ──────────────────────────
const confirmHtml = render(
  makeController({
    step: "confirm",
    parseSource: "ai",
    missingItems: [MISSING_INVOICE_HINT],
    draft: {
      type: "expense",
      amount: "800",
      occurredOn: "2026-07-14",
      counterparty: "远大公司",
      department: "",
      note: "昨天请客户吃饭花了 800"
    }
  })
);
assert(confirmHtml.includes("日常花销 800 元"), "expected plain summary card");
assert(confirmHtml.includes("对方：远大公司"), "expected counterparty in summary");
assert(confirmHtml.includes("缺发票提醒"), "expected missing invoice alert title");
assert(confirmHtml.includes("稍后我们会提醒您补传"), "expected missing invoice hint body");
assert(confirmHtml.includes("确认记下这笔账"), "expected primary submit action");
assert(confirmHtml.includes("上一步"), "expected back action");
assert(!confirmHtml.includes("借方"), "expected no debit/credit jargon in confirm step");

// 创建失败：保留内容并给出重试按钮
const failedHtml = render(
  makeController({
    step: "confirm",
    submitError: "Request failed: 500",
    draft: {
      type: "expense",
      amount: "800",
      occurredOn: "2026-07-14",
      counterparty: "",
      department: "",
      note: "请客户吃饭"
    }
  })
);
assert(failedHtml.includes("没记上，内容已帮您留着"), "expected retry-friendly error");
assert(failedHtml.includes("重试：确认记下"), "expected retry button label");

// ── 第 3 步：白话总结 + 三个去向按钮 ─────────────────────────────────────────
const doneHtml = render(
  makeController({
    step: "done",
    result: { eventId: "evt-1", taskCount: 3, missingInvoice: true, uploadWarning: null }
  })
);
assert(doneHtml.includes("已记下！"), "expected success title");
assert(doneHtml.includes("财务会把它记进账本"), "expected plain next-step explanation");
assert(doneHtml.includes("补上才能税前扣除"), "expected missing invoice reminder on done page");
assert(doneHtml.includes("再记一笔"), "expected repeat action");
assert(doneHtml.includes("回今日"), "expected go-home action");
assert(doneHtml.includes("看这笔的进展"), "expected go-detail action");
