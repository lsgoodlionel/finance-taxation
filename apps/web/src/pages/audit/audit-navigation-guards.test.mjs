import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * 「假链接」修法的前提守卫。
 *
 * audit-navigation.ts 之所以要给事项回跳补查询参数、把导出任务的文案改成
 * 「打开导出与归档中心」，前提是那两个目标页**确实不读 location.state**。
 * 前提哪天变了（有人给目标页加上了 state 读取），这里会红，提醒回来重新判断，
 * 而不是让一条修好的链接变成多余的补丁、或让假链接悄悄复活。
 *
 * 用 .mjs 读源码：apps/web 的 tsconfig 不含 node 类型，.ts 测试里用不了 node:fs。
 */

const eventsPage = readFileSync(new URL("../EventsPage.tsx", import.meta.url), "utf8");
const exportCenterPage = readFileSync(new URL("../export-center/ExportCenterPage.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("./audit-navigation.ts", import.meta.url), "utf8");
const drilldown = readFileSync(new URL("../drilldown.ts", import.meta.url), "utf8");

test("EventsPage 仍然只认 ?event=，所以审计回跳必须带查询参数", () => {
  assert.ok(
    !eventsPage.includes("location.state"),
    "EventsPage 开始读 location.state 了？请重新核对 audit-navigation 的修法"
  );
  assert.ok(
    eventsPage.includes('useQueryState("event"'),
    "EventsPage 用 ?event= 选中事项，审计回跳必须对齐这个参数名"
  );
  assert.ok(
    navigation.includes('EVENTS_QUERY_KEY = "event"'),
    "回跳用的参数名要和 EventsPage 保持一致"
  );
});

test("drilldown 里事项回跳本身仍是只带 state 的假链接（本页已就地修正）", () => {
  assert.ok(
    drilldown.includes('case "business_event":') && drilldown.includes('path: "/events"'),
    "共享的 resolveAuditLogTarget 仍然只给 /events + state；" +
      "它归属跨页面的公共模块，本车道只在 audit 侧包一层修正，并已在报告里提出上游修复"
  );
});

test("ExportCenterPage 仍然不读任何跳转上下文，所以不能声称能定位到具体任务", () => {
  assert.ok(
    !exportCenterPage.includes("location.state"),
    "ExportCenterPage 支持从 state 选中任务了？请把回跳文案改回「查看导出任务」并带上定位信息"
  );
  assert.ok(
    !exportCenterPage.includes("useSearchParams"),
    "ExportCenterPage 也不从 URL 取当前 tab，历史记录同样定位不到"
  );
  assert.ok(
    navigation.includes("打开导出与归档中心"),
    "文案必须与它真正能做到的事一致"
  );
});

test("extractExportScene 目前是死代码，别再往上加东西", () => {
  assert.ok(
    drilldown.includes("function extractExportScene"),
    "extractExportScene 还在 drilldown.ts 里"
  );
  // 唯一可能的消费方是 ExportCenterPage，而它连 useLocation 都没有：
  // drilldown 算出的 scene 送不到任何人手上。清理属于跨页面改动，
  // 已在报告里作为上游需求提出，不在本车道就地删。
  assert.ok(
    !exportCenterPage.includes("useLocation"),
    "ExportCenterPage 开始读跳转上下文了？那 scene 就有了消费方，请重新核对"
  );
});
