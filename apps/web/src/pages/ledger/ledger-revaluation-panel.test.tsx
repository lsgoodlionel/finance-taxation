/**
 * 调汇面板的静态渲染断言（V12-D5）。
 *
 * 这个面板的数字全靠接口来，渲染测试能验的是**它有没有把话说清楚**：
 * 用户看到「不调整」时得知道为什么，看到缺汇率时得知道为什么整张凭证都不生成。
 * 这些文案是面板唯一不依赖运行时数据的部分，也是最容易在改动中被顺手删掉的部分。
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LedgerRevaluationPanel } from "./LedgerRevaluationPanel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(createElement(LedgerRevaluationPanel));

// 准则依据要写在界面上而不是只写在代码注释里：用户会问「为什么预付账款没调」，
// 答案得在他眼前，而不是在某个工程师的注释里。
assert(
  html.includes("非货币性项目") && html.includes("19 号"),
  "调汇范围的准则依据必须显示在面板上"
);

assert(
  html.includes("草稿凭证"),
  "必须讲明生成的是草稿——用户以为直接过账会漏掉复核这一步"
);

// 汇率的方向（1 外币 = N 人民币）填反会让金额差出一个数量级，
// 而两种填法在界面上长得一模一样。
assert(
  html.includes("1 外币 = N 人民币"),
  "汇率方向必须写明，填反了差一个数量级且界面上看不出来"
);

// 同日同币种唯一这条约束，用户不知道就会反复录入然后困惑于「哪条生效」。
assert(
  html.includes("同一天同一币种只保留一条"),
  "必须说明同日同币种是更新而非新增"
);
