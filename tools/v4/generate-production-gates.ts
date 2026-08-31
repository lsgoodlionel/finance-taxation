import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type {
  AiEvalSourceInput,
  BackupRestoreSourceInput,
  ConnectorSourceInput,
  OpsSourceArtifact,
  OpsSourceMetadata
} from "./ops-source-recorders.ts";

type PlaywrightResult = {
  status?: string;
  duration?: number;
};

type PlaywrightTest = {
  results?: PlaywrightResult[];
};

type PlaywrightSpec = {
  title?: string;
  tests?: PlaywrightTest[];
  specs?: PlaywrightSpec[];
};

type PlaywrightSuite = {
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
};

type PlaywrightJson = {
  suites?: PlaywrightSuite[];
};

type AcceptanceReportLike = {
  warnings?: string[];
  summary?: {
    total?: number;
    passed?: number;
    failed?: number;
    blocked?: number;
    byStatus?: Record<string, number>;
  };
};

/**
 * 三种运维证据的形状**复用记录器里的定义**，不再各自重写一份。
 *
 * 此前这里手抄了一套，抄漏了 `generatedAt`——真实数据里有，局部类型里没有，
 * 于是按真实结构写的测试报 TS2353。`typecheck:v4:tools` 因此长期红着 3 条，
 * 而一个长期红着的检查等于没有检查：V17 阶段二拆种子文件时忘了加 `export`，
 * 它本来能抓到（TS2459），却淹没在这三条既存错误里。
 */
/**
 * 渲染用的投影：比记录器的输入少一个 `generatedAt`——那是产出时间戳，
 * 报告正文里不呈现。
 *
 * **投影与输入是两个类型**，此前混成了一个：局部手抄了一份输入的形状、
 * 抄漏了 `generatedAt`，于是按真实数据写的测试报 TS2353，
 * `typecheck:v4:tools` 长期红着 3 条。而一个长期红着的检查等于没有检查——
 * V17 阶段二拆种子文件时忘了加 `export`，它本来能抓到（TS2459），
 * 却淹没在这三条既存错误里。
 *
 * 现在输入侧引用记录器的定义（漏字段就报错），投影侧显式写出来。
 */
type BackupRestoreSource = Omit<BackupRestoreSourceInput, "generatedAt"> | null;

type ConnectorSource = Omit<ConnectorSourceInput, "generatedAt"> | null;

type AiEvalSource = Omit<AiEvalSourceInput, "generatedAt"> | null;

function hasMeaningfulString(value: string | undefined) {
  return typeof value === "string" && value.trim() !== "";
}

export function createRenderableBackupRestoreSource(
  value: Exclude<BackupRestoreSource, null> | BackupRestoreSourceInput
): BackupRestoreSource {
  if (
    !hasMeaningfulString(value.backupCompletedAt) ||
    !hasMeaningfulString(value.restoreVerifiedAt) ||
    !hasMeaningfulString(value.verifiedBy) ||
    value.verifiedBy.includes("fill-with-") ||
    value.rpoHours <= 0 ||
    value.rtoHours <= 0
  ) {
    return null;
  }
  return {
    metadata: value.metadata,
    backupCompletedAt: value.backupCompletedAt,
    restoreVerifiedAt: value.restoreVerifiedAt,
    rpoHours: value.rpoHours,
    rtoHours: value.rtoHours,
    verifiedBy: value.verifiedBy
  };
}

export function createRenderableConnectorSource(
  value: Exclude<ConnectorSource, null> | ConnectorSourceInput
): ConnectorSource {
  const connectors = value.connectors.filter((item) =>
    hasMeaningfulString(item.lastVerifiedAt) ||
    item.roundtripMs > 0 ||
    (item.notes ? !item.notes.includes("fill with certification result") : false)
  );
  return connectors.length > 0 ? { metadata: value.metadata, connectors: value.connectors } : null;
}

export function createRenderableAiEvalSource(
  value: Exclude<AiEvalSource, null> | AiEvalSourceInput
): AiEvalSource {
  if (
    value.sampleSize <= 0 &&
    value.suggestionAcceptanceRate === 0 &&
    value.documentRecallRate === 0 &&
    value.highRiskAutoExecutionCount === 0 &&
    value.falsePositiveRate === 0
  ) {
    return null;
  }
  return {
    metadata: value.metadata,
    sampleSize: value.sampleSize,
    suggestionAcceptanceRate: value.suggestionAcceptanceRate,
    documentRecallRate: value.documentRecallRate,
    highRiskAutoExecutionCount: value.highRiskAutoExecutionCount,
    falsePositiveRate: value.falsePositiveRate
  };
}

export interface OpsEvidenceSourceContext {
  sourceType: "backup-restore" | "connectors" | "ai-evals";
  sourceId: string;
  capturedAt: string;
  summary: string;
  artifacts: OpsSourceArtifact[];
}

function buildSourceContext(
  metadata: OpsSourceMetadata | undefined,
  fallback: OpsEvidenceSourceContext
): OpsEvidenceSourceContext {
  if (!metadata) {
    return fallback;
  }
  return {
    sourceType: metadata.sourceType,
    sourceId: metadata.sourceId,
    capturedAt: metadata.capturedAt,
    summary: metadata.summary,
    artifacts: metadata.artifacts
  };
}

export interface LoadEvidence {
  generatedAt: string;
  samples: number;
  pageP95Ms: number;
  apiP95Ms: number;
  errorRate: number;
  scenarios: string[];
  source: "playwright-and-health-probe" | "playwright-only";
}

export interface BackupRestoreEvidence {
  generatedAt: string;
  backupCompletedAt: string;
  restoreVerifiedAt: string;
  rpoHours: number;
  rtoHours: number;
  verifiedBy: string;
  source: "drill" | "placeholder";
  sourceContext: OpsEvidenceSourceContext;
}

export interface ConnectorEvidenceSet {
  generatedAt: string;
  connectors: Array<{
    key: string;
    label: string;
    status: "passed" | "failed";
    lastVerifiedAt: string;
    roundtripMs: number;
    notes?: string;
  }>;
  source: "certification" | "placeholder";
  sourceContext: OpsEvidenceSourceContext;
}

export interface AiEvalEvidence {
  generatedAt: string;
  sampleSize: number;
  suggestionAcceptanceRate: number;
  documentRecallRate: number;
  highRiskAutoExecutionCount: number;
  falsePositiveRate: number;
  source: "evaluation" | "fallback-from-acceptance-report";
  sourceContext: OpsEvidenceSourceContext;
}

export async function collectHealthProbeLatencies(input?: {
  url?: string;
  iterations?: number;
  probeImpl?: (url: string) => Promise<boolean>;
}): Promise<number[]> {
  const url = input?.url ?? process.env.V4_API_HEALTH_URL ?? "http://127.0.0.1:33100/api/health";
  const iterations = input?.iterations ?? 5;
  const probeImpl = input?.probeImpl ?? (async (targetUrl: string) => {
    const result = spawnSync("/usr/bin/curl", ["-s", targetUrl], {
      encoding: "utf8"
    });
    return result.status === 0;
  });
  const latencies: number[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = Date.now();
    try {
      const ok = await probeImpl(url);
      if (!ok) {
        continue;
      }
      latencies.push(Date.now() - startedAt);
    } catch {
      continue;
    }
  }

  return latencies;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
}

function normalizeScenarioName(file: string) {
  const base = file.replace(/\\/g, "/").split("/").pop() ?? file;
  return base
    .replace(/\.(baseline|exceptions|spec|test)\.ts$/, "")
    .replace(/\.ts$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function flattenSuites(suites: PlaywrightSuite[] | undefined, inheritedFile = ""): Array<{ file: string; test: PlaywrightTest }> {
  const items: Array<{ file: string; test: PlaywrightTest }> = [];

  const visitSpec = (spec: PlaywrightSpec, file: string) => {
    for (const test of spec.tests ?? []) {
      items.push({ file, test });
    }
    for (const child of spec.specs ?? []) {
      visitSpec(child, file);
    }
  };

  const visitSuite = (suite: PlaywrightSuite, parentFile: string) => {
    const file = suite.file ?? parentFile;
    for (const spec of suite.specs ?? []) {
      visitSpec(spec, file);
    }
    for (const child of suite.suites ?? []) {
      visitSuite(child, file);
    }
  };

  for (const suite of suites ?? []) {
    visitSuite(suite, inheritedFile);
  }

  return items;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

export function generateLoadEvidence(input: {
  playwrightResults: PlaywrightJson;
  healthProbeLatenciesMs?: number[];
  generatedAt?: string;
}): LoadEvidence {
  const flattened = flattenSuites(input.playwrightResults.suites);
  const durations = flattened
    .flatMap((entry) => (entry.test.results ?? []).filter((result) => result.status === "passed"))
    .map((result) => result.duration ?? 0)
    .filter((value) => value > 0);
  const scenarios = [...new Set(flattened.map((entry) => normalizeScenarioName(entry.file || "unknown")))].sort();
  const probeLatencies = (input.healthProbeLatenciesMs ?? []).filter((value) => value > 0);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    samples: durations.length,
    pageP95Ms: percentile(durations, 0.95),
    apiP95Ms: probeLatencies.length > 0 ? percentile(probeLatencies, 0.95) : 999999,
    errorRate: flattened.length === 0
      ? 1
      : flattened.filter((entry) => (entry.test.results ?? []).some((result) => result.status && result.status !== "passed")).length / flattened.length,
    scenarios,
    source: probeLatencies.length > 0 ? "playwright-and-health-probe" : "playwright-only"
  };
}

export function generateBackupRestoreEvidence(input: {
  generatedAt: string;
  source: BackupRestoreSource;
}): BackupRestoreEvidence {
  if (input.source) {
    return {
      generatedAt: input.generatedAt,
      backupCompletedAt: input.source.backupCompletedAt,
      restoreVerifiedAt: input.source.restoreVerifiedAt,
      rpoHours: input.source.rpoHours,
      rtoHours: input.source.rtoHours,
      verifiedBy: input.source.verifiedBy,
      source: "drill",
      sourceContext: buildSourceContext(input.source.metadata, {
        sourceType: "backup-restore",
        sourceId: "missing-backup-restore-source",
        capturedAt: input.generatedAt,
        summary: "Missing backup restore source context.",
        artifacts: []
      })
    };
  }

  return {
    generatedAt: input.generatedAt,
    backupCompletedAt: input.generatedAt,
    restoreVerifiedAt: input.generatedAt,
    rpoHours: 999,
    rtoHours: 999,
    verifiedBy: "missing evidence: backup/restore drill source file not found",
    source: "placeholder",
    sourceContext: {
      sourceType: "backup-restore",
      sourceId: "missing-backup-restore-source",
      capturedAt: input.generatedAt,
      summary: "Missing backup/restore drill source file; placeholder evidence emitted to preserve failure semantics.",
      artifacts: []
    }
  };
}

export function generateConnectorEvidence(input: {
  generatedAt: string;
  source: ConnectorSource;
}): ConnectorEvidenceSet {
  if (input.source) {
    return {
      generatedAt: input.generatedAt,
      connectors: input.source.connectors,
      source: "certification",
      sourceContext: buildSourceContext(input.source.metadata, {
        sourceType: "connectors",
        sourceId: "missing-connectors-source",
        capturedAt: input.generatedAt,
        summary: "Missing connectors source context.",
        artifacts: []
      })
    };
  }

  return {
    generatedAt: input.generatedAt,
    connectors: [
      { key: "invoice_verify", label: "发票验真", status: "failed", lastVerifiedAt: input.generatedAt, roundtripMs: 0, notes: "missing certification evidence" },
      { key: "bank_api", label: "银行直连", status: "failed", lastVerifiedAt: input.generatedAt, roundtripMs: 0, notes: "missing certification evidence" },
      { key: "tax_export", label: "税务导出", status: "failed", lastVerifiedAt: input.generatedAt, roundtripMs: 0, notes: "missing certification evidence" },
      { key: "ocr", label: "OCR 识别", status: "failed", lastVerifiedAt: input.generatedAt, roundtripMs: 0, notes: "missing certification evidence" }
    ],
    source: "placeholder",
    sourceContext: {
      sourceType: "connectors",
      sourceId: "missing-connectors-source",
      capturedAt: input.generatedAt,
      summary: "Missing connector certification source file; placeholder connector failures emitted.",
      artifacts: []
    }
  };
}

export function generateAiEvalEvidence(input: {
  generatedAt: string;
  source: AiEvalSource;
  acceptanceReport: AcceptanceReportLike;
}): AiEvalEvidence {
  if (input.source) {
    return {
      generatedAt: input.generatedAt,
      sampleSize: input.source.sampleSize,
      suggestionAcceptanceRate: input.source.suggestionAcceptanceRate,
      documentRecallRate: input.source.documentRecallRate,
      highRiskAutoExecutionCount: input.source.highRiskAutoExecutionCount,
      falsePositiveRate: input.source.falsePositiveRate,
      source: "evaluation",
      sourceContext: buildSourceContext(input.source.metadata, {
        sourceType: "ai-evals",
        sourceId: "acceptance-report-fallback",
        capturedAt: input.generatedAt,
        summary: "Missing ai-evals source context.",
        artifacts: []
      })
    };
  }

  const total = input.acceptanceReport.summary?.total ?? 0;
  const passed = input.acceptanceReport.summary?.passed ?? 0;
  const warnings = input.acceptanceReport.warnings?.length ?? 0;
  const degradedAcceptance = total > 0 ? Math.max(0, passed - Math.min(passed, warnings)) / total : 0;
  const recallPenalty = total > 0 ? Math.min(0.5, warnings / total) : 0.5;
  const failed = input.acceptanceReport.summary?.failed ?? 0;

  return {
    generatedAt: input.generatedAt,
    sampleSize: total,
    suggestionAcceptanceRate: degradedAcceptance,
    documentRecallRate: Math.max(0, 0.94 - recallPenalty),
    highRiskAutoExecutionCount: Math.max(1, failed),
    falsePositiveRate: total > 0 ? (failed + warnings) / total : 1,
    source: "fallback-from-acceptance-report",
    sourceContext: {
      sourceType: "ai-evals",
      sourceId: "acceptance-report-fallback",
      capturedAt: input.generatedAt,
      summary: "Missing ai-evals source file; fallback metrics derived from acceptance report warnings and failures.",
      artifacts: [
        {
          kind: "acceptance-report",
          path: "artifacts/v4/baseline/reports/acceptance-report.json"
        }
      ]
    }
  };
}

export async function runProductionEvidenceGeneration(input: {
  repoRoot: string;
  generatedAt?: string;
  healthProbeLatenciesMs?: number[];
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const browserResultsPath = path.join(input.repoRoot, "artifacts", "v4", "baseline", "browser", "results.json");
  const acceptanceReportPath = path.join(input.repoRoot, "artifacts", "v4", "baseline", "reports", "acceptance-report.json");
  const opsSourcesDir = path.join(input.repoRoot, "artifacts", "v4", "baseline", "ops-sources");
  const opsDir = path.join(input.repoRoot, "artifacts", "v4", "baseline", "ops");

  const [playwrightResults, acceptanceReport, backupRestoreSource, connectorSource, aiEvalSource] = await Promise.all([
    readJsonFile<PlaywrightJson>(browserResultsPath),
    readJsonFile<AcceptanceReportLike>(acceptanceReportPath),
    readOptionalJson<BackupRestoreSource>(path.join(opsSourcesDir, "backup-restore.json")),
    readOptionalJson<ConnectorSource>(path.join(opsSourcesDir, "connectors.json")),
    readOptionalJson<AiEvalSource>(path.join(opsSourcesDir, "ai-evals.json"))
  ]);

  const load = generateLoadEvidence({
    playwrightResults,
    healthProbeLatenciesMs: input.healthProbeLatenciesMs ?? await collectHealthProbeLatencies(),
    generatedAt
  });
  const backupRestore = generateBackupRestoreEvidence({
    generatedAt,
    source: backupRestoreSource ? createRenderableBackupRestoreSource(backupRestoreSource) : null
  });
  const connectors = generateConnectorEvidence({
    generatedAt,
    source: connectorSource ? createRenderableConnectorSource(connectorSource) : null
  });
  const aiEvals = generateAiEvalEvidence({
    generatedAt,
    source: aiEvalSource ? createRenderableAiEvalSource(aiEvalSource) : null,
    acceptanceReport
  });

  await mkdir(opsDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(opsDir, "load.json"), JSON.stringify(load, null, 2)),
    writeFile(path.join(opsDir, "backup-restore.json"), JSON.stringify(backupRestore, null, 2)),
    writeFile(path.join(opsDir, "connectors.json"), JSON.stringify(connectors, null, 2)),
    writeFile(path.join(opsDir, "ai-evals.json"), JSON.stringify(aiEvals, null, 2))
  ]);

  return { load, backupRestore, connectors, aiEvals };
}

function parseArgs(argv: string[]) {
  let repoRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo-root") {
      repoRoot = argv[index + 1] ?? repoRoot;
      index += 1;
    }
  }
  return { repoRoot };
}

async function main() {
  const { repoRoot } = parseArgs(process.argv.slice(2));
  await runProductionEvidenceGeneration({ repoRoot });
  const opsDir = path.join(repoRoot, "artifacts", "v4", "baseline", "ops");
  const [load, backupRestore, connectors, aiEvals] = await Promise.all([
    readJsonFile<LoadEvidence>(path.join(opsDir, "load.json")),
    readJsonFile<BackupRestoreEvidence>(path.join(opsDir, "backup-restore.json")),
    readJsonFile<ConnectorEvidenceSet>(path.join(opsDir, "connectors.json")),
    readJsonFile<AiEvalEvidence>(path.join(opsDir, "ai-evals.json"))
  ]);
  process.stdout.write(`${JSON.stringify({
    wrote: ["load.json", "backup-restore.json", "connectors.json", "ai-evals.json"],
    loadSource: load.source,
    backupRestoreSource: backupRestore.source,
    connectorSource: connectors.source,
    aiEvalSource: aiEvals.source
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
