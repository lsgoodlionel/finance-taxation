import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicAssistantReply, buildDeterministicOcrText } from "./fallback.js";

test("deterministic staff reply emits action block for purchase expense text", () => {
  const reply = buildDeterministicAssistantReply(
    [{ role: "user", content: "2026-06-26 临时购买办公显示器 1999元，准备报销" }],
    "staff"
  );

  assert.match(reply.content, /建议直接创建并进入自动分析/);
  assert.ok(reply.actionText);
  assert.match(reply.actionText!, /"type": "expense"/);
  assert.match(reply.actionText!, /"title": "临时购买办公显示器"/);
  assert.match(reply.actionText!, /"amount": 1999/);
  assert.match(reply.actionText!, /"occurredOn": "2026-06-26"/);
});

test("deterministic staff reply strips trailing action phrase from title", () => {
  const reply = buildDeterministicAssistantReply(
    [{ role: "user", content: "购买办公鼠标 299元，申请报销" }],
    "staff"
  );

  assert.match(reply.actionText!, /"title": "购买办公鼠标"/);
});

test("deterministic boss reply does not emit action block", () => {
  const reply = buildDeterministicAssistantReply(
    [{ role: "user", content: "本月现金够不够发工资？" }],
    "boss"
  );

  assert.equal(reply.actionText, null);
  assert.match(reply.content, /老板视角回复/);
});

test("deterministic ocr text returns stable receipt summary", () => {
  const text = buildDeterministicOcrText("application/pdf");
  assert.match(text, /凭证类型：PDF票据/);
  assert.match(text, /办公显示器/);
});
