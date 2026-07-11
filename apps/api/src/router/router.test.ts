import { test } from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "./router.js";

function handler() {
  return undefined;
}

test("matches an exact path with no params", () => {
  const router = createRouter();
  router.register({ method: "GET", path: "/api/tasks", handler });
  const hit = router.match("GET", "/api/tasks");
  assert.ok(hit);
  assert.deepEqual(hit.params, {});
});

test("returns null when the path is unknown", () => {
  const router = createRouter();
  router.register({ method: "GET", path: "/api/tasks", handler });
  assert.equal(router.match("GET", "/api/unknown"), null);
});

test("distinguishes methods on the same path", () => {
  const router = createRouter();
  const get = { method: "GET" as const, path: "/api/events", handler };
  const post = { method: "POST" as const, path: "/api/events", handler };
  router.register(get);
  router.register(post);
  assert.equal(router.match("POST", "/api/events")?.route, post);
  assert.equal(router.match("GET", "/api/events")?.route, get);
});

test("extracts a single named param", () => {
  const router = createRouter();
  router.register({ method: "GET", path: "/api/events/:id", handler });
  const hit = router.match("GET", "/api/events/evt-42");
  assert.equal(hit?.params.id, "evt-42");
});

test("extracts multiple named params", () => {
  const router = createRouter();
  router.register({ method: "GET", path: "/api/a/:x/b/:y", handler });
  const hit = router.match("GET", "/api/a/one/b/two");
  assert.deepEqual(hit?.params, { x: "one", y: "two" });
});

test("a param segment does not match across a slash", () => {
  const router = createRouter();
  router.register({ method: "GET", path: "/api/events/:id", handler });
  assert.equal(router.match("GET", "/api/events/evt-42/analyze"), null);
});

test("respects registration order for overlapping patterns", () => {
  const router = createRouter();
  const analyze = { method: "POST" as const, path: "/api/events/:id/analyze", handler };
  const detail = { method: "PUT" as const, path: "/api/events/:id", handler };
  router.register(analyze);
  router.register(detail);
  // Specific route registered first still wins for its own shape.
  assert.equal(router.match("POST", "/api/events/x/analyze")?.route, analyze);
  assert.equal(router.match("PUT", "/api/events/x")?.route, detail);
});

test("decodes percent-encoded param values", () => {
  const router = createRouter();
  router.register({ method: "GET", path: "/api/docs/:name", handler });
  assert.equal(router.match("GET", "/api/docs/a%2Fb")?.params.name, "a/b");
});

test("exact path does not match a longer path", () => {
  const router = createRouter();
  router.register({ method: "GET", path: "/api/events", handler });
  assert.equal(router.match("GET", "/api/events/123"), null);
});
