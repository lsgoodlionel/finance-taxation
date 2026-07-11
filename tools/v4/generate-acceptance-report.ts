import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export interface AcceptanceEvidence {
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

export interface AuditEvidence {
  path: string;
  title: string;
  date: string | null;
  summary: string;
}

export interface AcceptanceReport {
  runLabel: string;
  generatedAt: string;
  commitSha: string;
  environment: {
    nodeVersion: string;
    platform: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    byStatus: Record<AcceptanceEvidence["status"], number>;
  };
  evidence: AcceptanceEvidence[];
  failuresByModule: Array<{
    module: string;
    cases: AcceptanceEvidence[];
  }>;
  audits: AuditEvidence[];
  warnings: string[];
  markdown: string;
}

interface PlaywrightAttachment {
  name?: string;
  contentType?: string;
  path?: string;
  body?: string;
}

interface PlaywrightResult {
  status?: string;
  duration?: number;
  startTime?: string;
  errors?: Array<{ message?: string; value?: string }>;
  attachments?: PlaywrightAttachment[];
}

interface PlaywrightTest {
  projectName?: string;
  expectedStatus?: string;
  results?: PlaywrightResult[];
}

interface PlaywrightSpec {
  title?: string;
  file?: string;
  line?: number;
  column?: number;
  specs?: PlaywrightSpec[];
  tests?: PlaywrightTest[];
}

interface PlaywrightSuite {
  title?: string;
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightJsonReport {
  config?: {
    rootDir?: string;
  };
  suites?: PlaywrightSuite[];
}

interface GenerateAcceptanceReportInput {
  runLabel: string;
  commitSha: string;
  generatedAt: string;
  environment: {
    nodeVersion: string;
    platform: string;
  };
  playwrightResults: PlaywrightJsonReport;
  audits?: AuditEvidence[];
}

interface RunAcceptanceReportOptions {
  repoRoot?: string;
  runLabel?: string;
  commitSha?: string;
  generatedAt?: string;
  environment?: {
    nodeVersion: string;
    platform: string;
  };
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultRunLabel = "baseline";

function ensureString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStrings);
}

function inferStatus(test: PlaywrightTest): AcceptanceEvidence["status"] {
  const statuses = (test.results ?? []).map((result) => result.status ?? "unknown");
  if (statuses.some((status) => status === "failed" || status === "timedOut")) {
    return "failed";
  }
  if (statuses.some((status) =>
    ["interrupted", "skipped", "cancelled"].includes(status)
  )) {
    return "blocked";
  }
  return "passed";
}

function flattenSpecs(
  suites: readonly PlaywrightSuite[] | undefined,
  parentFile?: string
): Array<{ spec: PlaywrightSpec; file: string }> {
  const collected: Array<{ spec: PlaywrightSpec; file: string }> = [];

  function visitSpec(spec: PlaywrightSpec, inheritedFile: string) {
    const file = ensureString(spec.file) ?? inheritedFile;
    if ((spec.tests ?? []).length > 0) {
      collected.push({ spec, file });
    }
    for (const child of spec.specs ?? []) {
      visitSpec(child, file);
    }
  }

  function visitSuite(suite: PlaywrightSuite, inheritedFile: string) {
    const file = ensureString(suite.file) ?? inheritedFile;
    for (const spec of suite.specs ?? []) {
      visitSpec(spec, file);
    }
    for (const child of suite.suites ?? []) {
      visitSuite(child, file);
    }
  }

  for (const suite of suites ?? []) {
    visitSuite(suite, parentFile ?? "");
  }

  return collected.sort((left, right) => {
    const byFile = compareStrings(left.file, right.file);
    if (byFile !== 0) {
      return byFile;
    }
    return compareStrings(left.spec.title ?? "", right.spec.title ?? "");
  });
}

function extractCaseId(title: string, fallbackFile: string, line: number | undefined): string {
  const match = title.match(/\b[A-Z]{3,}(?:-[A-Z]+)?-\d{3}\b/);
  if (match) {
    return match[0];
  }
  const fileStem = fallbackFile.replace(/\\/g, "/").split("/").pop() ?? "unknown";
  return `${fileStem}:${line ?? 0}`;
}

function decodeAttachmentBody(body: string): string | null {
  try {
    return Buffer.from(body, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function appendObjectIds(target: Record<string, string[]>, key: string, values: unknown): void {
  if (!Array.isArray(values)) {
    return;
  }
  const normalized = values.filter((value): value is string =>
    typeof value === "string" && value.trim() !== ""
  );
  if (normalized.length === 0) {
    return;
  }
  target[key] = sortedUnique([...(target[key] ?? []), ...normalized]);
}

function objectIdsFromAttachment(attachment: PlaywrightAttachment): {
  objectIds: Record<string, string[]>;
  role: string | null;
} {
  const empty = {
    objectIds: {
      contractIds: [],
      documentIds: [],
      eventIds: [],
      taskIds: [],
      taxItemIds: [],
      voucherIds: []
    },
    role: null as string | null
  };

  if (attachment.contentType !== "application/json" || !attachment.body) {
    return empty;
  }

  const body = decodeAttachmentBody(attachment.body);
  if (!body) {
    return empty;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return empty;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return empty;
  }

  const record = parsed as Record<string, unknown>;
  appendObjectIds(empty.objectIds, "taskIds", record.taskIds);
  appendObjectIds(empty.objectIds, "documentIds", record.documentIds);
  appendObjectIds(empty.objectIds, "voucherIds", record.voucherIds);
  appendObjectIds(empty.objectIds, "taxItemIds", record.taxItemIds);
  appendObjectIds(empty.objectIds, "contractIds", typeof record.contractId === "string" ? [record.contractId] : []);

  const event = record.event;
  if (typeof event === "object" && event !== null && !Array.isArray(event)) {
    const eventId = ensureString((event as Record<string, unknown>).id);
    if (eventId) {
      appendObjectIds(empty.objectIds, "eventIds", [eventId]);
    }
  }

  return {
    objectIds: empty.objectIds,
    role: ensureString(record.role)
  };
}

function normalizeAttachments(attachments: readonly PlaywrightAttachment[] | undefined): {
  attachments: string[];
  objectIds: Record<string, string[]>;
  role: string | null;
} {
  const objectIds = {
    contractIds: [] as string[],
    documentIds: [] as string[],
    eventIds: [] as string[],
    taskIds: [] as string[],
    taxItemIds: [] as string[],
    voucherIds: [] as string[]
  };
  const attachmentLabels: string[] = [];
  let role: string | null = null;

  for (const attachment of attachments ?? []) {
    const labelParts = [
      ensureString(attachment.name),
      ensureString(attachment.path)
    ].filter((value): value is string => value !== null);
    if (labelParts.length > 0) {
      attachmentLabels.push(labelParts.join(" -> "));
    }

    const extracted = objectIdsFromAttachment(attachment);
    for (const [key, values] of Object.entries(extracted.objectIds)) {
      appendObjectIds(objectIds, key, values);
    }
    role ??= extracted.role;
  }

  return {
    attachments: sortedUnique(attachmentLabels),
    objectIds,
    role
  };
}

function summarizeErrors(test: PlaywrightTest): string {
  const messages = (test.results ?? [])
    .flatMap((result) => result.errors ?? [])
    .map((error) => ensureString(error.message) ?? ensureString(error.value))
    .filter((value): value is string => value !== null);

  if (messages.length === 0) {
    return inferStatus(test) === "passed" ? "Playwright assertions matched expected behavior." : "No error message recorded.";
  }

  return sortedUnique(messages).join(" | ");
}

function inferScenario(caseId: string, file: string, title: string): string {
  if (caseId.startsWith("PUR")) {
    return "purchase_expense";
  }
  if (caseId.startsWith("TRA")) {
    return "travel_expense";
  }
  if (caseId.startsWith("CON")) {
    return "contract_revenue";
  }
  if (file.includes("runtime-summary")) {
    return "runtime_summary";
  }
  return title.replace(/\s+/g, " ").trim();
}

function determineModule(file: string): string {
  const normalized = file.replace(/\\/g, "/");
  return normalized.split("/")[0] || "unknown";
}

export function generateAcceptanceReport(
  input: GenerateAcceptanceReportInput
): AcceptanceReport {
  const evidence = flattenSpecs(input.playwrightResults.suites).flatMap(({ spec, file }) =>
    (spec.tests ?? []).map((test) => {
      const title = ensureString(spec.title) ?? "Unnamed acceptance case";
      const caseId = extractCaseId(title, file, spec.line);
      const normalized = normalizeAttachments(
        (test.results ?? []).flatMap((result) => result.attachments ?? [])
      );
      const status = inferStatus(test);

      return {
        caseId,
        scenario: inferScenario(caseId, file, title),
        role: normalized.role ?? "unknown",
        status,
        expected: title,
        actual: summarizeErrors(test),
        objectIds: normalized.objectIds,
        attachments: normalized.attachments,
        defectId: undefined
      } satisfies AcceptanceEvidence;
    })
  ).sort((left, right) => {
    const byCase = compareStrings(left.caseId, right.caseId);
    if (byCase !== 0) {
      return byCase;
    }
    return compareStrings(left.expected, right.expected);
  });

  const summary = {
    total: evidence.length,
    passed: evidence.filter((item) => item.status === "passed").length,
    failed: evidence.filter((item) => item.status === "failed").length,
    blocked: evidence.filter((item) => item.status === "blocked").length,
    byStatus: {
      blocked: evidence.filter((item) => item.status === "blocked").length,
      failed: evidence.filter((item) => item.status === "failed").length,
      passed: evidence.filter((item) => item.status === "passed").length
    }
  };

  const failuresByModule = Object.entries(
    evidence
      .filter((item) => item.status === "failed")
      .reduce<Record<string, AcceptanceEvidence[]>>((accumulator, item) => {
        const key = determineModule(item.expected.includes(".spec.ts") ? item.expected : item.scenario.includes("/") ? item.scenario : "");
        const module = key === "unknown" ? determineModule(item.caseId.includes(":") ? item.caseId : item.scenario) : key;
        const resolved = module === "unknown"
          ? determineModule(
              flattenSpecs(input.playwrightResults.suites).find(({ spec }) =>
                extractCaseId(ensureString(spec.title) ?? "", "", spec.line) === item.caseId
              )?.file ?? "unknown"
            )
          : module;
        accumulator[resolved] ??= [];
        accumulator[resolved].push(item);
        return accumulator;
      }, {})
  )
    .map(([module, cases]) => ({
      module,
      cases: cases.sort((left, right) => compareStrings(left.caseId, right.caseId))
    }))
    .sort((left, right) => compareStrings(left.module, right.module));

  const warnings = sortedUnique([
    ...(evidence.some((item) => item.attachments.length === 0) ? [
      ...evidence
        .filter((item) => item.attachments.length === 0)
        .map((item) => `${item.caseId}: 缺少截图或 trace 附件`)
    ] : []),
    ...(evidence.some((item) =>
      Object.values(item.objectIds).every((values) => values.length === 0)
    ) ? [
      ...evidence
        .filter((item) => Object.values(item.objectIds).every((values) => values.length === 0))
        .map((item) => `${item.caseId}: 缺少业务对象 ID 证据`)
    ] : []),
    ...((input.audits ?? []).length === 0 ? ["未发现 docs/v4/audits 下的补充验收审计。"] : [])
  ]);

  const reportBase: Omit<AcceptanceReport, "markdown"> = {
    runLabel: input.runLabel,
    generatedAt: input.generatedAt,
    commitSha: input.commitSha,
    environment: input.environment,
    summary,
    evidence,
    failuresByModule,
    audits: (input.audits ?? []).slice().sort((left, right) => {
      const byDate = compareStrings(left.date ?? "", right.date ?? "");
      if (byDate !== 0) {
        return byDate;
      }
      return compareStrings(left.title, right.title);
    }),
    warnings
  };

  const markdown = renderMarkdown(reportBase);
  return {
    ...reportBase,
    markdown
  };
}

function renderObjectIds(objectIds: Record<string, string[]>): string {
  const entries = Object.entries(objectIds)
    .filter(([, values]) => values.length > 0)
    .sort(([left], [right]) => compareStrings(left, right));
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([key, values]) => `${key}=${values.join(",")}`).join("; ");
}

function renderMarkdown(report: Omit<AcceptanceReport, "markdown">): string {
  const lines: string[] = [
    "# V4 Acceptance Report",
    "",
    "## Run metadata",
    `- Run label: ${report.runLabel}`,
    `- Generated at: ${report.generatedAt}`,
    `- Commit SHA: ${report.commitSha}`,
    `- Node: ${report.environment.nodeVersion}`,
    `- Platform: ${report.environment.platform}`,
    "",
    "## Summary",
    `- Total: ${report.summary.total}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Blocked: ${report.summary.blocked}`,
    ""
  ];

  if (report.audits.length > 0) {
    lines.push("## Supplemental audits");
    for (const audit of report.audits) {
      lines.push(`- ${audit.date ?? "unknown-date"} ${audit.title} (${audit.path})`);
      lines.push(`  Summary: ${audit.summary}`);
    }
    lines.push("");
  }

  lines.push("## Per-case evidence");
  for (const item of report.evidence) {
    lines.push(`### ${item.caseId}`);
    lines.push(`- Scenario: ${item.scenario}`);
    lines.push(`- Role: ${item.role}`);
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Expected: ${item.expected}`);
    lines.push(`- Actual: ${item.actual}`);
    lines.push(`- Object IDs: ${renderObjectIds(item.objectIds)}`);
    lines.push(`- Attachments: ${item.attachments.length > 0 ? item.attachments.join(" | ") : "none"}`);
    lines.push("");
  }

  lines.push("## Failures grouped by module");
  if (report.failuresByModule.length === 0) {
    lines.push("- No failed cases.");
  } else {
    for (const group of report.failuresByModule) {
      lines.push(`### ${group.module}`);
      for (const item of group.cases) {
        lines.push(`- ${item.caseId}: ${item.actual}`);
      }
      lines.push("");
    }
  }

  lines.push("## Missing evidence warnings");
  if (report.warnings.length === 0) {
    lines.push("- None.");
  } else {
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return walkMarkdownFiles(fullPath);
    }
    return fullPath.endsWith(".md") ? [fullPath] : [];
  }));

  return files.flat().sort(compareStrings);
}

export async function collectAuditEvidence(auditsRoot: string): Promise<AuditEvidence[]> {
  const files = await walkMarkdownFiles(auditsRoot);
  const audits: AuditEvidence[] = [];

  for (const filePath of files) {
    const contents = await readFile(filePath, "utf8");
    const lines = contents.split(/\r?\n/);
    const title = ensureString(lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "")) ?? relative(auditsRoot, filePath);
    const dateMatch = contents.match(/日期[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
    const summaryLine = lines.find((line) => /^\s*[-*]\s+/.test(line));

    audits.push({
      path: filePath,
      title,
      date: dateMatch?.[1] ?? null,
      summary: ensureString(summaryLine?.replace(/^\s*[-*]\s+/, "")) ?? "No summary bullet found."
    });
  }

  return audits.sort((left, right) => {
    const byDate = compareStrings(left.date ?? "", right.date ?? "");
    if (byDate !== 0) {
      return byDate;
    }
    return compareStrings(left.title, right.title);
  });
}

function resolveCommitSha(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8"
  });
  if (result.status === 0) {
    return result.stdout.trim();
  }
  return "unknown";
}

export async function runAcceptanceReport(
  options: RunAcceptanceReportOptions = {}
): Promise<AcceptanceReport> {
  const root = options.repoRoot ?? repoRoot;
  const runLabel = options.runLabel ?? defaultRunLabel;
  const resultsPath = resolve(root, "artifacts", "v4", runLabel, "browser", "results.json");
  const outputDir = resolve(root, "artifacts", "v4", runLabel, "reports");
  const auditsRoot = resolve(root, "docs", "v4", "audits");
  const playwrightResults = JSON.parse(await readFile(resultsPath, "utf8")) as PlaywrightJsonReport;
  const audits = await collectAuditEvidence(auditsRoot);
  const report = generateAcceptanceReport({
    runLabel,
    commitSha: options.commitSha ?? process.env.V4_REPORT_COMMIT_SHA ?? resolveCommitSha(root),
    generatedAt: options.generatedAt ?? process.env.V4_REPORT_GENERATED_AT ?? "unknown",
    environment: options.environment ?? {
      nodeVersion: process.version,
      platform: process.platform
    },
    playwrightResults,
    audits
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "acceptance-report.json"),
    `${JSON.stringify({
      ...report,
      markdown: undefined
    }, null, 2)}\n`
  );
  await writeFile(resolve(outputDir, "acceptance-report.md"), report.markdown);

  return report;
}

async function main(): Promise<void> {
  const report = await runAcceptanceReport();
  console.log(
    `generated acceptance report: ${report.summary.total} cases, ${report.summary.failed} failed, ${report.warnings.length} warnings`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
