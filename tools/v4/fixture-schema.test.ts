import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateOrganizationFixture,
  validateScenarioFixture,
  validateUserFixture
} from "./fixture-schema.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureFiles = [
  "purchase-expense.json",
  "travel-expense.json",
  "contract-revenue.json"
] as const;

function validFixture() {
  return {
    id: "PUR-STD-001",
    kind: "purchase_expense",
    input: {
      title: "临时购买办公显示器",
      amount: 1280
    },
    expected: {
      amount: 1280,
      documentTypes: ["expense_claim", "invoice_bundle"],
      accounting: "借：低值易耗品；贷：其他应付款",
      tax: "取得合规增值税专用发票后认证抵扣",
      exceptions: [],
      risks: [],
      requiresFinalAuthorization: false
    }
  };
}

test("accepts a complete scenario", () => {
  assert.doesNotThrow(() => validateScenarioFixture(validFixture()));
});

test("rejects an unsupported scenario kind with a clear error", () => {
  const fixture = validFixture();
  assert.throws(
    () => validateScenarioFixture({ ...fixture, kind: "payroll" }),
    /fixture\.kind must be one of purchase_expense, travel_expense, contract_revenue/
  );
});

test("rejects an empty expected document type list with a clear error", () => {
  const fixture = validFixture();
  assert.throws(
    () =>
      validateScenarioFixture({
        ...fixture,
        expected: { ...fixture.expected, documentTypes: [] }
      }),
    /expected\.documentTypes must contain at least one document type/
  );
});

test("rejects a non-positive expected amount with a clear error", () => {
  const fixture = validFixture();
  assert.throws(
    () =>
      validateScenarioFixture({
        ...fixture,
        expected: { ...fixture.expected, amount: 0 }
      }),
    /expected\.amount must be a positive number/
  );
});

test("requires fixture id and input", () => {
  const fixture = validFixture();
  assert.throws(() => validateScenarioFixture({ ...fixture, id: "" }), /fixture\.id is required/);
  assert.throws(
    () => validateScenarioFixture({ ...fixture, input: undefined }),
    /fixture\.input must be an object/
  );
});

test("requires explicit accounting, tax, risk, exception, and authorization expectations", () => {
  const fixture = validFixture();
  const requiredFields = [
    "accounting",
    "tax",
    "exceptions",
    "risks",
    "requiresFinalAuthorization"
  ] as const;

  for (const field of requiredFields) {
    const expected = { ...fixture.expected } as Record<string, unknown>;
    delete expected[field];
    assert.throws(
      () => validateScenarioFixture({ ...fixture, expected }),
      new RegExp(`expected\\.${field}`)
    );
  }
});

test("companies.json contains the stable group, subsidiaries, and valid departments", async () => {
  const raw = await readFile(resolve(repoRoot, "tests/fixtures/v4/companies.json"), "utf8");
  const organization: unknown = JSON.parse(raw);

  validateOrganizationFixture(organization);
  assert.equal(organization.group.id, "cmp-v4-group");
  assert.deepEqual(
    organization.subsidiaries.map((company) => company.id),
    ["cmp-v4-tech", "cmp-v4-service"]
  );
  assert.equal(organization.departments.length, 4);
});

test("users.json contains seven valid stable acceptance users", async () => {
  const raw = await readFile(resolve(repoRoot, "tests/fixtures/v4/users.json"), "utf8");
  const users: unknown = JSON.parse(raw);

  assert.ok(Array.isArray(users), "users.json must contain a JSON array");
  assert.equal(users.length, 7);
  for (const user of users) {
    validateUserFixture(user);
  }
  assert.deepEqual(
    users.map((user) => user.id),
    [
      "usr-v4-chairman",
      "usr-v4-employee",
      "usr-v4-manager",
      "usr-v4-accountant",
      "usr-v4-cashier",
      "usr-v4-tax",
      "usr-v4-auditor"
    ]
  );
  assert.deepEqual(
    users.map((user) => [user.role, user.roleCode]),
    [
      ["chairman", "role-chairman"],
      ["employee", "role-employee"],
      ["manager", "role-finance-director"],
      ["accountant", "role-accountant"],
      ["cashier", "role-cashier"],
      ["tax", "role-tax-specialist"],
      ["auditor", "role-auditor"]
    ]
  );
});

for (const fixtureFile of fixtureFiles) {
  test(`${fixtureFile} is an array of four valid scenarios`, async () => {
    const raw = await readFile(resolve(repoRoot, "tests/fixtures/v4", fixtureFile), "utf8");
    const fixtures: unknown = JSON.parse(raw);

    assert.ok(Array.isArray(fixtures), `${fixtureFile} must contain a JSON array`);
    assert.equal(fixtures.length, 4, `${fixtureFile} must contain exactly four scenarios`);
    for (const fixture of fixtures) {
      validateScenarioFixture(fixture);
    }
  });
}
