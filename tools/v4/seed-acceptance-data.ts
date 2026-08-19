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
  /** V13-A：费控地基的种子。计数进 SeedCounts 是为了让「播了没播」在
   *  seed 的输出里一眼看得见——「后端有能力、没数据」在 V12 里出现过五次。 */
  budgets: number;
  expenseStandards: number;
  /** V13-B：成本中心。V12-D1 做了这个能力，但种子库里一条都没有——
   *  于是费用分摊、部门费用报表在种子账上全是空的。写报销集成测试时发现。 */
  costCenters: number;
  /** V14-A：银企配置。播一条演示适配器的，让「系统设置 → 银企直连」
   *  打开不是空页——空页会被读成「这功能没做」。 */
  bankConnectConfigs: number;
  /** V14-B：审批流。**V13 做完审批流一条种子都没播**——配置页打开是空的，
   *  而任何单据提交都会撞 FLOW_NOT_FOUND。「后端有能力、没数据」第七次。 */
  approvalFlows: number;
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
  if (duplicateOf === fixture.id) {
    throw new Error(
      `Duplicate contract fixture ${fixture.id} must not reference itself via duplicateOf`
    );
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

  /**
 * 种子预算的期间：2026-04。
 *
 * **刻意与种子账的业务期间对齐**（种子分录集中在 2026-01/02/04）——预算落在
 * 没有任何分录的月份，打开预算中心看到的就是一排「已发生 0.00」，
 * 那等于没验证取数口径通不通，与不播种没有区别。
 */
const SEED_BUDGET_PERIOD = "2026-04";

/** 费用标准的生效起日：设在账套期间之前，让整个种子期间都被标准覆盖。 */
const SEED_STANDARD_EFFECTIVE_FROM = "2026-01-01";

/**
 * V13-A 费控地基的种子。
 *
 * 每个公司播两条预算（一条带科目与部门、一条全公司总额）与两条费用标准
 * （一条通用、一条按职级），覆盖「维度为 null」与「维度有值」两种形态——
 * 只播全 null 的那种，`coalesce` 唯一索引与最具体匹配都测不出来。
 */
const SEED_BUDGETS = [
  {
    suffix: "travel",
    periodType: "month",
    periodKey: SEED_BUDGET_PERIOD,
    accountCode: "660203",
    amountCents: 500000,
    controlPolicy: "warn",
    note: "差旅费月度预算（V13 种子）"
  },
  {
    suffix: "company",
    periodType: "year",
    periodKey: SEED_BUDGET_PERIOD.slice(0, 4),
    accountCode: null,
    amountCents: 20000000,
    controlPolicy: "warn",
    note: "全公司年度总额预算（V13 种子）"
  }
] as const;

/**
 * 成本中心（V12-D1 的能力，V13-B 补种子）。
 *
 * 没有它，费用分摊在页面上是死的——分摊对象的下拉框空着，而用户看不出
 * 是「功能没做」还是「数据没配」。两个部门够了：分摊至少要两个对象才成立。
 */
//
// **编码带 SEED- 前缀**：`CC-RND` / `CC-SALES` 这类通用编码会与测试自建的
// 成本中心撞车（cost-center.integration.test.ts 用的正是 CC-SALES），
// 而撞车表现为「新建成本中心」用例报 409——从那句话看不出是种子的锅。
const SEED_COST_CENTERS = [
  { suffix: "rnd", code: "SEED-RD", name: "研发部" },
  { suffix: "sales", code: "SEED-MK", name: "市场部" }
] as const;

const SEED_STANDARDS = [
  {
    suffix: "hotel-generic",
    expenseType: "travel_hotel",
    gradeCode: null,
    cityTier: null,
    limitCents: 30000,
    limitBasis: "per_day",
    overPolicy: "warn",
    note: "住宿通用标准 300/晚（V13 种子）"
  },
  {
    suffix: "hotel-m2-tier1",
    expenseType: "travel_hotel",
    gradeCode: "M2",
    cityTier: "tier1",
    limitCents: 60000,
    limitBasis: "per_day",
    overPolicy: "escalate",
    note: "M2 一线城市住宿 600/晚，超标加签（V13 种子）"
  }
] as const;

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
    taxMappings: scenarios.length,
    budgets: companies.length * SEED_BUDGETS.length,
    expenseStandards: companies.length * SEED_STANDARDS.length,
    costCenters: companies.length * SEED_COST_CENTERS.length,
    // 每家公司一条演示银企配置。与上面几项同样先算后播——
    // 边播边累加会让「播失败了但计数照样涨」成为可能。
    bankConnectConfigs: companies.length,
    approvalFlows: companies.length
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

    // ── V13-A：费控地基 ────────────────────────────────────────────
    //
    // 播种是**护栏的一部分**而不是便利：V12 收口时确认「后端有能力、前端没
    // 入口」出现过五次，四次的读口径测试全绿——因为用例直接往库里塞数据造
    // 场景，而种子库那一列一行都没有。这里播下去，budget.integration.test 之外
    // 的任何人打开页面都能看到真实数据。
    for (const [companyIndex, company] of companies.entries()) {
      for (const costCenter of SEED_COST_CENTERS) {
        await client.query(
          `INSERT INTO cost_centers (id, company_id, code, name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
          [
            `cc-seed-${company.id}-${costCenter.suffix}`,
            company.id,
            costCenter.code,
            costCenter.name
          ]
        );
      }

      for (const budget of SEED_BUDGETS) {
        await client.query(
          `INSERT INTO budgets (id, company_id, period_type, period_key,
                                cost_center_id, account_code, amount_cents, control_policy, note)
           VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE
           SET amount_cents = EXCLUDED.amount_cents,
               control_policy = EXCLUDED.control_policy,
               note = EXCLUDED.note,
               updated_at = now()`,
          [
            `bdg-seed-${company.id}-${budget.suffix}`,
            company.id,
            budget.periodType,
            budget.periodKey,
            budget.accountCode,
            budget.amountCents,
            budget.controlPolicy,
            budget.note
          ]
        );
      }

      // V14-B：每家公司播一条报销审批流，第二级是**会签**。
      //
      // V13 把审批流做完了但一条种子都没播 —— 配置页打开是空的，而任何单据
      // 提交都会撞 FLOW_NOT_FOUND。这是「后端有能力、没数据」的第七次。
      //
      // 步骤全部用角色而不用 manager：manager 步骤要求发起人所在部门设了
      // 负责人，而那是另一份种子的事。种子的用途是「打开就能走通」，
      // 不该依赖另一处配置是否到位。
      const companyRoles = [...uniqueRoles.values()]
        .filter((role) => role.companyId === company.id)
        .sort((a, b) => a.id.localeCompare(b.id));

      if (companyRoles.length > 0) {
        const flowId = `afl-seed-${company.id}`;
        await client.query(
          `INSERT INTO approval_flows (id, company_id, name, document_type, is_active, note)
           VALUES ($1, $2, '报销审批（种子）', 'reimbursement', true,
                   '第一级单人审批，第二级会签演示 V14-B')
           ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, note = EXCLUDED.note, updated_at = now()`,
          [flowId, company.id]
        );
        await client.query("DELETE FROM approval_flow_step_approvers WHERE flow_id = $1", [flowId]);
        await client.query("DELETE FROM approval_flow_steps WHERE flow_id = $1", [flowId]);

        // 第一级：任何金额都要走，单人。
        await client.query(
          `INSERT INTO approval_flow_steps (id, flow_id, step_order, min_amount_cents, mode)
           VALUES ($1, $2, 1, 0, 'all')`,
          [`afs-seed-${company.id}-1`, flowId]
        );
        await client.query(
          `INSERT INTO approval_flow_step_approvers
             (id, flow_id, step_order, approver_type, approver_value, sort_order)
           VALUES ($1, $2, 1, 'role', $3, 1)`,
          [`fsa-seed-${company.id}-1`, flowId, companyRoles[0]!.id]
        );

        // 第二级：5000 元以上会签。只有一个角色的公司退化成单人——
        // **不硬凑两个审批人**：把同一个角色列两遍会让他要批两次，
        // 而他只会看到一条待办，单据永远推不过去。
        const secondLevelRoles = companyRoles.slice(1, 3);
        const coSignRoles = secondLevelRoles.length > 0 ? secondLevelRoles : [companyRoles[0]!];
        await client.query(
          `INSERT INTO approval_flow_steps (id, flow_id, step_order, min_amount_cents, mode)
           VALUES ($1, $2, 2, 500000, 'all')`,
          [`afs-seed-${company.id}-2`, flowId]
        );
        for (const [index, role] of coSignRoles.entries()) {
          await client.query(
            `INSERT INTO approval_flow_step_approvers
               (id, flow_id, step_order, approver_type, approver_value, sort_order)
             VALUES ($1, $2, 2, 'role', $3, $4)`,
            [`fsa-seed-${company.id}-2-${index}`, flowId, role.id, index + 1]
          );
        }
      }

      // V14-A：每家公司播一条演示银企配置。
      //
      // 用 mock 适配器而不是真银行：真银行的 provider 在没有适配器实现时
      // 只能保存不能提交，而种子的用途正是「打开就能走通全流程」。
      await client.query(
        `INSERT INTO bank_connect_configs
           (id, company_id, provider, display_name, payer_account, customer_no, endpoint,
            sign_algorithm, cert_ref, cert_fingerprint, cert_expires_on, enabled, note)
         VALUES ($1, $2, 'mock', '演示付款账户', $3, 'DEMO-CUST-001',
                 'https://bank.example.com/api', 'RSA', '/certs/demo.pfx',
                 'DE:MO:00:01', '2030-12-31'::date, true,
                 '演示适配器，不连真实银行。接入真实银行后新建配置即可。')
         ON CONFLICT (company_id, payer_account) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             enabled = EXCLUDED.enabled,
             updated_at = now()`,
        [
          `bkc-seed-${company.id}`,
          company.id,
          // 账号按序号编，**不能从 company.id 里截**——公司 id 是
          // `cmp-v4-tech` 这样的文本，截出来的「账号」里会有字母，
          // 而银行账号是纯数字。看起来像真的比明显是假的更麻烦。
          `62220000000${String(companyIndex + 1).padStart(5, "0")}`
        ]
      );

      for (const standard of SEED_STANDARDS) {
        await client.query(
          `INSERT INTO expense_standards (id, company_id, expense_type, grade_code, city_tier,
                                          limit_cents, limit_basis, over_policy,
                                          effective_from, effective_to, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10)
           ON CONFLICT (id) DO UPDATE
           SET limit_cents = EXCLUDED.limit_cents,
               over_policy = EXCLUDED.over_policy,
               note = EXCLUDED.note,
               updated_at = now()`,
          [
            `es-seed-${company.id}-${standard.suffix}`,
            company.id,
            standard.expenseType,
            standard.gradeCode,
            standard.cityTier,
            standard.limitCents,
            standard.limitBasis,
            standard.overPolicy,
            SEED_STANDARD_EFFECTIVE_FROM,
            standard.note
          ]
        );
      }
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
