import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type OpsSourceType = "backup-restore" | "connectors" | "ai-evals";

export interface OpsSourceArtifact {
  kind: string;
  path: string;
}

export interface OpsSourceMetadata {
  schemaVersion: string;
  sourceType: OpsSourceType;
  sourceId: string;
  capturedAt: string;
  summary: string;
  artifacts: OpsSourceArtifact[];
}

export interface BackupRestoreSourceInput {
  metadata: OpsSourceMetadata;
  generatedAt: string;
  backupCompletedAt: string;
  restoreVerifiedAt: string;
  rpoHours: number;
  rtoHours: number;
  verifiedBy: string;
}

export interface ConnectorSourceInput {
  metadata: OpsSourceMetadata;
  generatedAt: string;
  connectors: Array<{
    key: string;
    label: string;
    status: "passed" | "failed";
    lastVerifiedAt: string;
    roundtripMs: number;
    notes?: string;
  }>;
}

export interface AiEvalSourceInput {
  metadata: OpsSourceMetadata;
  generatedAt: string;
  sampleSize: number;
  suggestionAcceptanceRate: number;
  documentRecallRate: number;
  highRiskAutoExecutionCount: number;
  falsePositiveRate: number;
}

export const OPS_SOURCE_SCHEMA_VERSION = "2026-07-ops-source-v1";

function assertNonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function assertNumber(value: unknown, field: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function createTemplateMetadata(
  sourceType: OpsSourceType,
  generatedAt: string,
  summary: string,
  artifactKind: string,
  artifactPath: string
): OpsSourceMetadata {
  const dateToken = generatedAt.slice(0, 10);
  return {
    schemaVersion: OPS_SOURCE_SCHEMA_VERSION,
    sourceType,
    sourceId: `${sourceType}-template-${dateToken}`,
    capturedAt: generatedAt,
    summary,
    artifacts: [{ kind: artifactKind, path: artifactPath }]
  };
}

function validateMetadata(metadata: OpsSourceMetadata, sourceType: OpsSourceType) {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(`${sourceType} source metadata must be an object`);
  }
  assertNonEmptyString(metadata.schemaVersion, `${sourceType} source metadata.schemaVersion`);
  if (metadata.sourceType !== sourceType) {
    throw new Error(`${sourceType} source metadata.sourceType must be ${sourceType}`);
  }
  assertNonEmptyString(metadata.sourceId, `${sourceType} source metadata.sourceId`);
  assertNonEmptyString(metadata.capturedAt, `${sourceType} source metadata.capturedAt`);
  assertNonEmptyString(metadata.summary, `${sourceType} source metadata.summary`);
  if (!Array.isArray(metadata.artifacts) || metadata.artifacts.length === 0) {
    throw new Error(`${sourceType} source metadata.artifacts must contain at least one artifact`);
  }
  metadata.artifacts.forEach((artifact, index) => {
    if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
      throw new Error(`${sourceType} source metadata.artifacts[${index}] must be an object`);
    }
    assertNonEmptyString(artifact.kind, `${sourceType} source metadata.artifacts[${index}].kind`);
    assertNonEmptyString(artifact.path, `${sourceType} source metadata.artifacts[${index}].path`);
  });
}

function validateBackupRestoreSourceShape(input: BackupRestoreSourceInput) {
  validateMetadata(input.metadata, "backup-restore");
  if (typeof input.generatedAt !== "string") {
    throw new Error("backup-restore source generatedAt must be a string");
  }
  if (typeof input.backupCompletedAt !== "string") {
    throw new Error("backup-restore source backupCompletedAt must be a string");
  }
  if (typeof input.restoreVerifiedAt !== "string") {
    throw new Error("backup-restore source restoreVerifiedAt must be a string");
  }
  assertNumber(input.rpoHours, "backup-restore source rpoHours");
  assertNumber(input.rtoHours, "backup-restore source rtoHours");
  if (typeof input.verifiedBy !== "string") {
    throw new Error("backup-restore source verifiedBy must be a string");
  }
}

function validateConnectorSourceShape(input: ConnectorSourceInput) {
  validateMetadata(input.metadata, "connectors");
  if (typeof input.generatedAt !== "string") {
    throw new Error("connectors source generatedAt must be a string");
  }
  if (!Array.isArray(input.connectors) || input.connectors.length === 0) {
    throw new Error("connectors source connectors must contain at least one connector result");
  }
  input.connectors.forEach((connector, index) => {
    assertNonEmptyString(connector.key, `connectors source connectors[${index}].key`);
    assertNonEmptyString(connector.label, `connectors source connectors[${index}].label`);
    if (connector.status !== "passed" && connector.status !== "failed") {
      throw new Error(`connectors source connectors[${index}].status must be passed or failed`);
    }
    if (typeof connector.lastVerifiedAt !== "string") {
      throw new Error(`connectors source connectors[${index}].lastVerifiedAt must be a string`);
    }
    assertNumber(connector.roundtripMs, `connectors source connectors[${index}].roundtripMs`);
    if (connector.notes !== undefined) {
      assertNonEmptyString(connector.notes, `connectors source connectors[${index}].notes`);
    }
  });
}

function validateAiEvalSourceShape(input: AiEvalSourceInput) {
  validateMetadata(input.metadata, "ai-evals");
  if (typeof input.generatedAt !== "string") {
    throw new Error("ai-evals source generatedAt must be a string");
  }
  assertNumber(input.sampleSize, "ai-evals source sampleSize");
  assertNumber(input.suggestionAcceptanceRate, "ai-evals source suggestionAcceptanceRate");
  assertNumber(input.documentRecallRate, "ai-evals source documentRecallRate");
  assertNumber(input.highRiskAutoExecutionCount, "ai-evals source highRiskAutoExecutionCount");
  assertNumber(input.falsePositiveRate, "ai-evals source falsePositiveRate");
}

export function validateImportedBackupRestoreSource(input: BackupRestoreSourceInput) {
  validateBackupRestoreSourceShape(input);
  assertNonEmptyString(input.generatedAt, "backup-restore source generatedAt");
  assertNonEmptyString(input.backupCompletedAt, "backup-restore source backupCompletedAt");
  assertNonEmptyString(input.restoreVerifiedAt, "backup-restore source restoreVerifiedAt");
  assertNonEmptyString(input.verifiedBy, "backup-restore source verifiedBy");
}

export function validateImportedConnectorSource(input: ConnectorSourceInput) {
  validateConnectorSourceShape(input);
  assertNonEmptyString(input.generatedAt, "connectors source generatedAt");
  input.connectors.forEach((connector, index) => {
    assertNonEmptyString(connector.lastVerifiedAt, `connectors source connectors[${index}].lastVerifiedAt`);
  });
}

export function validateImportedAiEvalSource(input: AiEvalSourceInput) {
  validateAiEvalSourceShape(input);
  assertNonEmptyString(input.generatedAt, "ai-evals source generatedAt");
}

function getOpsSourcesDir(repoRoot: string) {
  return path.join(repoRoot, "artifacts", "v4", "baseline", "ops-sources");
}

async function writeSourceFile(repoRoot: string, fileName: string, payload: unknown) {
  const dir = getOpsSourcesDir(repoRoot);
  await mkdir(dir, { recursive: true });
  const outputPath = path.join(dir, fileName);
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return outputPath;
}

export function createBackupRestoreTemplate(generatedAt: string): BackupRestoreSourceInput {
  return {
    metadata: createTemplateMetadata(
      "backup-restore",
      generatedAt,
      "fill with completed backup drill context and owning operator",
      "runbook-log",
      "artifacts/v4/baseline/ops-sources/evidence/backup-restore-drill.log"
    ),
    generatedAt,
    backupCompletedAt: "",
    restoreVerifiedAt: "",
    rpoHours: 0,
    rtoHours: 0,
    verifiedBy: "fill-with-operator-or-runbook-id"
  };
}

export function createConnectorTemplate(generatedAt: string): ConnectorSourceInput {
  return {
    metadata: {
      ...createTemplateMetadata(
        "connectors",
        generatedAt,
        "fill with connector certification batch context and target environment",
        "certification-report",
        "artifacts/v4/baseline/ops-sources/evidence/connector-certification.md"
      ),
      sourceId: `connector-certification-template-${generatedAt.slice(0, 10)}`
    },
    generatedAt,
    connectors: [
      { key: "invoice_verify", label: "发票验真", status: "failed", lastVerifiedAt: "", roundtripMs: 0, notes: "fill with certification result" },
      { key: "bank_api", label: "银行直连", status: "failed", lastVerifiedAt: "", roundtripMs: 0, notes: "fill with certification result" },
      { key: "tax_export", label: "税务导出", status: "failed", lastVerifiedAt: "", roundtripMs: 0, notes: "fill with certification result" },
      { key: "ocr", label: "OCR 识别", status: "failed", lastVerifiedAt: "", roundtripMs: 0, notes: "fill with certification result" }
    ]
  };
}

export function createAiEvalTemplate(generatedAt: string): AiEvalSourceInput {
  return {
    metadata: createTemplateMetadata(
      "ai-evals",
      generatedAt,
      "fill with ai evaluation batch summary and sampled scenario scope",
      "eval-report",
      "artifacts/v4/baseline/ops-sources/evidence/ai-evals.jsonl"
    ),
    generatedAt,
    sampleSize: 0,
    suggestionAcceptanceRate: 0,
    documentRecallRate: 0,
    highRiskAutoExecutionCount: 0,
    falsePositiveRate: 0
  };
}

export async function writeBackupRestoreSource(repoRoot: string, input: BackupRestoreSourceInput) {
  validateBackupRestoreSourceShape(input);
  return writeSourceFile(repoRoot, "backup-restore.json", input);
}

export async function writeConnectorSource(repoRoot: string, input: ConnectorSourceInput) {
  validateConnectorSourceShape(input);
  return writeSourceFile(repoRoot, "connectors.json", input);
}

export async function writeAiEvalSource(repoRoot: string, input: AiEvalSourceInput) {
  validateAiEvalSourceShape(input);
  return writeSourceFile(repoRoot, "ai-evals.json", input);
}
