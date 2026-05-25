import { LEGACY_ENTRY_ALIASES, APP_ENTRY_GUIDANCE, ASSISTANT_ENTRY_SUBTITLE, EVENTS_ENTRY_SUBTITLE } from "./entry-guidance";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(LEGACY_ENTRY_ALIASES["boss-qa"] === "/assistant", "expected boss-qa alias to redirect to assistant");
assert(APP_ENTRY_GUIDANCE.includes("AI 财税助手"), "expected app guidance to mention assistant");
assert(ASSISTANT_ENTRY_SUBTITLE.includes("标准入口一"), "expected assistant subtitle to remain primary entry");
assert(EVENTS_ENTRY_SUBTITLE.includes("标准入口二"), "expected events subtitle to remain secondary entry");

console.log("entry-guidance-ok");
