import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { createRouter } from "./router.js";
import { dispatch } from "./dispatch.js";
import type { ApiRequest } from "../types.js";

/** Minimal ServerResponse stub capturing status + body written by json(). */
function fakeRes(): { res: ServerResponse; status: () => number; body: () => string } {
  let statusCode = 0;
  let payload = "";
  const res = {
    writeHead(code: number) {
      statusCode = code;
      return res;
    },
    end(chunk?: string) {
      if (chunk) payload = chunk;
      return res;
    }
  } as unknown as ServerResponse;
  return { res, status: () => statusCode, body: () => payload };
}

function fakeReq(method: string, url: string, body: unknown): ApiRequest {
  return { method, url, body, headers: {} } as unknown as ApiRequest;
}

function routerWithSchema() {
  const r = createRouter();
  let handled = false;
  r.register({
    method: "POST",
    path: "/t",
    bodySchema: { name: { type: "string", required: true, min: 1 } },
    handler: () => {
      handled = true;
    }
  });
  return { r, wasHandled: () => handled };
}

test("dispatch rejects a POST whose body fails the schema (400, handler skipped)", async () => {
  const { r, wasHandled } = routerWithSchema();
  const { res, status, body } = fakeRes();
  const done = await dispatch(r, fakeReq("POST", "/t", {}), res, "/t");
  assert.equal(done, true);
  assert.equal(status(), 400);
  assert.equal(wasHandled(), false);
  assert.match(body(), /校验失败/);
});

test("dispatch runs the handler when the body satisfies the schema", async () => {
  const { r, wasHandled } = routerWithSchema();
  const { res, status } = fakeRes();
  await dispatch(r, fakeReq("POST", "/t", { name: "ok" }), res, "/t");
  assert.equal(wasHandled(), true);
  assert.equal(status(), 0); // handler stub never wrote a response
});
