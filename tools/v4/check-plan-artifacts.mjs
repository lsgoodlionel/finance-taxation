import { access, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function asRecord(value) {
  return value !== null && typeof value === "object" ? value : {};
}

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string");
}

function parseArgs(argv) {
  let runLabel = "baseline";
  let root = repoRoot;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run-label") {
      runLabel = argv[index + 1] ?? runLabel;
      index += 1;
    } else if (argument === "--root") {
      root = resolve(argv[index + 1] ?? root);
      index += 1;
    }
  }

  return { runLabel, root };
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertPath(path, kind, failures, label) {
  if (!(await pathExists(path))) {
    failures.push(`${label} is missing: ${path}`);
    return;
  }

  const details = await stat(path);
  if (kind === "file" && !details.isFile()) {
    failures.push(`${label} must be a file: ${path}`);
  } else if (kind === "directory" && !details.isDirectory()) {
    failures.push(`${label} must be a directory: ${path}`);
  }
}

function commitShaFromReport(report) {
  return asString(report.commitSha).trim() || asString(asRecord(report.metadata).commitSha).trim();
}

function evidenceEntries(report) {
  return Array.isArray(report.evidence) ? report.evidence : [];
}

function extractObjectIdCount(entry) {
  const objectIds = asRecord(entry.objectIds);
  const keys = [
    "eventIds",
    "taskIds",
    "documentIds",
    "voucherIds",
    "taxItemIds",
    "contractIds"
  ];

  return keys.reduce((count, key) => count + asStringArray(objectIds[key]).length, 0);
}

function requiresBusinessObjectIds(entry) {
  const scenario = asString(entry.scenario).trim();
  return (
    scenario === "purchase_expense" ||
    scenario === "travel_expense" ||
    scenario === "contract_revenue"
  );
}

function extractEvidencePaths(entry) {
  const evidence = asRecord(entry.evidence);
  const artifacts = asRecord(entry.artifacts);
  const attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
  const screenshots = [
    ...asStringArray(evidence.screenshots),
    ...asStringArray(artifacts.screenshots)
  ];
  const traces = [
    ...asStringArray(evidence.traces),
    ...asStringArray(artifacts.traces)
  ];
  const claimedPaths = [
    ...screenshots,
    ...traces,
    ...asStringArray(evidence.files),
    ...asStringArray(artifacts.files)
  ];

  for (const attachment of attachments) {
    const item = asRecord(attachment);
    const attachmentPath = asString(item.path).trim();
    if (!attachmentPath) {
      continue;
    }

    const contentType = asString(item.contentType).toLowerCase();
    claimedPaths.push(attachmentPath);
    if (contentType.includes("image/")) {
      screenshots.push(attachmentPath);
    }
    if (
      contentType.includes("zip") ||
      contentType.includes("trace") ||
      attachmentPath.endsWith(".zip") ||
      attachmentPath.endsWith(".trace")
    ) {
      traces.push(attachmentPath);
    }
  }

  return {
    screenshots,
    traces,
    claimedPaths
  };
}

async function checkClaimedEvidenceFiles(root, entry, failures) {
  const { claimedPaths } = extractEvidencePaths(entry);

  for (const relativePath of claimedPaths) {
    const fullPath = resolve(root, relativePath);
    if (!(await pathExists(fullPath))) {
      failures.push(
        `Case ${asString(entry.caseId)} claims evidence that is missing: ${relativePath}`
      );
    }
  }
}

export async function validatePlanArtifacts(options = {}) {
  const root = resolve(options.root ?? repoRoot);
  const runLabel = options.runLabel ?? "baseline";
  const runRoot = resolve(root, "artifacts", "v4", runLabel);
  const reportsDir = resolve(runRoot, "reports");
  const reportJsonPath = resolve(reportsDir, "acceptance-report.json");
  const reportMarkdownPath = resolve(reportsDir, "acceptance-report.md");
  const failures = [];

  await assertPath(reportJsonPath, "file", failures, "Acceptance report JSON");
  await assertPath(reportMarkdownPath, "file", failures, "Acceptance report Markdown");
  if (failures.length > 0) {
    return failures;
  }

  const report = JSON.parse(await readFile(reportJsonPath, "utf8"));
  const summary = asRecord(report.summary);
  const evidence = evidenceEntries(report);
  const commitSha = commitShaFromReport(asRecord(report));

  if (!commitSha) {
    failures.push("Acceptance report is missing commitSha metadata");
  }

  if (typeof summary.total !== "number") {
    failures.push("Acceptance report summary.total must be a number");
  }

  if (typeof summary.total === "number" && summary.total > 0 && evidence.length === 0) {
    failures.push("Acceptance report must include evidence entries when summary.total is non-zero");
  }

  for (const rawEntry of evidence) {
    const entry = asRecord(rawEntry);
    const caseId = asString(entry.caseId).trim() || "<unknown>";
    const status = asString(entry.status).trim().toLowerCase();
    const objectIdCount = extractObjectIdCount(entry);

    if (requiresBusinessObjectIds(entry) && objectIdCount === 0) {
      failures.push(`Case ${caseId} is missing business object IDs`);
    }

    await checkClaimedEvidenceFiles(root, entry, failures);

    if (status === "failed") {
      const { screenshots, traces } = extractEvidencePaths(entry);
      if (screenshots.length === 0) {
        failures.push(`Failed case ${caseId} is missing screenshot evidence`);
      }
      if (traces.length === 0) {
        failures.push(`Failed case ${caseId} is missing trace evidence`);
      }
    }
  }

  const browserDir = resolve(runRoot, "browser");
  if (await pathExists(browserDir)) {
    await assertPath(browserDir, "directory", failures, "Browser artifact directory");
  }

  return failures;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const failures = await validatePlanArtifacts(options);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`ERROR: ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`V4 plan artifacts valid for ${options.runLabel}`);
}

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  await runCli();
}
