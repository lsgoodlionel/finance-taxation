import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildDepartmentNameById,
  countSeedContracts,
  resolveSeedContractId
} from "./seed-acceptance-data.ts";
import {
  validateOrganizationFixture,
  validateScenarioFixture,
  type OrganizationFixture,
  type ScenarioFixture
} from "./fixture-schema.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readFixture<T>(fileName: string): Promise<T> {
  return JSON.parse(
    await readFile(resolve(repoRoot, "tests/fixtures/v4", fileName), "utf8")
  ) as T;
}

test("importing seed-acceptance-data does not execute the CLI entrypoint", async () => {
  const moduleUrl = new URL(
    `./seed-acceptance-data.ts?entrypoint-guard=${Date.now()}`,
    pathToFileURL(resolve(repoRoot, "tools/v4/seed-acceptance-data.ts"))
  );

  await assert.doesNotReject(() => import(moduleUrl.href));
});

test("department lookup resolves fixture department ids to persisted names", async () => {
  const organization = await readFixture<OrganizationFixture>("companies.json");
  validateOrganizationFixture(organization);

  const departmentNames = buildDepartmentNameById(organization);

  assert.equal(departmentNames.get("dept-v4-sales"), "销售部");
  assert.equal(departmentNames.get("dept-v4-finance"), "财务部");
  assert.equal(departmentNames.get("dept-v4-hr"), "人力资源部");
});

test("duplicate contract fixtures reuse the standard contract seed id", async () => {
  const scenarios = await readFixture<ScenarioFixture[]>("contract-revenue.json");
  for (const scenario of scenarios) {
    validateScenarioFixture(scenario);
  }

  const contracts = scenarios.map((scenario) => resolveSeedContractId(scenario));

  assert.deepEqual(contracts, [
    "CON-STD-001-contract",
    "CON-MISSING-001-contract",
    "CON-STD-001-contract",
    "CON-TIME-001-contract"
  ]);
  assert.equal(countSeedContracts(scenarios), 3);
});

test("distinct V4 persona role codes map to the intended permission differences", async () => {
  const { hasPermission } = await import(
    pathToFileURL(resolve(repoRoot, "apps/api/src/middleware/auth.ts")).href
  );

  assert.equal(hasPermission(["role-employee"], "events.create"), true);
  assert.equal(hasPermission(["role-cashier"], "events.create"), false);
  assert.equal(hasPermission(["role-tax-specialist"], "tax.manage"), true);
  assert.equal(hasPermission(["role-auditor"], "audit.view"), true);
  assert.equal(hasPermission(["role-auditor"], "documents.manage"), false);
});
