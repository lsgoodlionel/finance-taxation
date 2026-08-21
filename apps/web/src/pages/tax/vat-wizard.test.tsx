/**
 * 增值税申报向导的逻辑断言（P0-1 重写）。
 *
 * ## 这个文件原来是反面教材
 *
 * 它在文件内重新实现了增值税计算、批次查找、步骤导航三段逻辑，测的是自己的
 * 副本——向导里的真实代码一行没被覆盖。`test-honesty` 护栏建起来之后，
 * **第一个被抓的就是它**。
 *
 * 现在 import 真实实现（`vat-wizard-logic.ts`），向导也 import 同一份。
 */

import {
  canGoBack,
  canGoNext,
  canSubmitAtStep,
  computeVat,
  findVatBatch,
  type VatBatchLite
} from "./vat-wizard-logic";

function okVat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── 增值税计算 ───────────────────────────────────────────────────────────────

const v1 = computeVat(100000, 60000, 0);
okVat(v1.payable === 40000, "应纳税额 = 销项 − 进项");
okVat(!v1.isCreditCarried, "销项大于进项时是应缴，不是留抵");

const v2 = computeVat(30000, 60000, 0);
okVat(v2.payable === -30000, "进项大于销项时应纳税额为负");
// 留抵不是退税——它结转下期继续抵扣，钱拿不回来。
okVat(v2.isCreditCarried, "负数表示留抵");

const v3 = computeVat(50000, 30000, 5000);
okVat(v3.payable === 25000, "简易计税要加进应纳税额");

// 恰好轧平：既不缴也不留抵。边界值单独钉住——`< 0` 与 `<= 0` 写错一个字符，
// 轧平的月份会被报成留抵。
const v4 = computeVat(50000, 50000, 0);
okVat(v4.payable === 0, "销项等于进项时应纳税额为零");
okVat(!v4.isCreditCarried, "轧平不是留抵");

// ─── 批次查找 ─────────────────────────────────────────────────────────────────

const batches: VatBatchLite[] = [
  { id: "b1", taxType: "vat", filingPeriod: "2026-05", status: "ready" },
  { id: "b2", taxType: "iit", filingPeriod: "2026-05", status: "draft" },
  { id: "b3", taxType: "vat", filingPeriod: "2026-04", status: "filed" }
];

okVat(findVatBatch(batches, "2026-05")?.id === "b1", "按期间找到对应的增值税批次");
// 同期还有一张个税批次。只按期间找会拿到它，而它的金额与状态与增值税无关。
okVat(findVatBatch(batches, "2026-05")?.taxType === "vat", "不能匹配到同期的其他税种");
okVat(findVatBatch(batches, "2026-06") === null, "没有对应期间时返回 null");
okVat(findVatBatch(batches, "2026-04")?.status === "filed", "已申报的批次同样能找到");
okVat(findVatBatch([], "2026-05") === null, "空列表返回 null 而不是报错");

// ─── 步骤导航 ─────────────────────────────────────────────────────────────────

const STEP_COUNT = 4;

okVat(canGoNext(0, STEP_COUNT), "第一步可以往下");
okVat(canGoNext(2, STEP_COUNT), "中间步骤可以往下");
okVat(!canGoNext(3, STEP_COUNT), "最后一步不能再往下");
okVat(canSubmitAtStep(3, STEP_COUNT), "最后一步可以提交");
okVat(!canSubmitAtStep(2, STEP_COUNT), "非最后一步不能提交");
okVat(!canGoBack(0), "第一步不能后退");
okVat(canGoBack(1), "第二步可以后退");

console.log("vat-wizard tests passed");
