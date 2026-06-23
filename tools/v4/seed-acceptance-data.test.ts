import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildDepartmentNameById,
  countSeedContracts,
  resolveCanonicalContractScenario,
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

  const contracts = scenarios.map((scenario) => resolveSeedContractId(scenario, scenarios));

  assert.deepEqual(contracts, [
    "CON-STD-001-contract",
    "CON-MISSING-001-contract",
    "CON-STD-001-contract",
    "CON-TIME-001-contract"
  ]);
  assert.equal(countSeedContracts(scenarios), 3);
});

test("duplicate contract fixtures require a referenced canonical scenario", () => {
  const canonical = {
    id: "CON-STD-001",
    kind: "contract_revenue",
    input: {
      companyId: "cmp-v4-service",
      contractNo: "V4-CON-0001"
    },
    expected: {
      amount: 120000,
      documentTypes: ["service_contract"],
      accounting: "ok",
      tax: "ok",
      exceptions: [],
      risks: [],
      requiresFinalAuthorization: true
    }
  } satisfies ScenarioFixture;

  const duplicate = {
    id: "CON-DUP-999",
    kind: "contract_revenue",
    input: {
      companyId: "cmp-v4-service",
      contractNo: "V4-CON-0001",
      duplicateOf: "CON-MISSING"
    },
    expected: canonical.expected
  } satisfies ScenarioFixture;

  assert.throws(
    () => resolveCanonicalContractScenario(duplicate, [canonical]),
    /references missing canonical scenario CON-MISSING/
  );
});

test("duplicate contract fixtures reject self-referential canonical references", () => {
  const duplicate = {
    id: "CON-DUP-SELF",
    kind: "contract_revenue",
    input: {
      companyId: "cmp-v4-service",
      contractNo: "V4-CON-0001",
      duplicateOf: "CON-DUP-SELF"
    },
    expected: {
      amount: 120000,
      documentTypes: ["service_contract"],
      accounting: "ok",
      tax: "ok",
      exceptions: [],
      risks: [],
      requiresFinalAuthorization: true
    }
  } satisfies ScenarioFixture;

  assert.throws(
    () => resolveCanonicalContractScenario(duplicate, [duplicate]),
    /must not reference itself via duplicateOf/
  );
});

test("duplicate contract fixtures require the referenced scenario to be contract revenue", () => {
  const nonContract = {
    id: "PUR-STD-001",
    kind: "purchase_expense",
    input: {
      companyId: "cmp-v4-service",
      contractNo: "V4-CON-0001"
    },
    expected: {
      amount: 100,
      documentTypes: ["expense_claim"],
      accounting: "ok",
      tax: "ok",
      exceptions: [],
      risks: [],
      requiresFinalAuthorization: false
    }
  } satisfies ScenarioFixture;

  const duplicate = {
    id: "CON-DUP-001",
    kind: "contract_revenue",
    input: {
      companyId: "cmp-v4-service",
      contractNo: "V4-CON-0001",
      duplicateOf: "PUR-STD-001"
    },
    expected: {
      amount: 120000,
      documentTypes: ["service_contract"],
      accounting: "ok",
      tax: "ok",
      exceptions: [],
      risks: [],
      requiresFinalAuthorization: true
    }
  } satisfies ScenarioFixture;

  assert.throws(
    () => resolveCanonicalContractScenario(duplicate, [nonContract, duplicate]),
    /must reference a contract_revenue scenario/
  );
});

test("duplicate contract fixtures require matching companyId and contractNo", () => {
  const canonical = {
    id: "CON-STD-001",
    kind: "contract_revenue",
    input: {
      companyId: "cmp-v4-service",
      contractNo: "V4-CON-0001"
    },
    expected: {
      amount: 120000,
      documentTypes: ["service_contract"],
      accounting: "ok",
      tax: "ok",
      exceptions: [],
      risks: [],
      requiresFinalAuthorization: true
    }
  } satisfies ScenarioFixture;

  const mismatchedCompanyDuplicate = {
    id: "CON-DUP-COMPANY",
    kind: "contract_revenue",
    input: {
      companyId: "cmp-v4-tech",
      contractNo: "V4-CON-0001",
      duplicateOf: "CON-STD-001"
    },
    expected: canonical.expected
  } satisfies ScenarioFixture;

  const mismatchedContractDuplicate = {
    id: "CON-DUP-CONTRACT",
    kind: "contract_revenue",
    input: {
      companyId: "cmp-v4-service",
      contractNo: "V4-CON-9999",
      duplicateOf: "CON-STD-001"
    },
    expected: canonical.expected
  } satisfies ScenarioFixture;

  assert.throws(
    () => resolveCanonicalContractScenario(mismatchedCompanyDuplicate, [canonical]),
    /must match canonical companyId cmp-v4-service/
  );
  assert.throws(
    () => resolveCanonicalContractScenario(mismatchedContractDuplicate, [canonical]),
    /must match canonical contractNo V4-CON-0001/
  );
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
