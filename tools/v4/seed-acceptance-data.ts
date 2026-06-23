import pg from "pg";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeTestDatabase } from "./reset-test-db.ts";
import {
  type OrganizationFixture,
  validateOrganizationFixture,
  validateScenarioFixture,
  validateUserFixture,
  type ScenarioFixture,
  type UserFixture
} from "./fixture-schema.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(repoRoot, "tests/fixtures/v4");
const testPassword = "V4-test-123456";

interface SeedCounts {
  companies: number;
  departments: number;
  roles: number;
  users: number;
  passwords: number;
  userRoles: number;
  scenarios: number;
  contracts: number;
  documentMappings: number;
  taxMappings: number;
}

async function readJson<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(resolve(fixtureRoot, fileName), "utf8")) as T;
}

function requireNonEmptyArray<T>(value: unknown, fileName: string): asserts value is T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fileName} must contain a non-empty JSON array`);
  }
}

async function loadFixtures() {
  const organization = await readJson<unknown>("companies.json");
  validateOrganizationFixture(organization);
  const users = await readJson<unknown>("users.json");
  requireNonEmptyArray<UserFixture>(users, "users.json");
  users.forEach(validateUserFixture);

  const scenarioFiles = [
    "purchase-expense.json",
    "travel-expense.json",
    "contract-revenue.json"
  ];
  const scenarios: ScenarioFixture[] = [];
  for (const fileName of scenarioFiles) {
    const contents = await readJson<unknown>(fileName);
    requireNonEmptyArray<unknown>(contents, fileName);
    for (const fixture of contents) {
      validateScenarioFixture(fixture);
      scenarios.push(fixture);
    }
  }

  return { organization, users, scenarios };
}

function roleId(companyId: string, roleCode: string): string {
  return `${companyId.replace(/^cmp-/, "role-")}-${roleCode.replace(/^role-/, "")}`;
}

function eventStatus(fixture: ScenarioFixture): string {
  if (fixture.expected.exceptions.length > 0 || fixture.expected.risks.length > 0) {
    return "needs_review";
  }
  return fixture.expected.requiresFinalAuthorization ? "pending_authorization" : "ready";
}

export function buildDepartmentNameById(organization: OrganizationFixture): Map<string, string> {
  return new Map(
    organization.departments.map((department) => [department.id, department.name] as const)
  );
}

function readFixtureString(
  fixture: ScenarioFixture,
  fieldName: "companyId" | "contractNo"
): string {
  const value = fixture.input[fieldName];
  return typeof value === "string" ? value : "";
}

export function resolveCanonicalContractScenario(
  fixture: ScenarioFixture,
  scenarios: readonly ScenarioFixture[]
): ScenarioFixture | null {
  if (fixture.kind !== "contract_revenue") {
    return null;
  }

  const duplicateOf = fixture.input.duplicateOf;
  if (typeof duplicateOf !== "string" || duplicateOf.trim() === "") {
    return fixture;
  }

  const canonical = scenarios.find((scenario) => scenario.id === duplicateOf);
  if (!canonical) {
    throw new Error(
      `Duplicate contract fixture ${fixture.id} references missing canonical scenario ${duplicateOf}`
    );
  }
  if (canonical.kind !== "contract_revenue") {
    throw new Error(
      `Duplicate contract fixture ${fixture.id} must reference a contract_revenue scenario, received ${canonical.kind}`
    );
  }

  const fixtureCompanyId = readFixtureString(fixture, "companyId");
  const canonicalCompanyId = readFixtureString(canonical, "companyId");
  if (fixtureCompanyId !== canonicalCompanyId) {
    throw new Error(
      `Duplicate contract fixture ${fixture.id} must match canonical companyId ${canonicalCompanyId}`
    );
  }

  const fixtureContractNo = readFixtureString(fixture, "contractNo");
  const canonicalContractNo = readFixtureString(canonical, "contractNo");
  if (fixtureContractNo !== canonicalContractNo) {
    throw new Error(
      `Duplicate contract fixture ${fixture.id} must match canonical contractNo ${canonicalContractNo}`
    );
  }

  return canonical;
}

export function resolveSeedContractId(
  fixture: ScenarioFixture,
  scenarios: readonly ScenarioFixture[]
): string | null {
  const canonical = resolveCanonicalContractScenario(fixture, scenarios);
  return canonical ? `${canonical.id}-contract` : null;
}

export function countSeedContracts(scenarios: readonly ScenarioFixture[]): number {
  return new Set(
    scenarios
      .map((scenario) => resolveSeedContractId(scenario, scenarios))
      .filter((contractId): contractId is string => contractId !== null)
  ).size;
}

export async function seedAcceptanceData(databaseUrl: string): Promise<SeedCounts> {
  assertSafeTestDatabase(databaseUrl);
  const { organization, users, scenarios } = await loadFixtures();
  const companies = [organization.group, ...organization.subsidiaries];
  const departmentNames = buildDepartmentNameById(organization);
  const uniqueRoles = new Map<string, { id: string; companyId: string; code: string; name: string }>();

  for (const user of users) {
    const key = `${user.companyId}:${user.roleCode}`;
    if (!uniqueRoles.has(key)) {
      uniqueRoles.set(key, {
        id: roleId(user.companyId, user.roleCode),
        companyId: user.companyId,
        code: user.roleCode,
        name: `V4 ${user.role}`
      });
    }
  }

  const counts: SeedCounts = {
    companies: companies.length,
    departments: organization.departments.length,
    roles: uniqueRoles.size,
    users: users.length,
    passwords: users.length,
    userRoles: users.length,
    scenarios: scenarios.length,
    contracts: countSeedContracts(scenarios),
    documentMappings: scenarios.reduce(
      (total, fixture) => total + fixture.expected.documentTypes.length,
      0
    ),
    taxMappings: scenarios.length
  };

  const pool = new pg.Pool({ connectionString: databaseUrl });
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    for (const company of companies) {
      await client.query(
        `INSERT INTO companies (id, name, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()`,
        [company.id, company.name]
      );
    }

    for (const department of organization.departments) {
      await client.query(
        `INSERT INTO departments (id, company_id, parent_department_id, name, leader_user_id)
         VALUES ($1, $2, NULL, $3, NULL)
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             parent_department_id = EXCLUDED.parent_department_id,
             name = EXCLUDED.name,
             updated_at = now()`,
        [department.id, department.companyId, department.name]
      );
    }

    for (const role of uniqueRoles.values()) {
      await client.query(
        `INSERT INTO roles (id, company_id, code, name, description)
         VALUES ($1, $2, $3, $4, 'V4 deterministic acceptance role')
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             code = EXCLUDED.code,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             updated_at = now()`,
        [role.id, role.companyId, role.code, role.name]
      );
    }

    for (const user of users) {
      await client.query(
        `INSERT INTO users (
           id, company_id, department_id, username, display_name, email, phone, status
         ) VALUES ($1, $2, $3, $4, $5, $6, NULL, 'active')
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             department_id = EXCLUDED.department_id,
             username = EXCLUDED.username,
             display_name = EXCLUDED.display_name,
             email = EXCLUDED.email,
             status = EXCLUDED.status,
             updated_at = now()`,
        [
          user.id,
          user.companyId,
          user.departmentId,
          user.username,
          user.displayName,
          `${user.username}@v4.test`
        ]
      );
      // The current login implementation compares this column directly with the request password.
      await client.query(
        `INSERT INTO user_passwords (user_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
        [user.id, testPassword]
      );

      const assignedRoleId = roleId(user.companyId, user.roleCode);
      await client.query(
        "DELETE FROM user_roles WHERE user_id = $1 AND role_id <> $2",
        [user.id, assignedRoleId]
      );
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
        [user.id, assignedRoleId]
      );
    }

    for (const department of organization.departments) {
      await client.query(
        `UPDATE departments
         SET leader_user_id = $2, updated_at = now()
         WHERE id = $1`,
        [department.id, department.leaderUserId]
      );
    }

    for (const fixture of scenarios) {
      const input = fixture.input;
      const companyId = String(input.companyId);
      const ownerId = String(input.employeeId);
      const departmentId = String(input.departmentId);
      const departmentName = departmentNames.get(departmentId);
      if (!departmentName) {
        throw new Error(`Unknown departmentId in fixture ${fixture.id}: ${departmentId}`);
      }
      const occurredOn = String(input.occurredOn);
      const title = String(input.title);
      const canonicalContractFixture = resolveCanonicalContractScenario(fixture, scenarios);
      const contractId = canonicalContractFixture ? `${canonicalContractFixture.id}-contract` : null;

      if (
        fixture.kind === "contract_revenue" &&
        canonicalContractFixture?.id === fixture.id
      ) {
        await client.query(
          `INSERT INTO contracts (
             id, company_id, contract_no, contract_type, title, counterparty_name,
             counterparty_type, amount, currency, signed_date, status, notes,
             created_by_user_id, created_by_name
           ) VALUES (
             $1, $2, $3, 'service', $4, 'V4 验收客户', 'external',
             $5, 'CNY', $6::date, 'active', $7, $8, 'V4 acceptance seed'
           )
           ON CONFLICT (id) DO UPDATE
           SET company_id = EXCLUDED.company_id,
               contract_no = EXCLUDED.contract_no,
               title = EXCLUDED.title,
               amount = EXCLUDED.amount,
               signed_date = EXCLUDED.signed_date,
               notes = EXCLUDED.notes,
               updated_at = now()`,
          [
            contractId,
            companyId,
            String(input.contractNo),
            title,
            fixture.expected.amount,
            occurredOn,
            JSON.stringify(fixture.expected),
            ownerId
          ]
        );
      }

      await client.query(
        `INSERT INTO business_events (
           id, company_id, type, title, description, department, owner_id,
           occurred_on, amount, currency, status, source, contract_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::date, $9, 'CNY', $10,
           'v4_acceptance_fixture', $11
         )
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             type = EXCLUDED.type,
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             department = EXCLUDED.department,
             owner_id = EXCLUDED.owner_id,
             occurred_on = EXCLUDED.occurred_on,
             amount = EXCLUDED.amount,
             status = EXCLUDED.status,
             source = EXCLUDED.source,
             contract_id = EXCLUDED.contract_id,
             updated_at = now()`,
        [
          fixture.id,
          companyId,
          fixture.kind,
          title,
          JSON.stringify({ input: fixture.input, expected: fixture.expected }),
          departmentName,
          ownerId,
          occurredOn,
          fixture.expected.amount,
          eventStatus(fixture),
          contractId
        ]
      );

      const provided = new Set(
        Array.isArray(input.providedDocumentTypes)
          ? input.providedDocumentTypes.map(String)
          : []
      );
      for (const [index, documentType] of fixture.expected.documentTypes.entries()) {
        await client.query(
          `INSERT INTO event_document_mappings (
             id, company_id, business_event_id, document_type, title,
             status, owner_department, notes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE
           SET company_id = EXCLUDED.company_id,
               business_event_id = EXCLUDED.business_event_id,
               document_type = EXCLUDED.document_type,
               title = EXCLUDED.title,
               status = EXCLUDED.status,
               owner_department = EXCLUDED.owner_department,
               notes = EXCLUDED.notes`,
          [
            `${fixture.id}-doc-${index + 1}`,
            companyId,
            fixture.id,
            documentType,
            `${fixture.id} ${documentType}`,
            provided.has(documentType) ? "provided" : "missing",
            departmentName,
            "V4 deterministic acceptance document expectation"
          ]
        );
      }

      await client.query(
        `INSERT INTO event_tax_mappings (
           id, company_id, business_event_id, tax_type, treatment,
           status, basis, filing_period
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
         SET company_id = EXCLUDED.company_id,
             business_event_id = EXCLUDED.business_event_id,
             tax_type = EXCLUDED.tax_type,
             treatment = EXCLUDED.treatment,
             status = EXCLUDED.status,
             basis = EXCLUDED.basis,
             filing_period = EXCLUDED.filing_period`,
        [
          `${fixture.id}-tax`,
          companyId,
          fixture.id,
          fixture.kind === "contract_revenue" ? "vat_output" : "vat_input",
          fixture.expected.tax,
          fixture.expected.exceptions.length > 0 ? "review_required" : "expected",
          JSON.stringify({
            accounting: fixture.expected.accounting,
            risks: fixture.expected.risks,
            requiresFinalAuthorization: fixture.expected.requiresFinalAuthorization
          }),
          occurredOn.slice(0, 7)
        ]
      );
    }

    await client.query("COMMIT");
    return counts;
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

async function main() {
  const databaseUrl = process.env.V4_TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("V4_TEST_DATABASE_URL is required");
  }
  const counts = await seedAcceptanceData(databaseUrl);
  console.log(`seeded V4 acceptance data: ${JSON.stringify(counts)}`);
}

const entryPath = process.argv[1];
if (
  entryPath &&
  realpathSync(resolve(entryPath)) === realpathSync(fileURLToPath(import.meta.url))
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
