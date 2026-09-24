import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshotProvenance, evaluateSnapshotFreshness } from "./provenance.js";

test("溯源：取最大过账时间，不依赖调用方的排序", () => {
  const provenance = buildSnapshotProvenance([
    { postedAt: "2026-03-05T10:00:00.000Z" },
    { postedAt: "2026-03-20T08:00:00.000Z" },
    { postedAt: "2026-03-11T23:00:00.000Z" }
  ]);

  assert.equal(provenance.entryCount, 3);
  assert.equal(provenance.latestPostedAt, "2026-03-20T08:00:00.000Z");
});

test("溯源：期间内没有分录时截止时点是 null，不是空串", () => {
  // null 表示「没有数据」，空串会被前端当成一个时间去格式化。
  assert.deepEqual(buildSnapshotProvenance([]), { entryCount: 0, latestPostedAt: null });
});

test("溯源：未过账分录不参与截止时点", () => {
  const provenance = buildSnapshotProvenance([
    { postedAt: null },
    { postedAt: "2026-03-01T00:00:00.000Z" }
  ]);

  assert.equal(provenance.entryCount, 2, "条数按纳入计算的分录算");
  assert.equal(provenance.latestPostedAt, "2026-03-01T00:00:00.000Z");
});

test("新鲜度：条数与截止时点都没变 → fresh", () => {
  const p = { entryCount: 12, latestPostedAt: "2026-03-31T12:00:00.000Z" };
  assert.deepEqual(evaluateSnapshotFreshness(p, { ...p }), { status: "fresh" });
});

test("新鲜度：生成后补过账 → stale，并说清多了几条", () => {
  // 这是最常见的场景：月结出完报表，有人又补一张上月凭证。
  const result = evaluateSnapshotFreshness(
    { entryCount: 12, latestPostedAt: "2026-03-31T12:00:00.000Z" },
    { entryCount: 14, latestPostedAt: "2026-04-02T09:00:00.000Z" }
  );

  assert.equal(result.status, "stale");
  assert.match(result.status === "stale" ? result.reason : "", /新增了 2 条/);
});

test("新鲜度：分录被删 → 同样是 stale", () => {
  const result = evaluateSnapshotFreshness(
    { entryCount: 12, latestPostedAt: "2026-03-31T12:00:00.000Z" },
    { entryCount: 10, latestPostedAt: "2026-03-31T12:00:00.000Z" }
  );

  assert.equal(result.status, "stale");
  assert.match(result.status === "stale" ? result.reason : "", /减少了 2 条/);
});

test("新鲜度：一增一删条数不变，靠截止时点抓出来", () => {
  // 单看条数会漏判——红冲一笔再补一笔正是这个形状。
  const result = evaluateSnapshotFreshness(
    { entryCount: 12, latestPostedAt: "2026-03-31T12:00:00.000Z" },
    { entryCount: 12, latestPostedAt: "2026-04-05T09:00:00.000Z" }
  );

  assert.equal(result.status, "stale");
});

test("新鲜度：老快照没有溯源信息 → unknown，不能当成没过期", () => {
  // 给一份来路不明的报表打绿勾，比说「不知道」危险得多。
  const current = { entryCount: 12, latestPostedAt: "2026-03-31T12:00:00.000Z" };

  assert.equal(evaluateSnapshotFreshness(null, current).status, "unknown");
  assert.equal(evaluateSnapshotFreshness(undefined, current).status, "unknown");
  assert.equal(
    evaluateSnapshotFreshness({ entryCount: undefined, latestPostedAt: null }, current).status,
    "unknown"
  );
});

test("新鲜度：条数为 0 是有效记录，不是缺失", () => {
  // 0 与 null 语义不同：本期确实没有分录的空报表，也该能判定为最新。
  const result = evaluateSnapshotFreshness(
    { entryCount: 0, latestPostedAt: null },
    { entryCount: 0, latestPostedAt: null }
  );

  assert.deepEqual(result, { status: "fresh" });
});

test("新鲜度：空快照之后来了第一笔分录 → stale", () => {
  const result = evaluateSnapshotFreshness(
    { entryCount: 0, latestPostedAt: null },
    { entryCount: 1, latestPostedAt: "2026-04-01T00:00:00.000Z" }
  );

  assert.equal(result.status, "stale");
});
