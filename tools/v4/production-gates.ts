import { readFile } from "node:fs/promises";
import path from "node:path";

export type ProductionGate = "load" | "backup-restore" | "connectors" | "ai-evals";

interface GateResult {
  gate: ProductionGate;
  ok: boolean;
  summary: string;
  failures: string[];
  evidencePath?: string;
}

interface LoadEvidence {
  generatedAt: string;
  samples: number;
  pageP95Ms: number;
  apiP95Ms: number;
  errorRate: number;
  scenarios: string[];
}

interface BackupRestoreEvidence {
  generatedAt: string;
  backupCompletedAt: string;
  restoreVerifiedAt: string;
  rpoHours: number;
  rtoHours: number;
  verifiedBy: string;
}

interface ConnectorEvidence {
  key: string;
  label: string;
  status: "passed" | "failed";
  lastVerifiedAt: string;
  roundtripMs: number;
  notes?: string;
}

interface ConnectorsEvidence {
  generatedAt: string;
  connectors: ConnectorEvidence[];
}

interface AiEvalEvidence {
  generatedAt: string;
  sampleSize: number;
  suggestionAcceptanceRate: number;
  documentRecallRate: number;
  highRiskAutoExecutionCount: number;
  falsePositiveRate: number;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseLoadEvidence(raw: unknown): LoadEvidence {
  const value = asRecord(raw, "load evidence");
  const scenarios = value.scenarios;
  if (!Array.isArray(scenarios) || scenarios.some((item) => typeof item !== "string")) {
    throw new Error("load evidence scenarios must be an array of strings");
  }
  return {
    generatedAt: assertString(value.generatedAt, "load evidence generatedAt"),
    samples: assertNumber(value.samples, "load evidence samples"),
    pageP95Ms: assertNumber(value.pageP95Ms, "load evidence pageP95Ms"),
    apiP95Ms: assertNumber(value.apiP95Ms, "load evidence apiP95Ms"),
    errorRate: assertNumber(value.errorRate, "load evidence errorRate"),
    scenarios
  };
}

function parseBackupRestoreEvidence(raw: unknown): BackupRestoreEvidence {
  const value = asRecord(raw, "backup-restore evidence");
  return {
    generatedAt: assertString(value.generatedAt, "backup-restore evidence generatedAt"),
    backupCompletedAt: assertString(value.backupCompletedAt, "backup-restore evidence backupCompletedAt"),
    restoreVerifiedAt: assertString(value.restoreVerifiedAt, "backup-restore evidence restoreVerifiedAt"),
    rpoHours: assertNumber(value.rpoHours, "backup-restore evidence rpoHours"),
    rtoHours: assertNumber(value.rtoHours, "backup-restore evidence rtoHours"),
    verifiedBy: assertString(value.verifiedBy, "backup-restore evidence verifiedBy")
  };
}

function parseConnectorsEvidence(raw: unknown): ConnectorsEvidence {
  const value = asRecord(raw, "connectors evidence");
  if (!Array.isArray(value.connectors)) {
    throw new Error("connectors evidence connectors must be an array");
  }
  return {
    generatedAt: assertString(value.generatedAt, "connectors evidence generatedAt"),
    connectors: value.connectors.map((item, index) => {
      const connector = asRecord(item, `connectors[${index}]`);
      const status = assertString(connector.status, `connectors[${index}].status`);
      if (status !== "passed" && status !== "failed") {
        throw new Error(`connectors[${index}].status must be passed or failed`);
      }
      return {
        key: assertString(connector.key, `connectors[${index}].key`),
        label: assertString(connector.label, `connectors[${index}].label`),
        status,
        lastVerifiedAt: assertString(connector.lastVerifiedAt, `connectors[${index}].lastVerifiedAt`),
        roundtripMs: assertNumber(connector.roundtripMs, `connectors[${index}].roundtripMs`),
        notes: connector.notes === undefined ? undefined : assertString(connector.notes, `connectors[${index}].notes`)
      };
    })
  };
}

function parseAiEvalEvidence(raw: unknown): AiEvalEvidence {
  const value = asRecord(raw, "ai-evals evidence");
  return {
    generatedAt: assertString(value.generatedAt, "ai-evals evidence generatedAt"),
    sampleSize: assertNumber(value.sampleSize, "ai-evals evidence sampleSize"),
    suggestionAcceptanceRate: assertNumber(value.suggestionAcceptanceRate, "ai-evals evidence suggestionAcceptanceRate"),
    documentRecallRate: assertNumber(value.documentRecallRate, "ai-evals evidence documentRecallRate"),
    highRiskAutoExecutionCount: assertNumber(value.highRiskAutoExecutionCount, "ai-evals evidence highRiskAutoExecutionCount"),
    falsePositiveRate: assertNumber(value.falsePositiveRate, "ai-evals evidence falsePositiveRate")
  };
}

export function evaluateProductionGate(gate: ProductionGate, rawEvidence: unknown): GateResult {
  if (gate === "load") {
    const evidence = parseLoadEvidence(rawEvidence);
    const failures: string[] = [];
    // pageP95Ms 取自 e2e 用例时长的 p95(整条场景流程,非单页加载)。默认 2000ms
    // 门槛对多核开发机适用,但 2 核 CI runner 上重型场景用例本就 2-4s,故允许通过
    // V4_LOAD_PAGE_P95_MS 放宽(仍能捕获显著回归)。
    const pageP95ThresholdMs = Number(process.env.V4_LOAD_PAGE_P95_MS) || 2000;
    if (evidence.pageP95Ms > pageP95ThresholdMs) {
      failures.push(`Page P95 ${evidence.pageP95Ms}ms exceeds ${pageP95ThresholdMs}ms threshold`);
    }
    if (evidence.apiP95Ms > 500) {
      failures.push(`API P95 ${evidence.apiP95Ms}ms exceeds 500ms threshold`);
    }
    if (evidence.errorRate > 0.05) {
      failures.push(`Error rate ${formatPercent(evidence.errorRate)} exceeds 5.0% threshold`);
    }
    return {
      gate,
      ok: failures.length === 0,
      summary: `Load gate checked ${evidence.samples} samples; page p95 ${evidence.pageP95Ms}ms, api p95 ${evidence.apiP95Ms}ms, error rate ${formatPercent(evidence.errorRate)}.`,
      failures
    };
  }

  if (gate === "backup-restore") {
    const evidence = parseBackupRestoreEvidence(rawEvidence);
    const failures: string[] = [];
    if (evidence.rpoHours > 24) {
      failures.push(`RPO ${evidence.rpoHours}h exceeds 24h threshold`);
    }
    if (evidence.rtoHours > 4) {
      failures.push(`RTO ${evidence.rtoHours}h exceeds 4h threshold`);
    }
    return {
      gate,
      ok: failures.length === 0,
      summary: `Backup/restore gate verified by ${evidence.verifiedBy}; RPO ${evidence.rpoHours}h, RTO ${evidence.rtoHours}h.`,
      failures
    };
  }

  if (gate === "connectors") {
    const evidence = parseConnectorsEvidence(rawEvidence);
    const failures: string[] = [];
    for (const connector of evidence.connectors) {
      if (connector.status !== "passed") {
        failures.push(`Connector ${connector.key} is ${connector.status}`);
        if (connector.notes) {
          failures.push(`Connector ${connector.key} note: ${connector.notes}`);
        }
      }
    }
    return {
      gate,
      ok: failures.length === 0,
      summary: `Connector gate checked ${evidence.connectors.length} connectors.`,
      failures
    };
  }

  const evidence = parseAiEvalEvidence(rawEvidence);
  const failures: string[] = [];
  if (evidence.suggestionAcceptanceRate < 0.85) {
    failures.push(`Suggestion acceptance rate ${formatPercent(evidence.suggestionAcceptanceRate)} is below 85.0% threshold`);
  }
  if (evidence.documentRecallRate < 0.95) {
    failures.push(`Document recall rate ${formatPercent(evidence.documentRecallRate)} is below 95.0% threshold`);
  }
  if (evidence.highRiskAutoExecutionCount > 0) {
    failures.push(`High-risk auto execution count ${evidence.highRiskAutoExecutionCount} must be 0`);
  }
  return {
    gate,
    ok: failures.length === 0,
    summary: `AI eval gate checked ${evidence.sampleSize} samples; acceptance rate ${formatPercent(evidence.suggestionAcceptanceRate)}, recall ${formatPercent(evidence.documentRecallRate)}, false positive ${formatPercent(evidence.falsePositiveRate)}.`,
    failures
  };
}

export function resolveEvidencePath(repoRoot: string, gate: ProductionGate) {
  return path.join(repoRoot, "artifacts", "v4", "baseline", "ops", `${gate}.json`);
}

export async function runProductionGate(input: {
  repoRoot: string;
  gate: ProductionGate;
}): Promise<GateResult> {
  const evidencePath = resolveEvidencePath(input.repoRoot, input.gate);
  let rawText: string;
  try {
    rawText = await readFile(evidencePath, "utf8");
  } catch (error) {
    throw new Error(`missing evidence for ${input.gate}: ${evidencePath}`, { cause: error });
  }

  const result = evaluateProductionGate(input.gate, JSON.parse(rawText));
  return {
    ...result,
    evidencePath
  };
}

function parseArgs(argv: string[]) {
  const [gateArg, ...rest] = argv;
  if (gateArg !== "load" && gateArg !== "backup-restore" && gateArg !== "connectors" && gateArg !== "ai-evals") {
    throw new Error("usage: production-gates.ts <load|backup-restore|connectors|ai-evals> [--repo-root <path>]");
  }
  let repoRoot = process.cwd();
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--repo-root") {
      repoRoot = rest[index + 1] ?? repoRoot;
      index += 1;
    }
  }
  return {
    gate: gateArg as ProductionGate,
    repoRoot
  };
}

async function main() {
  try {
    const { gate, repoRoot } = parseArgs(process.argv.slice(2));
    const result = await runProductionGate({ gate, repoRoot });
    const output = {
      gate: result.gate,
      ok: result.ok,
      summary: result.summary,
      failures: result.failures,
      evidencePath: result.evidencePath
    };
    const stream = result.ok ? process.stdout : process.stderr;
    stream.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
