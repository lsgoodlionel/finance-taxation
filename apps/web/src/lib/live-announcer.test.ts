/**
 * live-announcer 护栏测试：
 * 1. 无 DOM 环境（本仓库测试跑在纯 Node，无 jsdom）下调用不得抛错——
 *    这保证了在业务代码里调用 announce() 不会意外破坏 SSR / 纯逻辑测试。
 */
import { announce } from "./live-announcer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

let threw = false;
try {
  announce("批量批准 3 条草稿，全部成功");
  announce("", false); // 空文案：应静默跳过，不抛错
  announce("发生错误", true);
} catch {
  threw = true;
}
assert(!threw, "expected announce() to no-op safely without a DOM environment");
assert(typeof document === "undefined", "expected this test to run without a DOM (sanity check on test env assumption)");
