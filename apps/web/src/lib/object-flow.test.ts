import { buildObjectFlow, collectRelatedObjects, type FlowRelatedObject } from "./object-flow";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function statusesOf(steps: readonly { status: string }[]): string {
  return steps.map((step) => step.status).join(",");
}

// ── 第一个未完成的是 current，其后一律 pending ──────────────────────────────
const midway = buildObjectFlow([
  { key: "collect", label: "收齐材料", done: true },
  { key: "review", label: "复核金额", done: false },
  { key: "submit", label: "提交办理", done: false }
]);
assert(statusesOf(midway.steps) === "done,current,pending", `unexpected statuses: ${statusesOf(midway.steps)}`);
assert(midway.nextStepKey === "review", "expected next step to be the first unfinished one");
assert(midway.overall === "in_progress", "expected in_progress overall");

// 「后面的步骤已完成」不影响推导：前置未完成就该停在前置上
const outOfOrder = buildObjectFlow([
  { key: "a", label: "第一步", done: false },
  { key: "b", label: "第二步", done: true },
  { key: "c", label: "第三步", done: true }
]);
assert(statusesOf(outOfOrder.steps) === "current,pending,pending", `unexpected: ${statusesOf(outOfOrder.steps)}`);
assert(outOfOrder.nextStepKey === "a", "expected first unfinished to win over later done steps");

// 第一步就未完成
const fresh = buildObjectFlow([
  { key: "a", label: "第一步", done: false },
  { key: "b", label: "第二步", done: false }
]);
assert(statusesOf(fresh.steps) === "current,pending", "expected first step to be current");

// ── blockedReason 只在 current 步上生效，并把整体拉成 blocked ────────────────
const blocked = buildObjectFlow([
  { key: "a", label: "第一步", done: true },
  { key: "b", label: "第二步", done: false, blockedReason: "缺一张回单" },
  { key: "c", label: "第三步", done: false }
]);
assert(statusesOf(blocked.steps) === "done,blocked,pending", `unexpected: ${statusesOf(blocked.steps)}`);
assert(blocked.overall === "blocked", "expected blocked overall");
assert(blocked.steps[1]?.hint === "缺一张回单", "expected blocking reason surfaced as hint");
assert(blocked.nextStepKey === "b", "expected blocked step to still be the next actionable one");

// 后续步骤上的 blockedReason 不该影响当前步（用户此刻管不着那一步）
const laterBlocked = buildObjectFlow([
  { key: "a", label: "第一步", done: false },
  { key: "b", label: "第二步", done: false, blockedReason: "等对方回复" }
]);
assert(laterBlocked.overall === "in_progress", "expected later blockedReason not to block overall");
assert(laterBlocked.steps[0]?.hint === undefined, "expected current step to have no hint");
assert(laterBlocked.steps[1]?.status === "pending", "expected later blocked step to stay pending");

// blockedReason 为 null / undefined 等同于没写
const nullBlocked = buildObjectFlow([{ key: "a", label: "第一步", done: false, blockedReason: null }]);
assert(nullBlocked.overall === "in_progress", "expected null blockedReason to be ignored");
assert(nullBlocked.steps[0]?.status === "current", "expected null blockedReason to keep step current");

// ── 全部完成 ────────────────────────────────────────────────────────────────
const finished = buildObjectFlow([
  { key: "a", label: "第一步", done: true },
  { key: "b", label: "第二步", done: true }
]);
assert(statusesOf(finished.steps) === "done,done", "expected all steps done");
assert(finished.nextStepKey === null, "expected no next step when finished");
assert(finished.overall === "done", "expected done overall");

// 全部完成时即便带 blockedReason 也不该冒出来——没有 current 步可挡
const finishedWithReason = buildObjectFlow([
  { key: "a", label: "第一步", done: true, blockedReason: "历史遗留" }
]);
assert(finishedWithReason.overall === "done", "expected done to win over stale blockedReason");
assert(finishedWithReason.steps[0]?.hint === undefined, "expected no hint on a done step");

// 空流程：视为无事可办
const empty = buildObjectFlow([]);
assert(empty.steps.length === 0, "expected empty steps");
assert(empty.nextStepKey === null, "expected null next step");
assert(empty.overall === "done", "expected empty flow to be done");

// owner / related 原样透传到每一步
const withMeta = buildObjectFlow([
  { key: "a", label: "第一步", done: true, owner: "出纳", related: [{ kind: "document", id: "DOC-1" }] },
  { key: "b", label: "第二步", done: false, owner: "会计" }
]);
assert(withMeta.steps[0]?.owner === "出纳", "expected owner preserved on done step");
assert(withMeta.steps[1]?.owner === "会计", "expected owner preserved on current step");
assert(withMeta.steps[0]?.related?.[0]?.id === "DOC-1", "expected related preserved");

// ── collectRelatedObjects：去重且保序 ───────────────────────────────────────
const flowWithDuplicates = buildObjectFlow([
  {
    key: "a",
    label: "第一步",
    done: true,
    related: [
      { kind: "document", id: "DOC-1", label: "回单" },
      { kind: "voucher", id: "V-1" }
    ]
  },
  {
    key: "b",
    label: "第二步",
    done: false,
    related: [
      { kind: "document", id: "DOC-1", label: "回单（重复）" },
      { kind: "document", id: "DOC-2" },
      { kind: "voucher", id: "V-1" }
    ]
  },
  { key: "c", label: "第三步", done: false }
]);
const collected = collectRelatedObjects(flowWithDuplicates);
assert(
  collected.map((object) => `${object.kind}:${object.id}`).join("|") === "document:DOC-1|voucher:V-1|document:DOC-2",
  `unexpected collect order: ${collected.map((object) => object.id).join("|")}`
);
assert(collected[0]?.label === "回单", "expected first occurrence to win on duplicate");

// 同 id 不同类型不算重复
const sameIdDifferentKind = buildObjectFlow([
  {
    key: "a",
    label: "第一步",
    done: false,
    related: [
      { kind: "document", id: "X-1" },
      { kind: "voucher", id: "X-1" }
    ]
  }
]);
assert(collectRelatedObjects(sameIdDifferentKind).length === 2, "expected kind to participate in dedupe key");

// 没有任何关联对象时返回空数组
assert(collectRelatedObjects(midway).length === 0, "expected empty array when no related objects");

const relatedInput: FlowRelatedObject[] = [{ kind: "task", id: "T-1" }];
const singleRelated = buildObjectFlow([{ key: "a", label: "第一步", done: false, related: relatedInput }]);
assert(collectRelatedObjects(singleRelated)[0]?.kind === "task", "expected related kind preserved");

console.log("object-flow-ok");
