# V4 Baseline And E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a clean V4 production-acceptance baseline with deterministic test data, stable test runners, browser E2E coverage, product-design evidence, and CI release gates.

**Architecture:** Preserve existing production behavior except for defects proven by executable contract tests. Add a dedicated V4 test harness around the existing API, PostgreSQL, Docker, and React application. Seed isolated acceptance data through test-only scripts, exercise the application through Playwright, store machine-readable evidence, and feed confirmed defects into the existing feedback module.

**Tech Stack:** TypeScript, Node.js test runner, Playwright, PostgreSQL 17, Docker Compose, React/Vite, GitHub Actions, Product Design audit/ideate/design-qa, Creative Production style exploration.

---

## File Structure

### New files

- `playwright.config.ts` — browser projects, timeouts, screenshots, traces, web server configuration.
- `tests/e2e/fixtures/auth.ts` — role-aware login and authenticated page fixtures.
- `tests/e2e/fixtures/evidence.ts` — evidence metadata and attachment helper.
- `tests/e2e/helpers/api-client.ts` — typed test API helper.
- `tests/e2e/helpers/business-objects.ts` — wait for and assert linked business objects.
- `tests/e2e/smoke/login-and-navigation.spec.ts` — login, navigation, session and entrypoint checks.
- `tests/e2e/smoke/finance-flow-navigation.spec.ts` — finance flow bar and context-preserving navigation.
- `tests/e2e/scenarios/purchase-expense.baseline.spec.ts` — baseline purchase reimbursement journey.
- `tests/e2e/scenarios/travel-expense.baseline.spec.ts` — baseline travel reimbursement journey.
- `tests/e2e/scenarios/contract-revenue.baseline.spec.ts` — baseline contract-to-revenue journey.
- `tests/e2e/accessibility/core-pages.spec.ts` — keyboard, landmarks and accessible-name smoke checks.
- `apps/api/src/modules/tasks/status-contract.test.ts` — prevent API/web task-state drift.
- `tests/fixtures/v4/companies.json` — group, subsidiaries and departments.
- `tests/fixtures/v4/users.json` — chairman, employee, manager, accountant, cashier, tax and auditor.
- `tests/fixtures/v4/purchase-expense.json` — normal and abnormal purchase cases.
- `tests/fixtures/v4/travel-expense.json` — normal and abnormal travel cases.
- `tests/fixtures/v4/contract-revenue.json` — normal and abnormal contract cases.
- `tools/v4/reset-test-db.ts` — recreate and migrate the isolated acceptance database.
- `tools/v4/seed-acceptance-data.ts` — insert deterministic acceptance fixtures.
- `tools/v4/run-web-tests.mjs` — execute existing web tests sequentially and terminate cleanly.
- `tools/v4/generate-acceptance-report.ts` — merge Playwright JSON, API and DB evidence.
- `tools/v4/submit-failures-to-feedback.ts` — create feedback records from confirmed failures.
- `tools/v4/check-plan-artifacts.mjs` — enforce required V4 reports and metadata.
- `docker-compose.test.yml` — isolated PostgreSQL/API/web stack for acceptance.
- `.env.test.example` — test-only environment contract.
- `docs/v4-progress-board.md` — V4 workstream tracking.
- `docs/v4/acceptance-evidence-schema.md` — evidence fields and retention rules.
- `docs/v4/test-data-catalog.md` — fixture IDs and expected results.
- `docs/v4/runbooks/local-acceptance.md` — local execution steps.
- `docs/v4/runbooks/ci-acceptance.md` — CI execution and artifact interpretation.
- `docs/v4/audits/baseline/product-flow-audit.md` — Product Design audit findings.
- `docs/v4/design/visual-direction-brief.md` — approved visual brief and constraints.
- `docs/v4/design/visual-direction-selection.md` — three directions and selected route.

### Modified files

- `package.json` — V4 test and verification commands.
- `apps/api/package.json` — stable test runner command.
- `apps/web/package.json` — explicit web test command.
- `apps/api/src/modules/tasks/routes.ts` — align the verified task status contract.
- `.github/workflows/ci.yml` — Node install, typecheck, unit tests, migration test and Playwright job.
- `.gitignore` — generated Playwright and V4 artifact folders.
- `README.md` — V4 acceptance commands and environment warning.

## Task 1: Protect the baseline and create V4 tracking

**Files:**
- Create: `docs/v4-progress-board.md`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Verify branch and clean worktree**

Run:

```bash
git branch --show-current
git status --short
git rev-parse --short HEAD
```

Expected:

```text
codex/v4-baseline-and-e2e
<no status output>
91e906c
```

- [ ] **Step 2: Add generated artifact exclusions**

Add to `.gitignore`:

```gitignore
# V4 generated acceptance evidence
playwright-report/
test-results/
artifacts/v4/**/browser/
artifacts/v4/**/*.zip
artifacts/v4/**/*.webm
artifacts/v4/**/*.trace
.superpowers/
.DS_Store
```

- [ ] **Step 3: Create the V4 progress board**

Create `docs/v4-progress-board.md`:

```markdown
# V4 进度板

> 目标：真实业务验收与生产可靠性
> 基线：origin/main@91e906c

| Workstream | Branch | Status | Exit Gate |
| --- | --- | --- | --- |
| V4-0 基线与 E2E | codex/v4-baseline-and-e2e | in_progress | CI、测试数据、三条 baseline E2E、设计审计 |
| V4-1 工作流运行时 | codex/v4-workflow-runtime | pending | 状态机、授权、幂等、补偿 |
| V4-1 采购报销 | codex/v4-expense-purchase-slice | pending | 标准/异常路径生产门禁 |
| V4-2 差旅报销 | codex/v4-travel-expense-slice | pending | 标准/异常路径生产门禁 |
| V4-3 合同收入 | codex/v4-contract-revenue-slice | pending | 合同至申报闭环 |
| V4-4 任务与连接器 | codex/v4-job-and-connectors | pending | 重试、沙箱、文件交换 |
| V4-5 安全与运维 | codex/v4-security-operations | pending | 私有云生产认证 |
```

- [ ] **Step 4: Add README warning and commands**

Under local development, add:

```markdown
### V4 验收环境

V4 验收必须使用独立测试数据库，不得连接生产或日常开发数据库。

```bash
npm run v4:test:setup
npm run test:e2e
npm run v4:report
```
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore README.md docs/v4-progress-board.md
git commit -m "docs: establish V4 acceptance baseline"
```

## Task 2: Make unit test execution deterministic

**Files:**
- Create: `tools/v4/run-web-tests.mjs`
- Create: `apps/api/src/modules/tasks/status-contract.test.ts`
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/api/src/modules/tasks/routes.ts`

- [ ] **Step 1: Write the web test runner**

Create `tools/v4/run-web-tests.mjs`:

```js
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function collect(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? collect(path)
      : path.endsWith(".test.ts") || path.endsWith(".test.tsx")
        ? [path]
        : [];
  });
}

const files = collect("apps/web/src").sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ["--import", "tsx", file], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`web tests passed: ${files.length}`);
```

- [ ] **Step 2: Add scripts**

Set root scripts:

```json
{
  "test:api": "npm run -w @finance-taxation/api test:serial",
  "test:web": "node tools/v4/run-web-tests.mjs",
  "test:unit": "npm run test:api && npm run test:web",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "v4:report": "tsx tools/v4/generate-acceptance-report.ts",
  "verify:v4": "npm run typecheck:v2 && npm run test:unit && npm run check:progress"
}
```

Set API scripts:

```json
{
  "test:serial": "tsx --test --test-concurrency=1 src/**/*.test.ts"
}
```

Set web scripts:

```json
{
  "test": "node ../../tools/v4/run-web-tests.mjs"
}
```

- [ ] **Step 3: Write the failing task-status contract test**

Create `apps/api/src/modules/tasks/status-contract.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { VALID_TASK_STATUSES } from "./routes.js";

test("task API uses the same terminal status as the web domain", () => {
  assert.equal(VALID_TASK_STATUSES.has("done"), true);
  assert.equal(VALID_TASK_STATUSES.has("completed"), false);
  assert.equal(VALID_TASK_STATUSES.has("in_review"), true);
});
```

Run:

```bash
./node_modules/.bin/tsx --test apps/api/src/modules/tasks/status-contract.test.ts
```

Expected: FAIL because `VALID_TASK_STATUSES` is not exported and the route still accepts `completed`.

- [ ] **Step 4: Align the task API status contract**

In `apps/api/src/modules/tasks/routes.ts`, replace the legacy status set with:

```ts
export const VALID_TASK_STATUSES = new Set([
  "not_started",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
]);
```

Replace both `VALID_STATUSES` references in the update handler with `VALID_TASK_STATUSES`.

Run:

```bash
./node_modules/.bin/tsx --test apps/api/src/modules/tasks/status-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run API tests with timeout evidence**

Run:

```bash
time npm run test:api
```

Expected:

- All API tests pass.
- Process exits without manual interruption.
- Exit code is `0`.

- [ ] **Step 6: Run web tests**

Run:

```bash
npm run test:web
```

Expected:

```text
web tests passed: <positive number>
```

- [ ] **Step 7: Commit**

```bash
git add package.json apps/api/package.json apps/web/package.json tools/v4/run-web-tests.mjs apps/api/src/modules/tasks/routes.ts apps/api/src/modules/tasks/status-contract.test.ts
git commit -m "test: make V4 unit suites deterministic"
```

## Task 3: Add isolated acceptance database lifecycle

**Files:**
- Create: `docker-compose.test.yml`
- Create: `.env.test.example`
- Create: `tools/v4/reset-test-db.ts`
- Create: `tools/v4/reset-test-db.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing database-name guard test**

Create `tools/v4/reset-test-db.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeTestDatabase } from "./reset-test-db.js";

test("accepts a V4 test database", () => {
  assert.doesNotThrow(() =>
    assertSafeTestDatabase("postgres://u:p@localhost:55433/finance_taxation_v4_test"),
  );
});

test("rejects non-test databases", () => {
  assert.throws(
    () => assertSafeTestDatabase("postgres://u:p@localhost:5432/finance_taxation_v2"),
    /test database/i,
  );
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
./node_modules/.bin/tsx --test tools/v4/reset-test-db.test.ts
```

Expected: FAIL because `reset-test-db.ts` does not exist.

- [ ] **Step 3: Implement the safety guard and lifecycle**

Create `tools/v4/reset-test-db.ts`:

```ts
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function assertSafeTestDatabase(databaseUrl: string): void {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!name.includes("test")) {
    throw new Error(`Refusing to reset non-test database: ${name}`);
  }
}

export async function resetTestDatabase(databaseUrl: string): Promise<void> {
  assertSafeTestDatabase(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.query(`
    CREATE TABLE schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const dir = resolve("migrations");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(resolve(dir, file), "utf8"));
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
        [file],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = process.env.V4_TEST_DATABASE_URL ?? "";
  if (!url) throw new Error("V4_TEST_DATABASE_URL is required");
  await resetTestDatabase(url);
}
```

- [ ] **Step 4: Add the isolated compose stack**

Create `docker-compose.test.yml`. The entire acceptance stack is isolated; it must not reuse ports, volumes, or credentials from the development stack:

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: finance_taxation
      POSTGRES_PASSWORD: finance_taxation
      POSTGRES_DB: finance_taxation_v4_test
    ports:
      - "55433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U finance_taxation -d finance_taxation_v4_test"]
      interval: 2s
      timeout: 2s
      retries: 30

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgres://finance_taxation:finance_taxation@db:5432/finance_taxation_v4_test
      PORT: "3100"
      NODE_ENV: test
      JWT_SECRET: v4-test-only-secret-not-for-production
      ANTHROPIC_API_KEY: ""
    ports:
      - "33100:3100"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 5s
      timeout: 3s
      retries: 30

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "55173:80"
    depends_on:
      api:
        condition: service_healthy

volumes: {}
```

Create `.env.test.example`:

```dotenv
V4_TEST_DATABASE_URL=postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test
V4_BASE_URL=http://127.0.0.1:55173
V4_API_URL=http://127.0.0.1:33100
NODE_ENV=test
```

- [ ] **Step 5: Add setup scripts**

Add root scripts:

```json
{
  "v4:test:db:start": "docker compose -p finance-taxation-v4-test -f docker-compose.test.yml up -d db",
  "v4:test:app:start": "docker compose -p finance-taxation-v4-test -f docker-compose.test.yml up -d --build api web",
  "v4:test:stack:start": "npm run v4:test:db:start && npm run v4:test:app:start",
  "v4:test:stack:stop": "docker compose -p finance-taxation-v4-test -f docker-compose.test.yml down -v",
  "v4:test:db:reset": "tsx tools/v4/reset-test-db.ts",
  "v4:test:setup": "npm run v4:test:db:start && npm run v4:test:db:reset && npm run v4:test:app:start"
}
```

- [ ] **Step 6: Run tests**

```bash
./node_modules/.bin/tsx --test tools/v4/reset-test-db.test.ts
V4_TEST_DATABASE_URL=postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test npm run v4:test:setup
```

Expected:

- Safety tests pass.
- All migrations apply to a clean database.
- `curl -s http://127.0.0.1:33100/api/health` returns `ok: true`.
- `curl -I http://127.0.0.1:55173/` returns `200`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.test.yml .env.test.example package.json tools/v4/reset-test-db.ts tools/v4/reset-test-db.test.ts
git commit -m "test: add isolated V4 database lifecycle"
```

## Task 4: Build deterministic acceptance fixtures

**Files:**
- Create: `tests/fixtures/v4/companies.json`
- Create: `tests/fixtures/v4/users.json`
- Create: `tests/fixtures/v4/purchase-expense.json`
- Create: `tests/fixtures/v4/travel-expense.json`
- Create: `tests/fixtures/v4/contract-revenue.json`
- Create: `tools/v4/fixture-schema.ts`
- Create: `tools/v4/fixture-schema.test.ts`
- Create: `tools/v4/seed-acceptance-data.ts`
- Create: `docs/v4/test-data-catalog.md`
- Modify: `package.json`

- [ ] **Step 1: Define and test fixture validation**

Create `tools/v4/fixture-schema.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { validateScenarioFixture } from "./fixture-schema.js";

test("accepts a complete scenario", () => {
  assert.doesNotThrow(() => validateScenarioFixture({
    id: "PUR-STD-001",
    kind: "purchase_expense",
    expected: { amount: 1280, documentTypes: ["expense_claim", "invoice_bundle"] },
  }));
});

test("rejects a fixture without an expected amount", () => {
  assert.throws(() => validateScenarioFixture({
    id: "PUR-BAD",
    kind: "purchase_expense",
    expected: { documentTypes: [] },
  }), /expected.amount/);
});
```

Create `tools/v4/fixture-schema.ts`:

```ts
export interface ScenarioFixture {
  id: string;
  kind: "purchase_expense" | "travel_expense" | "contract_revenue";
  expected: {
    amount: number;
    documentTypes: string[];
  };
}

export function validateScenarioFixture(value: unknown): asserts value is ScenarioFixture {
  if (!value || typeof value !== "object") throw new Error("fixture must be an object");
  const fixture = value as Partial<ScenarioFixture>;
  if (!fixture.id) throw new Error("fixture.id is required");
  if (!fixture.kind) throw new Error("fixture.kind is required");
  if (typeof fixture.expected?.amount !== "number") throw new Error("expected.amount is required");
  if (!Array.isArray(fixture.expected.documentTypes)) throw new Error("expected.documentTypes is required");
}
```

- [ ] **Step 2: Create stable organization and user IDs**

Use IDs such as:

```json
{
  "group": "cmp-v4-group",
  "subsidiaries": ["cmp-v4-tech", "cmp-v4-service"],
  "departments": ["dept-v4-chairman", "dept-v4-sales", "dept-v4-finance", "dept-v4-hr"]
}
```

Users must include:

```json
[
  { "id": "usr-v4-chairman", "username": "v4_chairman", "role": "chairman" },
  { "id": "usr-v4-employee", "username": "v4_employee", "role": "employee" },
  { "id": "usr-v4-manager", "username": "v4_manager", "role": "manager" },
  { "id": "usr-v4-accountant", "username": "v4_accountant", "role": "accountant" },
  { "id": "usr-v4-cashier", "username": "v4_cashier", "role": "cashier" },
  { "id": "usr-v4-tax", "username": "v4_tax", "role": "tax" },
  { "id": "usr-v4-auditor", "username": "v4_auditor", "role": "auditor" }
]
```

- [ ] **Step 3: Create scenario fixtures**

Each scenario file must contain:

- One standard case.
- One missing-document case.
- One duplicate case.
- One classification or timing conflict.

Example purchase fixture:

```json
{
  "id": "PUR-STD-001",
  "kind": "purchase_expense",
  "input": {
    "employeeId": "usr-v4-employee",
    "departmentId": "dept-v4-sales",
    "title": "临时购买办公显示器",
    "amount": 1280,
    "invoiceNo": "V4-PUR-0001"
  },
  "expected": {
    "amount": 1280,
    "classification": "low_value_consumable",
    "documentTypes": ["expense_claim", "invoice_bundle"],
    "requiresFinalAuthorization": false
  }
}
```

- [ ] **Step 4: Implement idempotent seeding**

`tools/v4/seed-acceptance-data.ts` must:

- Require `V4_TEST_DATABASE_URL`.
- Call `assertSafeTestDatabase`.
- Insert by stable IDs with `ON CONFLICT DO UPDATE`.
- Hash passwords using the same application-compatible format as seed migration.
- Print inserted object counts.

- [ ] **Step 5: Add deterministic seed and setup scripts**

Add these root scripts:

```json
{
  "v4:test:seed": "tsx tools/v4/seed-acceptance-data.ts",
  "v4:test:setup": "npm run v4:test:db:start && npm run v4:test:db:reset && npm run v4:test:seed && npm run v4:test:app:start"
}
```

This replaces the Task 3 version of `v4:test:setup`; the final setup order is database start, schema reset, deterministic seed, then API/web startup.

- [ ] **Step 6: Validate and seed**

```bash
./node_modules/.bin/tsx --test tools/v4/fixture-schema.test.ts
V4_TEST_DATABASE_URL=postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test ./node_modules/.bin/tsx tools/v4/seed-acceptance-data.ts
V4_TEST_DATABASE_URL=postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test npm run v4:test:setup
```

Expected:

- Fixture tests pass.
- Running seed twice produces the same counts and no duplicates.
- The one-command setup starts API/web with the seeded acceptance users and scenarios available.

- [ ] **Step 7: Document the fixture catalog**

`docs/v4/test-data-catalog.md` must map each fixture ID to:

- Business purpose.
- Input files.
- Expected objects.
- Expected accounting and tax result.
- Expected exception or risk.

- [ ] **Step 8: Commit**

```bash
git add package.json tests/fixtures/v4 tools/v4/fixture-schema.ts tools/v4/fixture-schema.test.ts tools/v4/seed-acceptance-data.ts docs/v4/test-data-catalog.md
git commit -m "test: add deterministic V4 acceptance fixtures"
```

## Task 5: Install and configure Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/auth.ts`
- Create: `tests/e2e/fixtures/evidence.ts`
- Create: `tests/e2e/helpers/api-client.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create the Playwright configuration**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "artifacts/v4/baseline/browser/results.json" }],
  ],
  use: {
    baseURL: process.env.V4_BASE_URL ?? "http://127.0.0.1:55173",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet-chromium", use: { ...devices["iPad Pro 11"] } },
  ],
  outputDir: "artifacts/v4/baseline/browser/results",
});
```

- [ ] **Step 3: Create role-aware authentication**

Create `tests/e2e/fixtures/auth.ts`:

```ts
import { test as base, expect, type Page } from "@playwright/test";

export type V4Role =
  | "chairman"
  | "employee"
  | "manager"
  | "accountant"
  | "cashier"
  | "tax"
  | "auditor";

const USERS: Record<V4Role, { username: string; password: string }> = {
  chairman: { username: "v4_chairman", password: "V4-test-123456" },
  employee: { username: "v4_employee", password: "V4-test-123456" },
  manager: { username: "v4_manager", password: "V4-test-123456" },
  accountant: { username: "v4_accountant", password: "V4-test-123456" },
  cashier: { username: "v4_cashier", password: "V4-test-123456" },
  tax: { username: "v4_tax", password: "V4-test-123456" },
  auditor: { username: "v4_auditor", password: "V4-test-123456" },
};

export async function loginAs(page: Page, role: V4Role): Promise<void> {
  await page.goto("/");
  await page.getByLabel("用户名").fill(USERS[role].username);
  await page.getByLabel("密码").fill(USERS[role].password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("AI 财税助手")).toBeVisible();
}

export const test = base;
export { expect };
```

- [ ] **Step 4: Create evidence attachments**

Create `tests/e2e/fixtures/evidence.ts`:

```ts
import type { TestInfo } from "@playwright/test";

export async function attachBusinessObject(
  testInfo: TestInfo,
  name: string,
  value: Record<string, unknown>,
): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json",
  });
}
```

- [ ] **Step 5: Create the API helper**

Create `tests/e2e/helpers/api-client.ts` with methods:

```ts
export interface TestApiClient {
  login(username: string, password: string): Promise<string>;
  get<T>(path: string, token: string): Promise<T>;
  post<T>(path: string, token: string, body?: unknown): Promise<T>;
}
```

Implementation must throw:

```text
V4_API_<status>: <method> <path>: <server error>
```

- [ ] **Step 6: Verify Playwright discovery**

```bash
npx playwright test --list
```

Expected: exits `0` and lists the configured projects.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e/fixtures tests/e2e/helpers/api-client.ts
git commit -m "test: configure V4 browser acceptance harness"
```

## Task 6: Add login, navigation, and session smoke tests

**Files:**
- Create: `tests/e2e/smoke/login-and-navigation.spec.ts`
- Create: `tests/e2e/smoke/finance-flow-navigation.spec.ts`

- [ ] **Step 1: Write login and role smoke tests**

Create:

```ts
import { test, expect, loginAs } from "../fixtures/auth.js";

test("chairman can enter the application", async ({ page }) => {
  await loginAs(page, "chairman");
  await expect(page).toHaveURL(/assistant|inbox/);
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("expired session returns to the login gate", async ({ page }) => {
  await loginAs(page, "accountant");
  await page.evaluate(() => {
    localStorage.setItem("finance-taxation-v2-token", "expired");
    localStorage.removeItem("finance-taxation-v2-refresh-token");
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
});
```

- [ ] **Step 2: Write finance-flow navigation tests**

The test must:

1. Login as accountant.
2. Open an existing business event.
3. Use the finance flow bar to navigate to documents.
4. Assert the event ID remains in URL state or page context.
5. Navigate to vouchers and back.
6. Verify breadcrumb and return action.

- [ ] **Step 3: Run smoke tests**

```bash
npx playwright test tests/e2e/smoke --project=desktop-chromium
```

Expected: tests either pass or produce a precise baseline failure with screenshot and trace. Product defects must not be hidden with `skip`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke
git commit -m "test: add V4 login and finance navigation smoke coverage"
```

## Task 7: Capture baseline scenario gaps

**Files:**
- Create: `tests/e2e/scenarios/purchase-expense.baseline.spec.ts`
- Create: `tests/e2e/scenarios/travel-expense.baseline.spec.ts`
- Create: `tests/e2e/scenarios/contract-revenue.baseline.spec.ts`
- Create: `tests/e2e/helpers/business-objects.ts`

- [ ] **Step 1: Implement linked-object assertions**

Create helpers:

```ts
export interface ExpectedBusinessChain {
  eventTitle: string;
  taskTitles: string[];
  documentTypes: string[];
  voucherRequired: boolean;
  taxTypes: string[];
}
```

Provide assertions that query the API and attach the returned object IDs to the Playwright report.

- [ ] **Step 2: Write purchase baseline journey**

The test must:

- Login as employee.
- Open AI assistant.
- Submit fixture `PUR-STD-001` with invoice attachment.
- Create the suggested event.
- Assert event, task, expense claim and invoice bundle exist.
- Switch to manager and assert approval work is visible.
- Switch to accountant and assert accounting/tax suggestion is visible.
- Attach object IDs and current gaps.

- [ ] **Step 3: Write travel baseline journey**

The test must:

- Submit trip approval, itinerary, hotel and meal fixtures.
- Assert they remain under one travel event.
- Assert transport, lodging and meal amounts are visible separately.
- Assert business-entertainment ambiguity produces a review warning.

- [ ] **Step 4: Write contract baseline journey**

The test must:

- Create or open the standard sales contract fixture.
- Trigger fulfillment and invoice actions.
- Assert contract, event, tasks, output invoice, receivable and tax item are linked.
- Import a bank receipt and assert reconciliation candidate or automatic match.

- [ ] **Step 5: Run baseline scenarios**

```bash
npx playwright test tests/e2e/scenarios --project=desktop-chromium
```

Expected:

- Failures are allowed only as documented baseline product gaps.
- Every failure has screenshot, trace, error message and object IDs.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/scenarios tests/e2e/helpers/business-objects.ts
git commit -m "test: capture V4 business scenario baselines"
```

## Task 8: Add accessibility and responsive smoke coverage

**Files:**
- Create: `tests/e2e/accessibility/core-pages.spec.ts`

- [ ] **Step 1: Write keyboard and naming tests**

Cover:

- Login.
- Assistant.
- Events.
- Documents.
- Contracts.
- Payroll.
- Tax.
- Banking.

For each page assert:

- One visible `h1` or page-title equivalent.
- Primary action has an accessible name.
- Tab key reaches the first interactive control.
- Drawer close control has an accessible name.
- Table has a visible empty or populated state.

- [ ] **Step 2: Run desktop and tablet projects**

```bash
npx playwright test tests/e2e/accessibility
```

Expected: no clipped primary action and no inaccessible unnamed control in tested paths.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/accessibility/core-pages.spec.ts
git commit -m "test: add V4 accessibility and responsive smoke checks"
```

## Task 9: Define evidence schema and report generation

**Files:**
- Create: `docs/v4/acceptance-evidence-schema.md`
- Create: `tools/v4/generate-acceptance-report.ts`
- Create: `tools/v4/generate-acceptance-report.test.ts`

- [ ] **Step 1: Write the failing report test**

The test must feed one passed and one failed Playwright case and assert:

```ts
assert.equal(report.summary.total, 2);
assert.equal(report.summary.passed, 1);
assert.equal(report.summary.failed, 1);
assert.match(report.markdown, /PUR-STD-001/);
assert.match(report.markdown, /截图/);
```

- [ ] **Step 2: Implement report types**

Use:

```ts
interface AcceptanceEvidence {
  caseId: string;
  scenario: string;
  role: string;
  status: "passed" | "failed" | "blocked";
  expected: string;
  actual: string;
  objectIds: Record<string, string[]>;
  attachments: string[];
  defectId?: string;
}
```

- [ ] **Step 3: Generate Markdown and JSON**

Write:

- `artifacts/v4/baseline/reports/acceptance-report.json`
- `artifacts/v4/baseline/reports/acceptance-report.md`

The Markdown must include:

- Run metadata.
- Environment and commit SHA.
- Summary.
- Per-case evidence.
- Failures grouped by module.
- Missing evidence warnings.

- [ ] **Step 4: Run tests**

```bash
./node_modules/.bin/tsx --test tools/v4/generate-acceptance-report.test.ts
npm run v4:report
```

- [ ] **Step 5: Commit**

```bash
git add docs/v4/acceptance-evidence-schema.md tools/v4/generate-acceptance-report.ts tools/v4/generate-acceptance-report.test.ts
git commit -m "test: generate V4 acceptance evidence reports"
```

## Task 10: Feed confirmed failures into the feedback module

**Files:**
- Create: `tools/v4/submit-failures-to-feedback.ts`
- Create: `tools/v4/submit-failures-to-feedback.test.ts`

- [ ] **Step 1: Write deduplication tests**

Test that:

- The same case ID and commit SHA produce one feedback fingerprint.
- A new commit SHA creates a new fingerprint only after the old defect was marked fixed and regressed.
- Passed and blocked-with-external-credential cases are not submitted as product bugs.

- [ ] **Step 2: Implement feedback payload creation**

Payload:

```ts
{
  category: "bug",
  title: `[V4验收][${caseId}] ${shortFailure}`,
  content: [
    `commit: ${commitSha}`,
    `scenario: ${scenario}`,
    `expected: ${expected}`,
    `actual: ${actual}`,
    `evidence: ${reportPath}`,
    `fingerprint: ${fingerprint}`,
  ].join("\n"),
  module,
}
```

- [ ] **Step 3: Require explicit environment opt-in**

Do not submit unless:

```text
V4_SUBMIT_FEEDBACK=true
```

Dry-run is the default and prints payloads.

- [ ] **Step 4: Run tests and dry-run**

```bash
./node_modules/.bin/tsx --test tools/v4/submit-failures-to-feedback.test.ts
./node_modules/.bin/tsx tools/v4/submit-failures-to-feedback.ts --dry-run
```

- [ ] **Step 5: Commit**

```bash
git add tools/v4/submit-failures-to-feedback.ts tools/v4/submit-failures-to-feedback.test.ts
git commit -m "test: connect V4 failures to product feedback"
```

## Task 11: Run Product Design baseline audit

**Files:**
- Create: `docs/v4/audits/baseline/product-flow-audit.md`
- Create: `docs/v4/audits/baseline/screenshots/`

- [ ] **Step 1: Start the isolated V4 stack**

Run:

```bash
V4_TEST_DATABASE_URL=postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test npm run v4:test:setup
curl -s http://127.0.0.1:33100/api/health
curl -I http://127.0.0.1:55173/
```

- [ ] **Step 2: Use Product Design audit**

Capture current evidence for:

1. Employee submits a purchase expense.
2. Manager sees approval work.
3. Accountant reviews documents and accounting suggestion.
4. Cashier sees payment-ready work.
5. Auditor opens the complete object chain.

Save accepted screenshots as:

```text
01-employee-entry.png
02-manager-approval.png
03-accounting-review.png
04-payment-ready.png
05-audit-trace.png
```

- [ ] **Step 3: Write findings**

For every step include:

- Health: healthy / degraded / blocked.
- Strengths.
- UX issues.
- Accessibility risks visible from screenshots.
- Missing evidence or states.
- P0/P1/P2/P3 recommendation.

- [ ] **Step 4: Commit text and small reference screenshots**

```bash
git add docs/v4/audits/baseline
git commit -m "docs: add V4 baseline product-flow audit"
```

## Task 12: Establish the visual design direction

**Files:**
- Create: `docs/v4/design/visual-direction-brief.md`
- Create: `docs/v4/design/visual-direction-selection.md`
- Create: `artifacts/v4/baseline/creative-directions/manifest.json`

- [ ] **Step 1: Create the confirmed visual brief**

The brief must preserve:

- Chinese enterprise finance context.
- Existing V3 design tokens and Ant Design components.
- Dense but readable financial tables.
- Strong process and status visibility.
- Conservative treatment of legal and accounting content.
- Desktop-first with tablet support.
- No decorative imagery inside data-heavy work areas.

- [ ] **Step 2: Run Creative Production style intake**

Use categories:

- Visual language: authoritative, calm, operational, precise.
- Typography: high legibility, Chinese enterprise UI.
- Palette: ink/navy, financial blue, restrained semantic colors.
- Avoid: purple bias, glassmorphism, card-on-card, oversized gradients, decorative finance clichés.

- [ ] **Step 3: Use Product Design ideate**

Using the audit screenshots and brief, generate exactly three independent desktop directions:

1. Operational Ledger.
2. Guided Workflow.
3. Executive Control.

Each direction must vary hierarchy and interaction model, not merely colors.

- [ ] **Step 4: Record the selected direction**

`visual-direction-selection.md` must state:

- Selected direction.
- Elements retained from other directions.
- Token impact.
- Page-shell impact.
- Table and drawer impact.
- Flow-bar impact.
- Explicit avoids.

- [ ] **Step 5: Save Creative Production manifest**

The manifest records:

- Intake selections.
- Generated asset paths.
- Prompts.
- Source screenshots.
- Selected route.
- Review status.

- [ ] **Step 6: Commit**

```bash
git add docs/v4/design artifacts/v4/baseline/creative-directions/manifest.json
git commit -m "docs: select V4 product visual direction"
```

## Task 13: Upgrade CI to enforce the V4 baseline

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `tools/v4/check-plan-artifacts.mjs`
- Create: `docs/v4/runbooks/ci-acceptance.md`

- [ ] **Step 1: Add a real workspace validation job**

Replace the legacy-only validation with jobs:

```yaml
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run typecheck:v2
      - run: npm run test:unit
      - run: npm run verify
```

- [ ] **Step 2: Add migration integration job**

Use PostgreSQL service:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    env:
      POSTGRES_USER: finance_taxation
      POSTGRES_PASSWORD: finance_taxation
      POSTGRES_DB: finance_taxation_v4_test
    ports:
      - 55433:5432
    options: >-
      --health-cmd "pg_isready -U finance_taxation -d finance_taxation_v4_test"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 20
```

Run:

```yaml
- run: npm ci
- run: npm run v4:test:db:reset
  env:
    V4_TEST_DATABASE_URL: postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test
```

- [ ] **Step 3: Add browser job**

The browser job must:

- Install Chromium.
- Reset and seed the test database.
- Start API and web.
- Run smoke E2E on every PR.
- Run full scenario E2E on `main` and nightly schedule.
- Upload `playwright-report` and `artifacts/v4`.

- [ ] **Step 4: Enforce artifact metadata**

`tools/v4/check-plan-artifacts.mjs` must fail when:

- Report JSON is missing.
- Commit SHA is missing.
- A failed test has no screenshot or trace.
- A scenario has no object IDs.

- [ ] **Step 5: Document CI interpretation**

Explain:

- Which jobs block PRs.
- How to download evidence.
- How to distinguish product defect, environment defect and missing external credentials.
- How to rerun failed jobs.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml tools/v4/check-plan-artifacts.mjs docs/v4/runbooks/ci-acceptance.md
git commit -m "ci: enforce V4 production acceptance gates"
```

## Task 14: Final V4-0 verification and handoff

**Files:**
- Create: `docs/v4/runbooks/local-acceptance.md`
- Modify: `docs/v4-progress-board.md`
- Modify: `docs/v4-execution-index.md`

- [ ] **Step 1: Run the full local gate**

```bash
npm ci
npm run v4:test:setup
npm run typecheck:v2
npm run test:unit
npm run test:e2e
npm run v4:report
npm run verify:v4
```

Expected: all infrastructure checks pass. Product-flow baseline failures may remain only if they are recorded in the acceptance report and feedback module.

- [ ] **Step 2: Verify Docker health**

```bash
npm run v4:test:stack:start
docker compose -p finance-taxation-v4-test -f docker-compose.test.yml ps
curl -s http://127.0.0.1:33100/api/health
curl -I http://127.0.0.1:55173/
```

Expected:

- DB healthy.
- API healthy.
- Web returns `200`.

- [ ] **Step 3: Complete Product Design evidence**

The baseline audit must contain all five screenshots and no unnamed blocker.

- [ ] **Step 4: Complete visual-direction selection**

Exactly one direction must be marked selected. Do not begin page redesign without this selection.

- [ ] **Step 5: Update progress**

Set:

```text
V4-0 基线与 E2E = done
V4-1 工作流运行时 = ready
V4-1 采购报销 = ready
```

- [ ] **Step 6: Commit**

```bash
git add docs/v4 docs/v4-progress-board.md docs/v4-execution-index.md
git commit -m "docs: complete V4 baseline acceptance handoff"
```

- [ ] **Step 7: Push and open a draft PR**

```bash
git push -u origin codex/v4-baseline-and-e2e
```

Draft PR title:

```text
V4-0: establish production acceptance baseline
```

PR body must link:

- V4 design spec.
- Implementation plan.
- Acceptance report.
- Product Design audit.
- Selected visual direction.
- CI run.
