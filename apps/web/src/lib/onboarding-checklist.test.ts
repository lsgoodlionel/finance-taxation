import {
  GUIDED_CHECKLIST_STORAGE_PREFIX,
  buildOnboardingChecklist,
  markGuidedChecklistDone,
  readGuidedLocalFlags,
  type SetupStatus,
} from "./onboarding-checklist";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  assert(value !== undefined, `expected item at index ${index}`);
  return value;
}

const setupFixture: SetupStatus = {
  items: [
    { key: "company", label: "完善公司信息", done: true, actionPath: "/settings", hint: "填写统一社会信用代码" },
    { key: "taxpayer", label: "配置纳税人档案", done: false, actionPath: "/tax", hint: "设置纳税人口径" },
    { key: "bank", label: "添加银行账户", done: false, actionPath: "/banking", hint: "登记对公账户" },
  ],
  doneCount: 1,
  total: 3,
  ready: false,
};

const noLocalDone = { firstBill: false, askAi: false };

// ── pro：透传后端 setup 清单，行为不变 ───────────────────────────────────────
const pro = buildOnboardingChecklist(setupFixture, "pro", noLocalDone);
assert(pro, "expected pro checklist from setup data");
assert(pro.items.length === 3, "expected pro checklist to keep all setup items");
assert(at(pro.items, 0).label === "完善公司信息", "expected pro item labels preserved");
assert(at(pro.items, 1).actionPath === "/tax", "expected pro action paths preserved");
assert(pro.doneCount === 1 && pro.total === 3 && pro.ready === false, "expected pro counters preserved");
assert(at(pro.items, 0) !== at(setupFixture.items, 0), "expected pro items to be copies, not shared references");

// pro 无 setup 数据 → null（与现有 MyDayPage 行为一致：不渲染快速开始）
assert(
  buildOnboardingChecklist(null, "pro", noLocalDone) === null,
  "expected pro checklist to be null without setup data"
);

// ── guided：白话三件事 ───────────────────────────────────────────────────────
const guided = buildOnboardingChecklist(setupFixture, "guided", noLocalDone);
assert(guided, "expected guided checklist");
assert(guided.total === 3, "expected guided checklist to have exactly 3 items");
assert(at(guided.items, 0).label === "完善公司信息", "expected guided step 1 完善公司信息");
assert(at(guided.items, 0).actionPath === "/settings", "expected guided step 1 → /settings");
assert(at(guided.items, 1).label === "传第一张票据", "expected guided step 2 传第一张票据");
assert(at(guided.items, 1).actionPath === "/bills", "expected guided step 2 → /bills");
assert(at(guided.items, 2).label === "问 AI 一个问题", "expected guided step 3 问 AI 一个问题");
assert(at(guided.items, 2).actionPath === "/assistant", "expected guided step 3 → /assistant");

// done 判定：company 复用 setup 字段；其余两项来自本地标记
assert(at(guided.items, 0).done === true, "expected guided company done to reuse setup field");
assert(at(guided.items, 1).done === false && at(guided.items, 2).done === false, "expected local-flag items undone");
assert(guided.doneCount === 1 && guided.ready === false, "expected guided counters computed");

// 本地标记完成后 done 翻转
const guidedLocalDone = buildOnboardingChecklist(setupFixture, "guided", { firstBill: true, askAi: true });
assert(guidedLocalDone, "expected guided checklist with local flags");
assert(at(guidedLocalDone.items, 1).done && at(guidedLocalDone.items, 2).done, "expected local flags to mark items done");
assert(guidedLocalDone.ready === true, "expected guided ready when all three done");

// setup 未加载时 guided 仍可展示（company 视为未完成）
const guidedNoSetup = buildOnboardingChecklist(null, "guided", noLocalDone);
assert(guidedNoSetup, "expected guided checklist even without setup data");
assert(at(guidedNoSetup.items, 0).done === false, "expected company undone without setup data");

// ── 两种模式内容确实不同 ─────────────────────────────────────────────────────
assert(
  pro.items.some((item) => item.label === "配置纳税人档案") &&
    !guided.items.some((item) => item.label === "配置纳税人档案"),
  "expected pro-only professional item to be absent from guided checklist"
);
assert(
  guided.items.some((item) => item.label === "问 AI 一个问题") &&
    !pro.items.some((item) => item.label === "问 AI 一个问题"),
  "expected guided-only plain-language item to be absent from pro checklist"
);

// ── localStorage 读写：可用时读写、异常时静默降级 ────────────────────────────
const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  },
};
assert(readGuidedLocalFlags().firstBill === false, "expected empty storage to read as undone");
markGuidedChecklistDone("first-bill");
assert(store.get(`${GUIDED_CHECKLIST_STORAGE_PREFIX}first-bill`) === "1", "expected mark to write storage");
assert(readGuidedLocalFlags().firstBill === true, "expected marked flag to read back as done");
assert(readGuidedLocalFlags().askAi === false, "expected unmarked flag to stay undone");

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: () => {
      throw new Error("storage denied");
    },
    setItem: () => {
      throw new Error("storage denied");
    },
  },
};
assert(readGuidedLocalFlags().firstBill === false, "expected storage failure to degrade to undone");
markGuidedChecklistDone("ask-ai"); // 不应抛错
delete (globalThis as { window?: unknown }).window;

console.log("onboarding-checklist-ok");
