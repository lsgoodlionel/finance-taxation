import {
  APP_ENTRY_GUIDANCE,
  ASSISTANT_ENTRY_SUBTITLE,
  CHAIRMAN_DASHBOARD_SUBTITLE,
  EVENTS_ENTRY_SUBTITLE,
  LEGACY_ENTRY_ALIASES,
  SIDEBAR_BRAND_SUBTITLE
} from "./entry-guidance";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  APP_ENTRY_GUIDANCE === "先从 AI 财税助手或经营事项总线进入，再推进任务、单据、凭证、税务与导出。",
  "shared app entry guidance should describe the standard entry path"
);
assert(
  SIDEBAR_BRAND_SUBTITLE === APP_ENTRY_GUIDANCE,
  "sidebar subtitle should reuse the shared entry guidance"
);
assert(
  /先提问|上传/.test(ASSISTANT_ENTRY_SUBTITLE),
  "assistant subtitle should explain question or upload entry actions"
);
assert(
  /标准入口二/.test(EVENTS_ENTRY_SUBTITLE),
  "events subtitle should mark events as the second standard entry"
);
assert(
  /总览/.test(CHAIRMAN_DASHBOARD_SUBTITLE),
  "dashboard subtitle should describe overview positioning"
);
assert(
  Object.keys(LEGACY_ENTRY_ALIASES).length === 1 && LEGACY_ENTRY_ALIASES["boss-qa"] === "/assistant",
  "only boss-qa should remain as the legacy entry alias"
);

console.log("entry-guidance-ok");
