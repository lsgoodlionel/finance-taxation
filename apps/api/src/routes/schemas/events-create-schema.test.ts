/**
 * POST /api/events 的必填校验回归测试。
 *
 * 背景：business_events 上 type / title / occurred_on 是 NOT NULL 且无默认值，
 * 而该路由的 bodySchema 此前所有字段都没标 required —— 缺字段时校验放行，
 * 一路打到数据库约束，用户拿到的是 500（"null value in column ... violates
 * not-null constraint"）而不是 400。这是非财务用户在「记一笔」向导路径上
 * 唯一能触发的 500，故用本测试钉住。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateObject } from "../../utils/validate.js";
import { eventsTasksBodySchemas } from "./events-tasks.js";

const schema = eventsTasksBodySchemas["POST /api/events"];
if (!schema) {
  throw new Error("POST /api/events 必须有 bodySchema —— 缺失会让必填字段一路打到数据库约束");
}

const validBody = {
  type: "expense",
  title: "办公用品采购",
  occurredOn: "2026-07-20"
};

test("POST /api/events schema 覆盖三个 NOT NULL 无默认值字段", () => {
  for (const field of ["type", "title", "occurredOn"] as const) {
    assert.equal(
      schema[field]?.required,
      true,
      `${field} 在表上是 NOT NULL 且无默认值，schema 必须标 required，否则缺字段会变成 500`
    );
  }
});

test("完整请求体通过校验", () => {
  const result = validateObject(validBody, schema);
  assert.equal(result.ok, true, `expected valid body to pass: ${JSON.stringify(result)}`);
});

for (const missing of ["type", "title", "occurredOn"] as const) {
  test(`缺少 ${missing} 时被校验拦下（400 而非 500）`, () => {
    const body: Record<string, unknown> = { ...validBody };
    delete body[missing];

    const result = validateObject(body, schema);
    assert.equal(result.ok, false, `缺少 ${missing} 时不应通过校验`);
  });
}

test("选填字段缺失不影响校验通过（由 handler 兜底为建表默认值）", () => {
  // description / department / source 在表上是 NOT NULL 但有默认值（''/''/'manual'），
  // 对用户是选填；createEvent 用 ?? 兜底，故这里不应要求必填。
  for (const field of ["description", "department", "source"] as const) {
    assert.notEqual(
      schema[field]?.required,
      true,
      `${field} 对用户是选填（表上有默认值），不应标 required`
    );
  }
  assert.equal(validateObject(validBody, schema).ok, true);
});
