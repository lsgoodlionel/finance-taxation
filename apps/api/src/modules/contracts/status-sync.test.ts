import test from "node:test";
import assert from "node:assert/strict";
import { getContractCloseEventStatus } from "./status-sync.js";

test("getContractCloseEventStatus maps fulfilled contracts to archived events", () => {
  assert.equal(getContractCloseEventStatus("fulfilled"), "archived");
});

test("getContractCloseEventStatus maps terminated contracts to blocked events", () => {
  assert.equal(getContractCloseEventStatus("terminated"), "blocked");
});
