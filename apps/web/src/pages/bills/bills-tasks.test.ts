import { resolveActiveTask } from "../../lib/task-focus";
import {
  BILLS_TAB_KEYS,
  BILLS_TAB_QUERY_KEY,
  DEFAULT_BILLS_TAB,
  buildBillsTasks,
  getBillsTabTitle,
  isBillsTabKey
} from "./bills-tasks";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ── 深链契约：?tab= 的键名与三个取值一律不得改动 ────────────────────────────
// tests/e2e/smoke/v7-dual-track.spec.ts 断言 /documents → /bills?tab=documents；
// tests/e2e/smoke/finance-flow-navigation.spec.ts 与 lib/scene-commands.ts 同样直连。
assertEqual(BILLS_TAB_QUERY_KEY, "tab", "the deep-link query key must stay ?tab=");
assertEqual(BILLS_TAB_KEYS.documents, "documents", "the documents deep link must stay stable");
assertEqual(BILLS_TAB_KEYS.invoices, "invoices", "the invoices deep link must stay stable");
assertEqual(BILLS_TAB_KEYS.banking, "banking", "the banking deep link must stay stable");
assertEqual(DEFAULT_BILLS_TAB, "documents", "a bare /bills must still land on documents");

const tasks = buildBillsTasks();
assertEqual(tasks.length, 3, "expected /bills to carry exactly three tasks");
assertEqual(
  tasks.map((task) => task.key).join(","),
  "documents,invoices,banking",
  "expected the task order to match the previous tab order"
);
assert(
  tasks.every((task) => typeof task.description === "string" && task.description.length > 0),
  "expected every task to say what it is for"
);

// URL 里的 tab 直接喂给共享的任务解析，行为与 /tax、/risk 一致。
for (const key of ["documents", "invoices", "banking"]) {
  assert(isBillsTabKey(key), `expected ${key} to be a valid tab`);
  assertEqual(resolveActiveTask(tasks, key, DEFAULT_BILLS_TAB), key, `expected ?tab=${key} to win`);
}
assert(!isBillsTabKey("payroll"), "expected an unknown tab to be rejected");
assert(!isBillsTabKey(null), "expected a missing tab to be rejected");
assert(!isBillsTabKey("constructor"), "expected inherited object keys not to pass as tabs");
assertEqual(
  resolveActiveTask(tasks, "payroll", DEFAULT_BILLS_TAB),
  DEFAULT_BILLS_TAB,
  "expected an unknown tab to fall back to documents"
);
assertEqual(
  resolveActiveTask(tasks, null, DEFAULT_BILLS_TAB),
  DEFAULT_BILLS_TAB,
  "expected a bare /bills to fall back to documents"
);

// ── 标题随当前这件事走：三个子页各自的 PageHeader 收归容器后不得丢名字 ─────
// tests/e2e/smoke/finance-flow-navigation.spec.ts 断言 /bills?tab=documents 上
// 有一个名为「单据中心」的标题。
assertEqual(getBillsTabTitle("documents"), "单据中心", "expected the documents title to survive the merge");
assertEqual(getBillsTabTitle("invoices"), "发票台账", "expected the invoices title to survive the merge");
assertEqual(getBillsTabTitle("banking"), "银行管理", "expected the banking title to survive the merge");
assertEqual(getBillsTabTitle("payroll"), "单据中心", "expected an unknown tab to fall back to the default title");

console.log("bills-tasks-ok");
