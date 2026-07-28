import assert from "node:assert/strict";
import test from "node:test";
import { needsRuntimeAttention } from "./runtime-attention.ts";

/**
 * 四条判定分支各覆盖一条，外加「一切正常」的反例——后者是这条口径的存在理由：
 * 正常时面板必须让出首屏，任何一条分支被悄悄放宽都会让噪音重新占位。
 */

/** 一切正常的基线：跑成功、无需授权、无异常。 */
const CALM = {
  executionState: "succeeded",
  executionLabel: "运行成功",
  executionMessage: "本轮流程已完成。",
  authorizationState: "not_required",
  authorizationLabel: "无需授权",
  authorizationMessage: "当前无待授权事项。",
  stats: []
};

test("一切正常时不占据视线", () => {
  assert.equal(needsRuntimeAttention(CALM), false);
});

test("执行失败时需要现在就看", () => {
  assert.equal(needsRuntimeAttention({ ...CALM, executionState: "failed" }), true);
});

test("等待授权时需要现在就看", () => {
  assert.equal(
    needsRuntimeAttention({ ...CALM, authorizationState: "awaiting_authorization" }),
    true
  );
});

test("权限不足时需要现在就看", () => {
  assert.equal(needsRuntimeAttention({ ...CALM, authorizationState: "insufficient" }), true);
});

test("非 info 级异常时需要现在就看，info 级不打扰", () => {
  const withIssue = (tone) => ({
    ...CALM,
    issue: { tone, title: "校验提示", message: "有一条待确认的信息。" }
  });

  assert.equal(needsRuntimeAttention(withIssue("warning")), true);
  assert.equal(needsRuntimeAttention(withIssue("error")), true);
  assert.equal(needsRuntimeAttention(withIssue("info")), false);
});
