/**
 * 费用类型 → 科目映射的断言（V15）。
 *
 * 最要紧的一条是**业务招待费不能落到差旅费**：两者的税前扣除口径完全不同
 * （招待费只能按 60% 且不超过收入的 5‰），混了要到汇算清缴才发现。
 * chart-of-accounts.ts 的注释里记着一次真实事故就是这么来的。
 */

import { EXPENSE_TYPE_OPTIONS, accountNameOf, defaultAccountFor } from "./expense-account-map";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 招待费与差旅费必须分开 ──────────────────────────────────────────────────
assert(
  defaultAccountFor("entertainment").code === "660204",
  "业务招待费必须挂 660204——挂到差旅费会让汇算清缴调不出来"
);
assert(defaultAccountFor("travel_hotel").code === "660203", "住宿费应当挂差旅费");
assert(
  defaultAccountFor("entertainment").code !== defaultAccountFor("travel_hotel").code,
  "招待费与差旅费的科目不能相同"
);

// ── 三种差旅归同一个科目 ────────────────────────────────────────────────────
const travelCodes = new Set(
  ["travel_hotel", "travel_meal", "travel_transport"].map((t) => defaultAccountFor(t).code)
);
assert(travelCodes.size === 1, "住宿/餐补/交通都属于差旅费，应当归同一科目");

// ── 未知类型落到「其他」而不是空 ────────────────────────────────────────────
// 空科目会让整张单提交失败，而失败原因在界面上看不出来。
const unknown = defaultAccountFor("没见过的类型");
assert(unknown.code === "660207", "未知类型应当落到管理费用-其他");
assert(unknown.name.length > 0, "科目名不能为空");

// ── 每个选项都有非空的科目与名称 ────────────────────────────────────────────
for (const option of EXPENSE_TYPE_OPTIONS) {
  assert(option.accountCode.trim().length > 0, `${option.label} 缺科目编码`);
  assert(option.accountName.trim().length > 0, `${option.label} 缺科目名称`);
  assert(
    /^6\d{5}$/.test(option.accountCode),
    `${option.label} 的科目编码 ${option.accountCode} 不像费用类明细科目`
  );
}

// ── accountNameOf 查不到时回显编码，不显示空白 ──────────────────────────────
assert(accountNameOf("660203") === "管理费用-差旅费", "应当查得到已知科目名");
assert(accountNameOf("999999") === "999999", "查不到时应当回显编码本身");

console.log("expense-account-map tests passed");
