import test from "node:test";
import assert from "node:assert/strict";
import { resolveActiveTaxpayerProfile } from "./profile.js";

test("resolveActiveTaxpayerProfile prefers latest active profile", () => {
  const profile = resolveActiveTaxpayerProfile(
    [
      {
        id: "tp-1",
        companyId: "cmp-1",
        taxpayerType: "small_scale",
        effectiveFrom: "2026-01-01",
        status: "inactive",
        notes: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "tp-2",
        companyId: "cmp-1",
        taxpayerType: "general_vat",
        effectiveFrom: "2026-05-01",
        status: "active",
        notes: "",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ],
    "2026-05-15"
  );

  assert.equal(profile?.taxpayerType, "general_vat");
});
