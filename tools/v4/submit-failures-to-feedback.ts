import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultReportPath = resolve(
  repoRoot,
  "artifacts/v4/baseline/reports/acceptance-report.json"
);
const defaultHistoryPath = resolve(
  repoRoot,
  "artifacts/v4/baseline/reports/feedback-history.json"
);

export interface FeedbackPayload {
  category: "bug";
  title: string;
  content: string;
  module: string;
}

export interface FeedbackHistoryRecord {
  caseId: string;
  fingerprint: string;
  commitSha: string;
  state: "open" | "fixed";
  createdAt?: string;
}

interface NormalizedFailure {
  caseId: string;
  scenario: string;
  module: string;
  status: string;
  expected: string;
  actual: string;
  reportPath: string;
  fingerprint: string;
}

interface SkippedFailure {
  caseId: string;
  reason:
    | "duplicate_in_report"
    | "already_open"
    | "already_submitted"
    | "non_failure_status"
    | "external_dependency"
    | "missing_case_id";
  fingerprint?: string;
}

export interface BuildFeedbackSubmissionsResult {
  payloads: FeedbackPayload[];
  records: FeedbackHistoryRecord[];
  skipped: SkippedFailure[];
}

interface BuildFeedbackOptions {
  history: readonly FeedbackHistoryRecord[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function trimToSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shortenFailure(actual: string, expected: string): string {
  const preferred = trimToSingleLine(actual) || trimToSingleLine(expected) || "acceptance failure";
  return preferred.length > 120 ? `${preferred.slice(0, 117)}...` : preferred;
}

function inferModule(entry: Record<string, unknown>): string {
  const explicitModule = asString(entry.module).trim();
  if (explicitModule) {
    return explicitModule;
  }

  const scenario = asString(entry.scenario);
  if (scenario.includes("/")) {
    return scenario.split("/")[0] ?? "unknown";
  }

  return "unknown";
}

function inferReportPath(report: Record<string, unknown>, entry: Record<string, unknown>): string {
  const entryPath = asString(entry.reportPath).trim();
  if (entryPath) {
    return entryPath;
  }

  const reportPath = asString(report.reportPath).trim();
  if (reportPath) {
    return reportPath;
  }

  return relative(repoRoot, defaultReportPath);
}

function isExternalCredentialBlock(entry: Record<string, unknown>): boolean {
  const status = asString(entry.status).toLowerCase();
  if (status !== "blocked") {
    return false;
  }

  const blockingReason = asString(entry.blockingReason).toLowerCase();
  const actual = asString(entry.actual).toLowerCase();
  return (
    blockingReason.includes("external_credential") ||
    blockingReason.includes("external-credential") ||
    blockingReason.includes("external_credentials") ||
    blockingReason.includes("sandbox_credential") ||
    actual.includes("external credential") ||
    actual.includes("sandbox credential")
  );
}

function normalizeFailures(reportInput: unknown): NormalizedFailure[] {
  const report = asRecord(reportInput);
  const commitSha =
    asString(report.commitSha).trim() || asString(asRecord(report.metadata).commitSha).trim();
  const evidence = Array.isArray(report.evidence) ? report.evidence : [];

  return evidence.map((item) => {
    const entry = asRecord(item);
    const caseId = asString(entry.caseId).trim();
    const expected = asString(entry.expected).trim();
    const actual = asString(entry.actual).trim();

    return {
      caseId,
      scenario: asString(entry.scenario).trim(),
      module: inferModule(entry),
      status: asString(entry.status).trim().toLowerCase(),
      expected,
      actual,
      reportPath: inferReportPath(report, entry),
      fingerprint: createFeedbackFingerprint({ caseId, commitSha })
    };
  });
}

export function createFeedbackFingerprint(input: {
  caseId: string;
  commitSha: string;
}): string {
  return createHash("sha1").update(`${input.caseId}:${input.commitSha}`).digest("hex");
}

export function buildFeedbackSubmissions(
  reportInput: unknown,
  options: BuildFeedbackOptions
): BuildFeedbackSubmissionsResult {
  const report = asRecord(reportInput);
  const commitSha =
    asString(report.commitSha).trim() || asString(asRecord(report.metadata).commitSha).trim();
  const failures = normalizeFailures(reportInput);
  const payloads: FeedbackPayload[] = [];
  const records: FeedbackHistoryRecord[] = [];
  const skipped: SkippedFailure[] = [];
  const seenFingerprints = new Set<string>();

  for (const failure of failures) {
    if (!failure.caseId) {
      skipped.push({ caseId: "", reason: "missing_case_id" });
      continue;
    }

    if (failure.status !== "failed") {
      const originalEntry = (Array.isArray(report.evidence) ? report.evidence : []).find((item) => {
        const candidate = asRecord(item);
        return asString(candidate.caseId).trim() === failure.caseId;
      });
      skipped.push({
        caseId: failure.caseId,
        reason: isExternalCredentialBlock(asRecord(originalEntry))
          ? "external_dependency"
          : "non_failure_status"
      });
      continue;
    }

    if (seenFingerprints.has(failure.fingerprint)) {
      skipped.push({
        caseId: failure.caseId,
        reason: "duplicate_in_report",
        fingerprint: failure.fingerprint
      });
      continue;
    }
    seenFingerprints.add(failure.fingerprint);

    const historyForCase = options.history.filter((item) => item.caseId === failure.caseId);
    const exactMatch = historyForCase.find((item) => item.fingerprint === failure.fingerprint);
    if (exactMatch) {
      skipped.push({
        caseId: failure.caseId,
        reason: "already_submitted",
        fingerprint: exactMatch.fingerprint
      });
      continue;
    }

    const latest = historyForCase.at(-1);
    if (latest?.state === "open") {
      skipped.push({
        caseId: failure.caseId,
        reason: "already_open",
        fingerprint: latest.fingerprint
      });
      continue;
    }

    const payload: FeedbackPayload = {
      category: "bug",
      title: `[V4验收][${failure.caseId}] ${shortenFailure(failure.actual, failure.expected)}`,
      content: [
        `commit: ${commitSha}`,
        `scenario: ${failure.scenario}`,
        `expected: ${failure.expected}`,
        `actual: ${failure.actual}`,
        `evidence: ${failure.reportPath}`,
        `fingerprint: ${failure.fingerprint}`
      ].join("\n"),
      module: failure.module
    };

    payloads.push(payload);
    records.push({
      caseId: failure.caseId,
      fingerprint: failure.fingerprint,
      commitSha,
      state: "open"
    });
  }

  return { payloads, records, skipped };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readHistory(path: string): Promise<FeedbackHistoryRecord[]> {
  if (!(await fileExists(path))) {
    return [];
  }

  const value = await readJsonFile(path);
  if (!Array.isArray(value)) {
    throw new Error(`Feedback history must be a JSON array: ${path}`);
  }

  return value.map((item) => {
    const entry = asRecord(item);
    return {
      caseId: asString(entry.caseId).trim(),
      fingerprint: asString(entry.fingerprint).trim(),
      commitSha: asString(entry.commitSha).trim(),
      state: asString(entry.state) === "fixed" ? "fixed" : "open",
      createdAt: asString(entry.createdAt).trim() || undefined
    };
  });
}

interface CliOptions {
  reportPath: string;
  historyPath: string;
  apiUrl: string;
  dryRun: boolean;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let reportPath = defaultReportPath;
  let historyPath = defaultHistoryPath;
  let apiUrl = asString(process.env.V4_FEEDBACK_API_URL).trim();
  let dryRun = true;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--report") {
      reportPath = resolve(argv[index + 1] ?? reportPath);
      index += 1;
    } else if (argument === "--history") {
      historyPath = resolve(argv[index + 1] ?? historyPath);
      index += 1;
    } else if (argument === "--api-url") {
      apiUrl = argv[index + 1] ?? apiUrl;
      index += 1;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--submit") {
      dryRun = false;
    }
  }

  if (process.env.V4_SUBMIT_FEEDBACK === "true") {
    dryRun = false;
  }

  return {
    reportPath,
    historyPath,
    apiUrl,
    dryRun
  };
}

async function submitPayloads(apiUrl: string, payloads: readonly FeedbackPayload[]): Promise<void> {
  if (!apiUrl.trim()) {
    throw new Error(
      "Submitting feedback requires V4_FEEDBACK_API_URL or --api-url alongside V4_SUBMIT_FEEDBACK=true"
    );
  }

  const headers = new Headers({
    "content-type": "application/json"
  });
  const bearerToken = asString(process.env.V4_FEEDBACK_AUTH_TOKEN).trim();
  const cookie = asString(process.env.V4_FEEDBACK_COOKIE).trim();

  if (bearerToken) {
    headers.set("authorization", `Bearer ${bearerToken}`);
  }
  if (cookie) {
    headers.set("cookie", cookie);
  }

  for (const payload of payloads) {
    const response = await fetch(new URL("/api/feedback", apiUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Feedback submission failed (${response.status}): ${body}`);
    }
  }
}

async function writeHistory(path: string, history: readonly FeedbackHistoryRecord[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

async function runCli(argv: readonly string[]): Promise<void> {
  const options = parseCliArgs(argv);
  const report = await readJsonFile(options.reportPath);
  const history = await readHistory(options.historyPath);
  const result = buildFeedbackSubmissions(report, { history });

  if (options.dryRun) {
    console.log("mode: dry-run");
    console.log(JSON.stringify(result.payloads, null, 2));
    return;
  }

  if (process.env.V4_SUBMIT_FEEDBACK !== "true") {
    throw new Error("Set V4_SUBMIT_FEEDBACK=true to submit feedback. Dry-run is the default.");
  }

  await submitPayloads(options.apiUrl, result.payloads);
  const createdAt = new Date().toISOString();
  await writeHistory(options.historyPath, [
    ...history,
    ...result.records.map((record) => ({ ...record, createdAt }))
  ]);
  console.log(`submitted feedback payloads: ${result.payloads.length}`);
}

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  void runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
